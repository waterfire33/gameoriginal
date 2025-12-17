const { v4: uuidv4 } = require('uuid');
const http = require('http');

class GameManager {
  constructor() {
    this.games = new Map(); // roomCode -> Game instance
    this.playerSocketMap = new Map(); // socketId -> { roomCode, playerId }
  }

  createGame(gameName, hostSocketId, hostName) {
    const roomCode = this.generateRoomCode();
    this.games.set(roomCode, new Game(roomCode, gameName, hostSocketId, hostName));
    return roomCode;
  }

  getPlayerInfo(socketId) {
    return this.playerSocketMap.get(socketId) || null;
  }

  getGame(roomCode) {
    return this.games.get(roomCode);
  }

  addPlayer(roomCode, playerName, socketId, isHost = false) {
    const game = this.games.get(roomCode);
    if (!game) return null;

    // If a player with this name is already in the game but disconnected,
    // treat this as a reconnection: reuse the same player slot.
    const existing = game.getPlayerByName(playerName);
    let player;
    if (existing && !existing.isConnected) {
      existing.socketId = socketId;
      existing.isConnected = true;
      player = existing;
    } else {
      player = game.addPlayer(playerName, socketId, isHost);
    }

    this.playerSocketMap.set(socketId, { roomCode, playerId: player.id });

    return player;
  }

  handleDisconnect(socketId) {
    const playerInfo = this.playerSocketMap.get(socketId);
    if (!playerInfo) return;

    const game = this.games.get(playerInfo.roomCode);
    if (game) {
      const player = game.getPlayer(playerInfo.playerId);
      if (player) {
        player.isConnected = false;
      }
      // IMPORTANT: Do NOT delete the game or remove the player record here.
      // This allows players to reconnect (same name) and reclaim their slot.
    }

    this.playerSocketMap.delete(socketId);
  }

  generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }
    return code;
  }
}

class Game {
  constructor(roomCode, name, hostSocketId, hostName) {
    this.id = uuidv4();
    this.roomCode = roomCode;
    this.name = name;

    // Host metadata only (host does not play)
    this.hostSocketId = hostSocketId;
    this.hostName = hostName;

    this.players = [];
    this.hostId = null; // kept for compatibility but unused for gameplay
    this.leaderId = null; // first player to join; controls game start
    this.state = 'waiting'; // waiting, answering, voting, results
    this.round = 0;
    this.maxRounds = 3;

    // Game data
    // Prompts are lazily loaded from the local AI model on first game start.
    this.prompts = [];
    this.currentPrompts = [];
    this.answers = new Map(); // playerId -> { promptId, answer }
    this.votes = new Map(); // playerId -> voteId
    this.votingPairs = [];

    // Timers
    this.timers = new Map();
  }

  addPlayer(name, socketId, isHost = false) {
    // Host no longer joins as a player; only real players are kept here
    const player = {
      id: uuidv4(),
      name,
      socketId,
      score: 0,
      isHost: false,
      isLeader: false,
      isConnected: true,
    };

    this.players.push(player);

    // First player to join becomes leader
    if (!this.leaderId) {
      this.leaderId = player.id;
      player.isLeader = true;
    }

    return player;
  }

  // Hard removal of a player (not used on disconnect anymore, but kept for
  // potential future admin/kick features).
  removePlayer(playerId) {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.answers.delete(playerId);
    this.votes.delete(playerId);

    // If the leader leaves, assign the first remaining player as new leader
    if (this.leaderId === playerId) {
      this.leaderId = this.players.length > 0 ? this.players[0].id : null;
      this.players.forEach((p, index) => {
        p.isLeader = index === 0;
      });
    }
  }

  async startGame() {
    // Ensure prompts are loaded from the local AI before the first round.
    await this.loadPromptsFromAIIfNeeded();

    this.state = 'answering';
    this.round = 1;
    this.currentPrompts = this.assignPrompts();
    this.startTimer('answer', 60); // 60 seconds to answer
  }

