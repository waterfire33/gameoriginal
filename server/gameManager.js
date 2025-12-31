const { v4: uuidv4 } = require('uuid');
const http = require('http');

class GameManager {
  constructor() {
    this.games = new Map(); // roomCode -> Game instance
    this.playerSocketMap = new Map(); // socketId -> { roomCode, playerId }
  }

  createGame(gameName, hostSocketId, hostName, settings = {}, emitFunction = null, debugMode = false) {
    const roomCode = this.generateRoomCode();
    this.games.set(roomCode, new Game(roomCode, gameName, hostSocketId, hostName, settings, emitFunction, debugMode));
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
  constructor(roomCode, name, hostSocketId, hostName, settings = {}, emitFunction = null, debugMode = false) {
    this.id = uuidv4();
    this.roomCode = roomCode;
    this.name = name;

    // Host metadata only (host does not play)
    this.hostSocketId = hostSocketId;
    this.hostName = hostName;

    // Configurable game settings
    this.settings = {
      maxRounds: settings.maxRounds || 3,
      answerTime: settings.answerTime || 60, // seconds
      voteTime: settings.voteTime || 30,    // seconds
      intermissionTime: settings.intermissionTime || 10, // seconds
      gameMode: settings.gameMode || 'classic', // classic, speed, creative
      votingMode: settings.votingMode || 'individual', // individual, pairs
      ...settings
    };

    this.players = [];
    this.hostId = null; // kept for compatibility but unused for gameplay
    this.leaderId = null; // first player to join; controls game start
    this.state = 'waiting'; // waiting, answering, intermission, voting, results
    this.round = 0;

    this.emit = emitFunction;
    this.debugMode = debugMode;
    this.botsCount = 0;

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

  addPlayer(name, socketId, isHost = false, isBot = false) {
    // Host no longer joins as a player; only real players are kept here
    const player = {
      id: uuidv4(),
      name,
      socketId,
      score: 0,
      isHost: false,
      isLeader: false,
      isConnected: true,
      isBot,
    };

    this.players.push(player);

    // First player to join becomes leader
    if (!this.leaderId) {
      this.leaderId = player.id;
      player.isLeader = true;
    }

    return player;
  }

  addBot() {
    if (!this.debugMode) return null;
    if (this.players.length >= 8) return null; // Max players
    this.botsCount++;
    const botName = `Bot ${this.botsCount}`;
    return this.addPlayer(botName, null, false, true);
  }

  removeBot() {
    if (!this.debugMode) return;
    const bots = this.players.filter(p => p.isBot);
    if (bots.length === 0) return;
    const lastBot = bots[bots.length - 1];
    this.removePlayer(lastBot.id);
    this.botsCount--;
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
    this.startTimer('answer', this.settings.answerTime);
  }

  async loadPromptsFromAIIfNeeded() {
    if (this.prompts && this.prompts.length > 0) {
      return;
    }

    try {
      const aiText = await fetchPromptsFromLocalAI(this.settings.cefrLevel || 'B1');

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

      // Validate and filter prompts
      const validPrompts = parsed
        .map(text => String(text).trim())
        .filter(text => text.length > 0 && text.length < 100 && text.endsWith('______'))
        .slice(0, 20); // Limit to 20

      if (validPrompts.length < 5) {
        console.warn('Too few valid prompts from AI; falling back to defaults.');
        this.prompts = this.generateFallbackPrompts();
        return;
      }

      this.prompts = validPrompts.map((text, index) => ({
        id: index + 1,
        text,
      }));
    } catch (err) {
      console.error('Failed to load prompts from local AI; using fallback prompts instead.', err);
      this.prompts = this.generateFallbackPrompts();
    }
  }

  generateFallbackPrompts() {
    // Static backup prompt database if the local AI is unavailable - Quiplash-style
    return [
      { id: 1, text: 'A terrible name for a dog: ______' },
      { id: 2, text: 'A terrible name for a cat: ______' },
      { id: 3, text: 'The worst superpower: ______' },
      { id: 4, text: 'An awful flavor of ice cream: ______' },
      { id: 5, text: 'The most useless invention: ______' },
      { id: 6, text: 'Worst pickup line: ______' },
      { id: 7, text: 'A horrible movie title: ______' },
      { id: 8, text: 'The worst job in the world: ______' },
      { id: 9, text: 'An embarrassing tattoo: ______' },
      { id: 10, text: 'The lamest excuse for being late: ______' },
      { id: 11, text: 'A ridiculous superhero name: ______' },
      { id: 12, text: 'The worst gift to give someone: ______' },
      { id: 13, text: 'An awful band name: ______' },
      { id: 14, text: 'The most boring hobby: ______' },
      { id: 15, text: 'A terrible restaurant name: ______' },
      { id: 16, text: 'Worst thing to say at a wedding: ______' },
      { id: 17, text: 'An ugly hat: ______' },
      { id: 18, text: 'The most annoying sound: ______' },
      { id: 19, text: 'A horrible vacation spot: ______' },
      { id: 20, text: 'The worst magic trick: ______' },
    ];
  }

  assignPrompts() {
    // Quiplash-style: Assign the same shared prompt to all players
    const sharedPrompt = this.prompts[Math.floor(Math.random() * this.prompts.length)];
    const prompts = [];

    this.players.forEach((player) => {
      prompts.push({
        playerId: player.id,
        promptId: sharedPrompt.id,
        text: sharedPrompt.text,
        variant: 'A', // Shared, no variation needed
      });
    });

    return prompts;
  }

  async simulateBotAnswers() {
    if (!this.debugMode) return;
    console.log(`Simulating answers for ${this.players.filter(p => p.isBot).length} bots`);
    const botPromises = [];
    this.players.forEach(player => {
      if (player.isBot) {
        const prompt = this.currentPrompts.find(p => p.playerId === player.id);
        if (prompt) {
          const promise = generateBotAnswer(prompt.text, this.settings.cefrLevel || 'B1').then(answer => {
            this.submitAnswer(player.id, prompt.promptId, answer);
            console.log(`Bot ${player.name} submitted: ${answer}`);
          });
          botPromises.push(promise);
        }
      }
    });
    await Promise.all(botPromises);
  }

   submitAnswer(playerId, promptId, answer) {
      this.answers.set(playerId, { promptId, answer, timestamp: Date.now() });

      if (this.allAnswersSubmitted()) {
        this.clearTimer('answer');
        this.startVotingPhase();
      }
    }

  allAnswersSubmitted() {
    return this.answers.size === this.players.length;
  }

  startVotingPhase() {
    let votingData;
    if (this.settings.votingMode === 'pairs') {
      const pairs = this.createAnswerPairs();
      votingData = { mode: 'pairs', pairs };
    } else if (this.settings.votingMode === 'thriples') {
      const thriples = this.createThriplesVoting();
      votingData = { mode: 'thriples', thriples };
    } else {
      const answers = this.createIndividualVoting();
      votingData = { mode: 'individual', answers };
    }
    this.simulateBotVotes(votingData);
    return votingData;
  }

  createIndividualVoting() {
    // Collect all answers and shuffle for fair display
    const allAnswers = Array.from(this.answers.entries()).map(([playerId, answerData]) => ({
      playerId,
      name: this.getPlayer(playerId).name,
      answer: answerData.answer,
      promptText: this.prompts.find(p => p.id === answerData.promptId)?.text || '',
    }));

    // Shuffle answers
    for (let i = allAnswers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
    }

    this.votingAnswers = allAnswers;
    this.state = 'voting';
    this.startTimer('vote', this.settings.voteTime);

    return allAnswers;
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
    this.startTimer('vote', this.settings.voteTime);

    return this.votingPairs;
  }

  createThriplesVoting() {
    this.votingThriples = [];
    const answersArray = Array.from(this.answers.entries());

    // Shuffle and group in threes
    const shuffled = answersArray.sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 3) {
      const group = shuffled.slice(i, i + 3);
      if (group.length >= 2) { // At least 2 for voting
        const tripleId = uuidv4();
        const promptId = group[0][1].promptId;
        const prompt = this.prompts.find((p) => p.id === promptId) || null;
        const promptText = prompt ? prompt.text : '';

        const answers = group.map(([playerId, answerData]) => ({
          id: playerId,
          name: this.getPlayer(playerId).name,
          answer: answerData.answer,
        }));

        this.votingThriples.push({
          id: tripleId,
          promptId,
          promptText,
          answers,
        });
      }
    }

    this.state = 'voting';
    this.startTimer('vote', this.settings.voteTime);

    return this.votingThriples;
  }

  simulateBotVotes(votingData) {
    if (!this.debugMode) return;
    this.players.forEach(player => {
      if (player.isBot) {
        let voteId;
        if (votingData.mode === 'pairs') {
          const pairs = votingData.pairs;
          voteId = pairs[Math.floor(Math.random() * pairs.length)].id;
        } else if (votingData.mode === 'thriples') {
          const thriples = votingData.thriples;
          const triple = thriples[Math.floor(Math.random() * thriples.length)];
          voteId = triple.answers[Math.floor(Math.random() * triple.answers.length)].id;
        } else {
          const answers = votingData.answers;
          voteId = answers[Math.floor(Math.random() * answers.length)].playerId;
        }
        this.submitVote(player.id, voteId);
        console.log(`Bot ${player.name} voted for: ${voteId}`);
      }
    });
  }

  simulateBotTiebreakerVotes(tiedAnswers, tiedPlayerIds) {
    if (!this.debugMode) return;
    this.players.forEach(player => {
      if (player.isBot && tiedPlayerIds.includes(player.id)) {
        const voteId = tiedAnswers[Math.floor(Math.random() * tiedAnswers.length)].playerId;
        this.submitVote(player.id, voteId);
        console.log(`Bot ${player.name} tiebreaker voted for: ${voteId}`);
      }
    });
  }

   submitVote(playerId, voteId) {
      // Check if player is allowed to vote in tiebreaker
      if (this.state === 'tiebreaker' && !this.tiebreakerPlayers.includes(playerId)) {
        return; // Ignore vote from non-tied player
      }

      this.votes.set(playerId, voteId);

      if (this.allVotesSubmitted()) {
        if (this.state === 'tiebreaker') {
          this.clearTimer('tiebreaker');
        } else {
          this.clearTimer('vote');
        }
      }
    }

  allVotesSubmitted() {
    if (this.state === 'tiebreaker') {
      return this.votes.size === this.tiebreakerPlayers.length;
    }
    return this.votes.size === this.players.length;
  }

  calculateResults() {
    const voteCounts = new Map();

    // Count votes (voteId is now playerId)
    this.votes.forEach((voteId) => {
      voteCounts.set(voteId, (voteCounts.get(voteId) || 0) + 1);
    });

    // Find the maximum vote count
    let maxVotes = 0;
    voteCounts.forEach((count) => {
      if (count > maxVotes) maxVotes = count;
    });

    // Find all players with max votes (potential winners)
    const winners = [];
    voteCounts.forEach((count, playerId) => {
      if (count === maxVotes) winners.push(playerId);
    });

    if (winners.length === 1) {
      // Single winner
      const winner = this.getPlayer(winners[0]);
      if (winner) winner.score += maxVotes;

      this.state = 'results';
      return this.buildResultsData(voteCounts);
    } else {
      // Tie - start tiebreaker
      this.startTiebreaker(winners, voteCounts);
      return null; // Don't emit results yet
    }
  }

  buildResultsData(voteCounts) {
    // Build results based on voting mode
    let answers = [];
    if (this.settings.votingMode === 'pairs') {
      answers = this.votingPairs.flatMap(pair => [
        { playerId: pair.player1.id, name: pair.player1.name, answer: pair.player1.answer, votes: voteCounts.get(pair.player1.id) || 0 },
        { playerId: pair.player2.id, name: pair.player2.name, answer: pair.player2.answer, votes: voteCounts.get(pair.player2.id) || 0 }
      ]);
    } else {
      answers = this.votingAnswers.map(ans => ({
        ...ans,
        votes: voteCounts.get(ans.playerId) || 0
      }));
    }

    return {
      answers,
      scores: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
      votingMode: this.settings.votingMode
    };
  }

  startTiebreaker(tiedPlayerIds, previousVoteCounts) {
    // Collect tied answers
    const tiedAnswers = [];
    tiedPlayerIds.forEach(playerId => {
      const player = this.getPlayer(playerId);
      const answerData = this.answers.get(playerId);
      if (player && answerData) {
        tiedAnswers.push({
          playerId,
          name: player.name,
          answer: answerData.answer,
          previousVotes: previousVoteCounts.get(playerId) || 0
        });
      }
    });

    // Shuffle tied answers
    for (let i = tiedAnswers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiedAnswers[i], tiedAnswers[j]] = [tiedAnswers[j], tiedAnswers[i]];
    }

    this.tiebreakerAnswers = tiedAnswers;
    this.tiebreakerPlayers = tiedPlayerIds;
    this.state = 'tiebreaker';

    // Clear previous votes and start new voting
    this.votes.clear();
    this.startTimer('tiebreaker', this.settings.voteTime);

    // Emit tiebreaker voting to all players
    if (this.emit) {
      this.emit('tiebreaker-voting', {
        tiedAnswers,
        allowedVoters: tiedPlayerIds
      });
    }

    // Simulate bot votes for tiebreaker
    this.simulateBotTiebreakerVotes(tiedAnswers, tiedPlayerIds);
  }

