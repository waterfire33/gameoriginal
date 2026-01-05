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
    this.state = 'waiting'; // waiting, answering, intermission, voting, results
    this.round = 0;

    this.emit = emitFunction;
    this.debugMode = debugMode;
    this.botsCount = 0;

    // Game data
    // Prompts are lazily loaded from the local AI model on first game start.
    this.prompts = [];
    this.currentPrompts = [];
    this.answers = new Map(); // playerId -> Map(promptId -> { promptId, answer, timestamp })
    this.votes = new Map(); // playerId -> voteId (or array of voteIds for R3)
    this.votingMatches = [];
    this.currentMatchIndex = 0;

    // Timers
    this.timers = new Map();
  }

  addPlayer(name, socketId, isHost = false, isBot = false) {
    const player = {
      id: uuidv4(),
      name,
      socketId,
      score: 0,
      isConnected: true,
      isBot,
    };

    this.players.push(player);
    return player;
  }

  addBot() {
    if (this.players.length >= 8) return null; 
    this.botsCount++;
    const botName = `Bot ${this.botsCount}`;
    return this.addPlayer(botName, null, false, true);
  }

  removeBot() {
    const bots = this.players.filter(p => p.isBot);
    if (bots.length === 0) return;
    const lastBot = bots[bots.length - 1];
    this.removePlayer(lastBot.id);
    this.botsCount--;
  }

  removePlayer(playerId) {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.answers.delete(playerId);
    this.votes.delete(playerId);
  }

  async startGame() {
    await this.loadPromptsFromAIIfNeeded();
    this.round = 1;
    this.startAnsweringPhase();
  }

  async loadPromptsFromAIIfNeeded() {
    if (this.prompts && this.prompts.length > 0) return;

    try {
      // Increased to 50 to support N prompts per round logic
      const aiText = await fetchPromptsFromLocalAI(this.settings.cefrLevel || 'B1');
      let parsed;
      try {
        parsed = JSON.parse(aiText);
      } catch (e) {
        parsed = aiText.split('\n').map((line) => line.trim()).filter((line) => !!line);
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.prompts = this.generateFallbackPrompts();
        return;
      }

      const validPrompts = parsed
        .map(text => String(text).trim())
        .filter(text => text.length > 0 && text.length < 100 && text.endsWith('______'))
        .slice(0, 50);

      if (validPrompts.length < 5) {
        this.prompts = this.generateFallbackPrompts();
        return;
      }

      this.prompts = validPrompts.map((text, index) => ({
        id: index + 1,
        text,
      }));
    } catch (err) {
      console.error('Failed to load prompts:', err);
      this.prompts = this.generateFallbackPrompts();
    }
  }

  generateFallbackPrompts() {
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
      // Added more fallbacks
      { id: 11, text: 'Best way to scare a ghost: ______' },
      { id: 12, text: 'Worst place to propose: ______' },
      { id: 13, text: 'A bad name for a band: ______' },
      { id: 14, text: 'Worst thing to say to a cop: ______' },
      { id: 15, text: 'A weird reason to get fired: ______' }
    ];
  }

  selectRandomPrompts(count) {
    // Helper to get N random prompts
    const shuffled = [...this.prompts].sort(() => Math.random() - 0.5);
    if (count > shuffled.length) {
         // Reuse if needed (basic cycling)
         const extended = [];
         while (extended.length < count) {
             extended.push(...shuffled);
         }
         return extended.slice(0, count);
    }
    return shuffled.slice(0, count);
  }

  assignPrompts() {
    const prompts = [];
    const numPlayers = this.players.length;

    // Ensure we have prompts loaded (this.prompts)
    if (!this.prompts || this.prompts.length === 0) {
        this.prompts = this.generateFallbackPrompts();
    }

    if (this.isFinalRound()) { // Round 3: Last Lash
        // One shared prompt for everyone
        const promptIndex = Math.floor(Math.random() * this.prompts.length);
        const sharedPrompt = this.prompts[promptIndex];
        this.players.forEach(p => {
            prompts.push({ playerId: p.id, promptId: sharedPrompt.id, text: sharedPrompt.text });
        });
    } else { // Round 1 & 2
        // Circular assignment: P_i gets Prompt_i and Prompt_{i-1} (wrapping)
        // We need N unique prompts (one per pair).
        const selectedPrompts = this.selectRandomPrompts(numPlayers); 
        
        // Assign Pair i: P[i], P[i+1] -> Prompt[i]
        for (let i = 0; i < numPlayers; i++) {
            const p1 = this.players[i];
            const p2 = this.players[(i + 1) % numPlayers];
            const prompt = selectedPrompts[i];
            
            // Assign to p1
            prompts.push({ playerId: p1.id, promptId: prompt.id, text: prompt.text });
            // Assign to p2
            prompts.push({ playerId: p2.id, promptId: prompt.id, text: prompt.text });
        }
    }
    return prompts;
  }

  async simulateBotAnswers() {
    if (!this.debugMode) return;
    const botPromises = [];
    this.players.forEach(player => {
      if (player.isBot) {
        const playerPrompts = this.currentPrompts.filter(p => p.playerId === player.id);
        playerPrompts.forEach(prompt => {
            const promise = generateBotAnswer(prompt.text, this.settings.cefrLevel || 'B1').then(answer => {
                this.submitAnswer(player.id, prompt.promptId, answer);
            });
            botPromises.push(promise);
        });
      }
    });
    await Promise.all(botPromises);
  }

  submitAnswer(playerId, promptId, answer) {
    if (!this.answers.has(playerId)) {
        this.answers.set(playerId, new Map());
    }
    this.answers.get(playerId).set(promptId, { promptId, answer, timestamp: Date.now() });

    if (this.allAnswersSubmitted()) {
      this.clearTimer('answer');
      this.startVotingPhase();
    }
  }

  allAnswersSubmitted() {
     let totalSubmitted = 0;
     this.answers.forEach(map => totalSubmitted += map.size);
     return totalSubmitted >= this.currentPrompts.length;
  }

  isFinalRound() {
    return this.round >= this.settings.maxRounds;
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
    this.answers.clear();
    this.startTimer('answer', this.settings.answerTime);
    this.simulateBotAnswers();
  }

  createFinalRoundVoting() {
    // Round 3: "Battle Royale" - All answers on screen
    const answers = this.createIndividualVoting(); // Gets all answers
    // Shuffle them
    for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    // One big match, mode 'medals'
    // Ensure promptText is available
    const promptText = answers[0]?.promptText || 'Final Round';
    return [{ mode: 'medals', answers, promptText }];
  }

  createAnswerPairs() {
    const matches = [];
    const answersArray = Array.from(this.answers.entries());

    // Group answers by promptId
    const answersByPrompt = new Map();
    answersArray.forEach(([playerId, answerMap]) => {
        answerMap.forEach((answerData, promptId) => {
            if (!answersByPrompt.has(promptId)) {
                answersByPrompt.set(promptId, []);
            }
            answersByPrompt.get(promptId).push({
                playerId,
                ...answerData
            });
        });
    });

    // Create pairs for each prompt
    answersByPrompt.forEach((answers, promptId) => {
        // Shuffle answers for this prompt
        for (let i = answers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [answers[i], answers[j]] = [answers[j], answers[i]];
        }

        // Create pairs
        for (let i = 0; i < answers.length; i += 2) {
            if (i + 1 < answers.length) {
                const prompt = this.prompts.find(p => p.id === promptId);
                matches.push({
                    mode: 'pairs',
                    promptId,
                    promptText: prompt ? prompt.text : '',
                    player1: {
                        id: answers[i].playerId,
                        name: this.getPlayer(answers[i].playerId).name,
                        answer: answers[i].answer
                    },
                    player2: {
                        id: answers[i+1].playerId,
                        name: this.getPlayer(answers[i+1].playerId).name,
                        answer: answers[i+1].answer
                    }
                });
            }
        }
    });
    
    return matches.sort(() => Math.random() - 0.5);
  }

  createThriplesVoting() {
      // (Retained for backward compatibility if needed, but not used in new logic)
      return this.createAnswerPairs(); // Fallback to pairs or handled elsewhere
  }

  createIndividualVoting() {
    const allAnswers = [];
    this.answers.forEach((answerMap, playerId) => {
        answerMap.forEach((answerData) => {
             allAnswers.push({
                playerId,
                name: this.getPlayer(playerId).name,
                answer: answerData.answer,
                promptText: this.prompts.find(p => p.id === answerData.promptId)?.text || ''
            });
        });
    });
    return allAnswers;
  }

  calculateTiebreakerResults() {
       const voteCounts = new Map();
        this.votes.forEach((voteId) => {
            // Tiebreaker usually single vote
          voteCounts.set(voteId, (voteCounts.get(voteId) || 0) + 1);
        });

        let maxVotes = 0;
        voteCounts.forEach((count) => {
          if (count > maxVotes) maxVotes = count;
        });

        const winners = [];
        voteCounts.forEach((count, playerId) => {
          if (count === maxVotes) winners.push(playerId);
        });
        
        winners.forEach(playerId => {
             const player = this.getPlayer(playerId);
             if (player) player.score += 500;
        });

        return {
            answers: this.tiebreakerAnswers ? this.tiebreakerAnswers.map(ans => ({
                ...ans,
                votes: voteCounts.get(ans.playerId) || 0,
                isWinner: winners.includes(ans.playerId)
            })) : [],
            scores: this.getFinalScores(),
            isFinal: true
        };
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getPlayerByName(name) {
    return this.players.find((p) => p.name === name);
  }

  startTimer(timerName, seconds) {
    this.clearTimer(timerName);

    // Disable gameplay timers to allow infinite time
    if (timerName !== 'intermission') {
      return;
    }

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

    if (this.emit) {
      this.emit('timer-start', { phase: timerName, duration: seconds });
    }
  }

  startVotingPhase() {
    this.votes.clear();
    
    if (this.isFinalRound()) {
      this.votingMatches = this.createFinalRoundVoting();
    } else {
       // Round 1 & 2 use Pairs
       this.votingMatches = this.createAnswerPairs();
       // Fallback for testing/low player count
       if (this.votingMatches.length === 0) {
           const answers = this.createIndividualVoting();
           this.votingMatches = [{ mode: 'individual', answers }];
       }
    }
    
    this.currentMatchIndex = 0;
    this.startNextVotingMatch();
  }

  startNextVotingMatch() {
    if (this.currentMatchIndex >= this.votingMatches.length) {
       // All matches done
       this.completeVotingPhase();
       return;
    }

    this.votes.clear();
    const currentMatch = this.votingMatches[this.currentMatchIndex];
    
    this.state = 'voting';
    this.startTimer('vote', this.settings.voteTime);
    
    this.simulateBotVotesForMatch(currentMatch);

    if (this.emit) {
        this.emit('start-voting', {
            mode: currentMatch.mode || (this.isFinalRound() ? 'medals' : 'individual'), 
            match: currentMatch,
            matchIndex: this.currentMatchIndex,
            totalMatches: this.votingMatches.length,
            isFinal: this.isFinalRound()
        });
    }
  }

  simulateBotVotesForMatch(match) {
    if (!this.debugMode) return;
    this.players.forEach(player => {
      if (player.isBot) {
        let voteId;
        if (match.mode === 'individual') {
             voteId = match.answers[Math.floor(Math.random() * match.answers.length)].playerId;
        } else if (match.player1) { // Pair
             voteId = Math.random() < 0.5 ? match.player1.id : match.player2.id;
        } else if (match.answers) { // Thriple/Medals
             voteId = match.answers[Math.floor(Math.random() * match.answers.length)].id || match.answers[Math.floor(Math.random() * match.answers.length)].playerId;
        }
        if (voteId) {
             this.submitVote(player.id, voteId);
             console.log(`Bot ${player.name} voted for: ${voteId}`);
        }
      }
    });
  }

   submitVote(playerId, voteId) {
      if (this.state === 'tiebreaker' && !this.tiebreakerPlayers.includes(playerId)) {
        return; 
      }

      this.votes.set(playerId, voteId);

      if (this.allVotesSubmitted()) {
        if (this.state === 'tiebreaker') {
          this.clearTimer('tiebreaker');
          this.completeTiebreaker();
        } else {
          this.clearTimer('vote');
          this.calculateResults();
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
      // Calculate results for this match only
      const voteCounts = new Map();
      const votesArray = Array.from(this.votes.values());

      let totalVotesCast = 0;

      // Handle both single and array votes
      votesArray.forEach(v => {
          if (Array.isArray(v)) {
              v.forEach(id => {
                  voteCounts.set(id, (voteCounts.get(id) || 0) + 1);
                  totalVotesCast++;
              });
          } else {
              voteCounts.set(v, (voteCounts.get(v) || 0) + 1);
              totalVotesCast++;
          }
      });

      // Update scores based on votes in this match
      const currentMatch = this.votingMatches[this.currentMatchIndex];
      let matchWinners = [];
      let maxVotes = 0;

      // Identify candidates in this match
      let candidates = [];
      if (currentMatch.player1) { // Pair
          candidates = [currentMatch.player1.id, currentMatch.player2.id];
      } else if (currentMatch.answers) { // Thriple/Medals
          candidates = currentMatch.answers.map(a => a.id || a.playerId);
      } else if (currentMatch.mode === 'individual') {
          candidates = currentMatch.answers.map(a => a.playerId);
      }

      // Tally
      candidates.forEach(cid => {
          const v = voteCounts.get(cid) || 0;
          if (v > maxVotes) maxVotes = v;
      });
      
      candidates.forEach(cid => {
          const v = voteCounts.get(cid) || 0;
          if (v === maxVotes && maxVotes > 0) matchWinners.push(cid);
          
          const player = this.getPlayer(cid);
          if (player) {
              if (this.isFinalRound()) { // Round 3: Medals
                   // 500 points per medal
                   player.score += (v * 500); 
              } else { // Round 1 & 2: Percentage of Pot
                   const baseValue = this.round === 1 ? 1000 : 2000;
                   // Calculate percent of votes IN THIS MATCH
                   const matchVotes = candidates.reduce((sum, c) => sum + (voteCounts.get(c)||0), 0);
                   
                   if (matchVotes > 0) {
                       const percent = v / matchVotes;
                       let points = Math.floor(percent * baseValue);
                       
                       // Quiplash Bonus: 100% of votes
                       if (percent === 1.0 && matchVotes > 0) { // Ensure >0 to avoid 0/0
                           const bonus = this.round === 1 ? 500 : 1000;
                           points += bonus;
                       }
                       player.score += points;
                   }
              }
          }
      });

      // Prepare Match Result Data
      const results = {
          matchIndex: this.currentMatchIndex,
          votes: Object.fromEntries(voteCounts),
          winners: matchWinners,
          isFinal: this.isFinalRound()
      };

      if (this.emit) {
          this.emit('match-results', results);
      }

      // Wait 3 seconds then next match
      setTimeout(() => {
          this.currentMatchIndex++;
          this.startNextVotingMatch();
      }, 5000); // 5s to see results
  }

  completeTiebreaker() {
     const results = this.calculateTiebreakerResults();
     if (results && this.emit) {
        this.emit('show-results', { results });
        setTimeout(() => {
            if (this.startNextRound()) {
              this.emit('intermission', { round: this.round, maxRounds: this.settings.maxRounds });
            } else {
              this.emit('game-over', { finalScores: this.getFinalScores() });
            }
        }, 5000);
     }
  }

  completeVotingPhase() {
    // Show cumulative results after all matches
    const results = {
        scores: this.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
        isFinal: this.isFinalRound()
    };

    if (this.emit) {
      this.emit('show-results', { results });

      setTimeout(() => {
        if (this.startNextRound()) {
          this.emit('intermission', {
            round: this.round,
            maxRounds: this.settings.maxRounds,
          });
        } else {
          this.emit('game-over', {
            finalScores: this.getFinalScores(),
          });
        }
      }, 5000);
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
      // Auto-submit random answers...
       this.players.forEach((player) => {
        const playerPrompts = this.currentPrompts.filter(p => p.playerId === player.id);
        const playerAnswers = this.answers.get(player.id) || new Map();
        playerPrompts.forEach(prompt => {
          if (!playerAnswers.has(prompt.promptId)) {
            this.submitAnswer(player.id, prompt.promptId, '(No answer submitted)');
          }
        });
      });
    } else if (timerName === 'vote' && this.state === 'voting') {
      this.calculateResults();
    } else if (timerName === 'tiebreaker' && this.state === 'tiebreaker') {
      this.completeTiebreaker();
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
    let answersSubmittedCount = 0;
    this.answers.forEach(m => answersSubmittedCount += m.size);

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
        isConnected: p.isConnected !== false,
        isBot: !!p.isBot,
      })),
      answersSubmitted: answersSubmittedCount,
      totalPlayers: this.players.length,
      currentPrompts: this.state === 'answering' ? this.currentPrompts : [],
    };
  }

  getCurrentPrompts() {
    return this.currentPrompts;
  }

  getRemainingAnswers() {
    let answersSubmittedCount = 0;
    this.answers.forEach(m => answersSubmittedCount += m.size);
    return this.currentPrompts.length - answersSubmittedCount;
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
      `Generate 50 absurd, hilarious Quiplash-style prompts. Each must be a short, ridiculous fill-in-the-blank question or statement ending with '______' for players to fill in, like 'The worst ice cream flavor: ______' or 'A terrible name for a cat: ______'. Make them funny and over-the-top. Use vocabulary appropriate for CEFR level ${cefrLevel}. Return ONLY a valid JSON array of strings, e.g., ["prompt1", "prompt2"]. No extra text or explanations.`,
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