  async loadPromptsFromAIIfNeeded() {
    if (this.prompts && this.prompts.length > 0) {
      return;
    }

    try {
      const aiText = await fetchPromptsFromLocalAI();

      let parsed;
      try {
        // Prefer strict JSON output from the model
        parsed = JSON.parse(aiText);
      } catch (e) {
        // Fallback: treat the response as a newline-separated list
        parsed = aiText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => !!line && !line.startsWith('#'));
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn('Local AI returned no usable prompts; falling back to defaults.');
        this.prompts = this.generateFallbackPrompts();
        return;
      }

      this.prompts = parsed.map((text, index) => ({
        id: index + 1,
        text: String(text),
      }));
    } catch (err) {
      console.error('Failed to load prompts from local AI; using fallback prompts instead.', err);
      this.prompts = this.generateFallbackPrompts();
    }
  }

  generateFallbackPrompts() {
    // Static backup prompt database if the local AI is unavailable
    return [
      { id: 1, text: 'A terrible name for a dog: ______' },
      { id: 2, text: 'A terrible name for a cat: ______' },
      { id: 3, text: 'The worst superpower: ______' },
      { id: 4, text: 'An awful flavor of ice cream: ______' },
      // Add more prompts
    ];
  }

  assignPrompts() {
    // Quiplash-style: Assign different prompt variations
    const prompts = [];
    const usedPrompts = new Set();

    this.players.forEach((player) => {
      let prompt;
      do {
        prompt = this.prompts[Math.floor(Math.random() * this.prompts.length)];
      } while (usedPrompts.has(prompt.id));

      usedPrompts.add(prompt.id);
      prompts.push({
        playerId: player.id,
        promptId: prompt.id,
        text: prompt.text,
        variant: Math.random() > 0.5 ? 'A' : 'B', // For Quiplash-style variants
      });
    });

    return prompts;
  }

  submitAnswer(playerId, promptId, answer) {
    this.answers.set(playerId, { promptId, answer, timestamp: Date.now() });

    if (this.allAnswersSubmitted()) {
      this.clearTimer('answer');
    }
  }

  allAnswersSubmitted() {
    return this.answers.size === this.players.length;
  }

  createAnswerPairs() {
    this.votingPairs = [];
    const answersArray = Array.from(this.answers.entries());

    // Shuffle and pair answers
    for (let i = 0; i < answersArray.length; i += 2) {
      if (i + 1 < answersArray.length) {
        const [playerId1, answer1] = answersArray[i];
        const [playerId2, answer2] = answersArray[i + 1];

        const pairId = uuidv4();

        // Look up the original prompt text using the promptId from the first answer
        const prompt = this.prompts.find((p) => p.id === answer1.promptId) || null;
        const promptText = prompt ? prompt.text : '';

        this.votingPairs.push({
          id: pairId,
          promptId: answer1.promptId,
          promptText,
          player1: {
            id: playerId1,
            name: this.getPlayer(playerId1).name,
            answer: answer1.answer,
          },
          player2: {
            id: playerId2,
            name: this.getPlayer(playerId2).name,
            answer: answer2.answer,
          },
        });
      }
    }

    this.state = 'voting';
    this.startTimer('vote', 30); // 30 seconds to vote

    return this.votingPairs;
  }

  submitVote(playerId, voteId) {
    this.votes.set(playerId, voteId);

    if (this.allVotesSubmitted()) {
      this.clearTimer('vote');
    }
  }

  allVotesSubmitted() {
    return this.votes.size === this.players.length;
  }

  calculateResults() {
    const voteCounts = new Map();

    // Count votes
    this.votes.forEach((voteId) => {
      voteCounts.set(voteId, (voteCounts.get(voteId) || 0) + 1);
    });

    // Update scores
    this.votingPairs.forEach((pair) => {
      const votes = voteCounts.get(pair.id) || 0;
      const player1 = this.getPlayer(pair.player1.id);
      const player2 = this.getPlayer(pair.player2.id);

      if (player1) player1.score += votes;
      if (player2) player2.score += votes;
    });

    this.state = 'results';
    return {
      pairs: this.votingPairs.map((pair) => ({
        ...pair,
        votes: voteCounts.get(pair.id) || 0,
      })),
      scores: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    };
  }

  startNextRound() {
    if (this.round >= this.maxRounds) {
      this.state = 'finished';
      return false;
    }

    this.round++;
    this.state = 'answering';
    this.currentPrompts = this.assignPrompts();
    this.answers.clear();
    this.votes.clear();
    this.votingPairs = [];

    return true;
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getPlayerByName(name) {
    return this.players.find((p) => p.name === name);
  }

  startTimer(timerName, seconds) {
    this.clearTimer(timerName);

    this.timers.set(timerName, {
      start: Date.now(),
      duration: seconds * 1000,
      endTime: Date.now() + seconds * 1000,
      interval: setInterval(() => {
        const timer = this.timers.get(timerName);
        if (!timer) return;
        const remaining = Math.max(0, timer.endTime - Date.now());
        if (remaining <= 0) {
          this.handleTimerEnd(timerName);
        }
      }, 1000),
    });
  }

  handleTimerEnd(timerName) {
    this.clearTimer(timerName);

    if (timerName === 'answer' && this.state === 'answering') {
      // Auto-submit random answers for players who didn't answer
      this.players.forEach((player) => {
        if (!this.answers.has(player.id)) {
          const promptForPlayer = this.currentPrompts.find((p) => p.playerId === player.id);
          this.submitAnswer(
            player.id,
            promptForPlayer ? promptForPlayer.promptId : null,
            '(No answer submitted)'
          );
        }
      });

      if (this.allAnswersSubmitted()) {
        this.createAnswerPairs();
      }
    }
  }

  clearTimer(timerName) {
    const timer = this.timers.get(timerName);
    if (timer && timer.interval) {
      clearInterval(timer.interval);
    }
    this.timers.delete(timerName);
  }

  getState() {
    const leader = this.leaderId ? this.getPlayer(this.leaderId) : null;

    return {
      roomCode: this.roomCode,
      name: this.name,
      state: this.state,
      round: this.round,
      maxRounds: this.maxRounds,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isLeader: !!p.isLeader,
        isConnected: p.isConnected !== false,
      })),
      leaderId: this.leaderId,
      leaderName: leader ? leader.name : null,
      answersSubmitted: this.answers.size,
      totalPlayers: this.players.length,
      currentPrompts: this.state === 'answering' ? this.currentPrompts : [],
    };
  }

  getCurrentPrompts() {
    return this.currentPrompts;
  }

  getRemainingAnswers() {
    return this.players.length - this.answers.size;
  }

  getRemainingVotes() {
    return this.players.length - this.votes.size;
  }

  getFinalScores() {
    return this.players
      .map((p) => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = GameManager;

// --- Local AI integration helpers ---

/**
 * Ask the local LLaMA model ("llama3.2:3b") to generate a list of prompts.
 *
 * Expected behavior: the model should return either a JSON array of strings,
 * or a newline-separated list of prompts. The Game class will normalize the
 * result in loadPromptsFromAIIfNeeded().
 */
function fetchPromptsFromLocalAI() {
  const payload = JSON.stringify({
    model: 'llama3.2:3b',
    prompt:
      'You are helping generate funny party-game prompts similar to Quiplash. ' +
      'Return ONLY a JSON array of 20 short prompt strings, no explanations, no extra text.',
    stream: false,
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk.toString();
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json && typeof json.response === 'string') {
            resolve(json.response.trim());
          } else {
            reject(new Error('Unexpected response shape from local AI.'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}