  calculateTiebreakerResults() {
    const voteCounts = new Map();

    // Count tiebreaker votes
    this.votes.forEach((voteId) => {
      voteCounts.set(voteId, (voteCounts.get(voteId) || 0) + 1);
    });

    // Find max votes in tiebreaker
    let maxVotes = 0;
    voteCounts.forEach((count) => {
      if (count > maxVotes) maxVotes = count;
    });

    // Find winners (may still have ties, but split points)
    const winners = [];
    voteCounts.forEach((count, playerId) => {
      if (count === maxVotes) winners.push(playerId);
    });

    // Award points (split if still tied)
    const pointsPerWinner = Math.floor(maxVotes / winners.length);
    winners.forEach(playerId => {
      const player = this.getPlayer(playerId);
      if (player) player.score += pointsPerWinner;
    });

    this.state = 'results';
    return this.buildTiebreakerResultsData(voteCounts, winners);
  }

  buildTiebreakerResultsData(voteCounts, winners) {
    const answers = this.tiebreakerAnswers.map(ans => ({
      ...ans,
      votes: voteCounts.get(ans.playerId) || 0,
      isWinner: winners.includes(ans.playerId)
    }));

    return {
      answers,
      scores: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
      votingMode: this.settings.votingMode,
      wasTiebreaker: true
    };
  }

  startNextRound() {
    if (this.round >= this.settings.maxRounds) {
      this.state = 'finished';
      return false;
    }

    this.round++;
    this.state = 'intermission';
    this.startTimer('intermission', this.settings.intermissionTime);

    return true;
  }

  startAnsweringPhase() {
    this.state = 'answering';
    this.currentPrompts = this.assignPrompts();
    this.startTimer('answer', this.settings.answerTime);
    this.simulateBotAnswers();
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

    // Emit timer start for client countdown
    if (this.emit) {
      this.emit('timer-start', { phase: timerName, duration: seconds });
    }
  }

  handleTimerEnd(timerName) {
    this.clearTimer(timerName);

    if (timerName === 'intermission' && this.state === 'intermission') {
      this.startAnsweringPhase();
      if (this.emit) {
        this.emit('start-answering', {
          round: this.round,
          maxRounds: this.settings.maxRounds,
          prompts: this.getCurrentPrompts(),
        });
      }
    } else if (timerName === 'answer' && this.state === 'answering') {
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
      maxRounds: this.settings.maxRounds,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isLeader: !!p.isLeader,
        isConnected: p.isConnected !== false,
        isBot: !!p.isBot,
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

// --- Bot answer generation helpers ---

async function generateBotAnswer(prompt, cefrLevel = 'B1') {
  try {
    const payload = JSON.stringify({
      model: 'llama3.2:3b',
      prompt: `Generate a short, funny answer to this prompt: "${prompt}". Use vocabulary appropriate for CEFR level ${cefrLevel}. Keep it under 50 characters.`,
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

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk.toString());
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json && typeof json.response === 'string') {
              resolve(json.response.trim());
            } else {
              reject(new Error('Unexpected AI response shape.'));
            }
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Bot answer AI request timeout'));
      });
      req.write(payload);
      req.end();
    });

    return response || 'Funny answer!';
  } catch (err) {
    console.error('Failed to generate bot answer:', err);
    return 'Funny answer!';
  }
}

// --- Local AI integration helpers ---

/**
 * Ask the local LLaMA model ("llama3.2:3b") to generate a list of prompts at the specified CEFR level.
 *
 * Expected behavior: the model should return either a JSON array of strings,
 * or a newline-separated list of prompts. The Game class will normalize the
 * result in loadPromptsFromAIIfNeeded().
 */
function fetchPromptsFromLocalAI(cefrLevel = 'B1') {
  const payload = JSON.stringify({
    model: 'llama3.2:3b',
    prompt:
      `Generate 20 absurd, hilarious Quiplash-style prompts. Each must be a short, ridiculous fill-in-the-blank question or statement ending with '______' for players to fill in, like 'The worst ice cream flavor: ______' or 'A terrible name for a cat: ______'. Make them funny and over-the-top. Use vocabulary appropriate for CEFR level ${cefrLevel}. Return ONLY a valid JSON array of strings, e.g., ["prompt1", "prompt2"]. No extra text or explanations.`,
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

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('AI request timeout after 10 seconds'));
    });

    req.write(payload);
    req.end();
  });
}
