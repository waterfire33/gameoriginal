const { v4: uuidv4 } = require('uuid');
const http = require('http');

// =============================================================================
// GAME MANAGER - Room & Player Management (Reusable Infrastructure)
// =============================================================================

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
      // Do NOT delete the game or remove the player record.
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

// =============================================================================
// VOCABULARY DATA - Pre-loaded JSON (10 words)
// =============================================================================

const DEFAULT_VOCABULARY = [
  { id: '1', word: "Spend", definition: "Use money or time", image: "Spend.png" },
  { id: '2', word: "Desert", definition: "A very hot and dry place", image: "Desert.png" },
  { id: '3', word: "Temperature", definition: "How hot or cold something is", image: "Temperature.png" },
  { id: '4', word: "Lookout", definition: "A person who looks and watches", image: "Lookout.jpg" },
  { id: '5', word: "Suddenly", definition: "Something happens very fast", image: "Suddenly.png" },
  { id: '6', word: "Sand", definition: "Very small dry pieces on the ground", image: "Sand.png" },
  { id: '7', word: "Carefully", definition: "Do something with care", image: "Carefully.png" },
  { id: '8', word: "Noise", definition: "A loud or strong sound", image: "Noise.png" },
  { id: '9', word: "Reach", definition: "Arrive at a place", image: "Reach.jpg" },
  { id: '10', word: "Value", definition: "How important something is", image: "Value.png" }
];

// =============================================================================
// GAME CLASS - TPR Vocabulary Game Logic
// =============================================================================

class Game {
  constructor(roomCode, name, hostSocketId, hostName, settings = {}, emitFunction = null, debugMode = false) {
    this.id = uuidv4();
    this.roomCode = roomCode;
    this.name = name;

    // Host metadata (host does not play)
    this.hostSocketId = hostSocketId;
    this.hostName = hostName;

    // Players list
    this.players = [];
    this.botsCount = 0;

    // Game state: waiting, playing, results, finished
    this.state = 'waiting';

    // Emit function for socket events
    this.emit = emitFunction;
    this.debugMode = debugMode;

    // Game settings
    this.settings = {
      maxTime: settings.maxTime || 11000, // 11 seconds per loop
      cefrLevel: settings.cefrLevel || 'B1',
      ...settings
    };

    // Vocabulary data for this game session
    this.vocabularyData = [...DEFAULT_VOCABULARY];

    // Per-player game states
    // Map: playerId -> PlayerGameState
    this.playerStates = new Map();

    // Player timers (individual)
    this.playerTimers = new Map(); // playerId -> { timeout, startTime }
  }

  // ===========================================================================
  // PLAYER MANAGEMENT
  // ===========================================================================

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
    this.playerStates.delete(playerId);
    this.clearPlayerTimer(playerId);
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getPlayerByName(name) {
    return this.players.find((p) => p.name === name);
  }

  // ===========================================================================
  // TIMER MANAGEMENT (Per-Player)
  // ===========================================================================

  startPlayerTimer(playerId, durationMs, callback) {
    this.clearPlayerTimer(playerId);

    const timerData = {
      startTime: Date.now(),
      duration: durationMs,
      timeout: setTimeout(() => {
        callback();
      }, durationMs)
    };

    this.playerTimers.set(playerId, timerData);

    // Emit timer start to this specific player
    const player = this.getPlayer(playerId);
    if (player && player.socketId && this.emit) {
      this.emitToPlayer(playerId, 'timer-start', { duration: durationMs });
    }
  }

  clearPlayerTimer(playerId) {
    const timer = this.playerTimers.get(playerId);
    if (timer && timer.timeout) {
      clearTimeout(timer.timeout);
    }
    this.playerTimers.delete(playerId);
  }

  getPlayerTimeRemaining(playerId) {
    const timer = this.playerTimers.get(playerId);
    if (!timer) return 0;
    const elapsed = Date.now() - timer.startTime;
    return Math.max(0, timer.duration - elapsed);
  }

  // ===========================================================================
  // SOCKET EMIT HELPERS
  // ===========================================================================

  emitToPlayer(playerId, event, data) {
    const player = this.getPlayer(playerId);
    if (player && player.socketId && this.emit) {
      // This requires the emit function to support targeted emits
      // We'll handle this in index.js by passing io instance
      this.emit(event, { ...data, targetPlayerId: playerId });
    }
  }

  emitToHost(event, data) {
    if (this.emit) {
      this.emit(event, { ...data, targetHost: true });
    }
  }

  emitToAll(event, data) {
    if (this.emit) {
      this.emit(event, data);
    }
  }

  // ===========================================================================
  // GAME INITIALIZATION
  // ===========================================================================

  startGame() {
    this.state = 'playing';

    // Initialize player states for all connected players
    this.players.forEach(player => {
      if (player.isConnected && !player.isBot) {
        this.initializePlayerState(player.id);
      }
    });

    // Emit game start to all
    this.emitToAll('game-started', {
      vocabularyCount: this.vocabularyData.length,
      maxTime: this.settings.maxTime
    });

    // Start each player's main loop
    this.players.forEach(player => {
      if (player.isConnected && !player.isBot) {
        this.startMainLoop(player.id);
      }
    });

    // Send initial progress to host
    this.broadcastProgress();
  }

  initializePlayerState(playerId) {
    // Each player gets their own shuffled queue
    const shuffledQueue = this.shuffleArray([...this.vocabularyData]);

    const playerState = {
      queue: shuffledQueue,
      currentWord: null,
      loopState: 'idle', // idle, mainLoop, secondLoop, thirdLoop
      score: 0,
      inputLocked: false,
      wordsCompleted: 0,
      wordsTotal: shuffledQueue.length,
      isFinished: false
    };

    this.playerStates.set(playerId, playerState);
    return playerState;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ===========================================================================
  // MAIN LOOP (Type the Word) - +2 points
  // ===========================================================================

  startMainLoop(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state) return;

    // Check if queue is empty (player finished)
    if (state.queue.length === 0) {
      this.playerFinished(playerId);
      return;
    }

    // Peek at top card (do NOT remove yet)
    state.currentWord = state.queue[0];
    state.loopState = 'mainLoop';
    state.inputLocked = false;

    // Emit to player: show image, enable text input
    this.emitToPlayer(playerId, 'main-loop-start', {
      image: state.currentWord.image,
      wordIndex: state.wordsCompleted + 1,
      totalWords: state.wordsTotal
    });

    // Start timer
    this.startPlayerTimer(playerId, this.settings.maxTime, () => {
      this.handleMainLoopTimeout(playerId);
    });

    this.broadcastProgress();
  }

  handleMainLoopAnswer(playerId, answer) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'mainLoop' || state.inputLocked) return;

    const isCorrect = answer.trim().toLowerCase() === state.currentWord.word.toLowerCase();

    if (isCorrect) {
      this.clearPlayerTimer(playerId);

      // Award points
      state.score += 2;
      this.updatePlayerScore(playerId, state.score);

      // Success: Remove word from queue
      state.queue.shift();
      state.wordsCompleted++;

      // Emit success feedback
      this.emitToPlayer(playerId, 'answer-result', {
        correct: true,
        points: 2,
        word: state.currentWord.word,
        message: 'Correct!'
      });

      // Brief pause then next word
      setTimeout(() => {
        this.startMainLoop(playerId);
      }, 1000);
    } else {
      this.clearPlayerTimer(playerId);

      // Emit incorrect feedback
      this.emitToPlayer(playerId, 'answer-result', {
        correct: false,
        points: 0,
        message: 'Incorrect!'
      });

      // Move to second loop
      setTimeout(() => {
        this.startSecondLoop(playerId);
      }, 1000);
    }
  }

  handleMainLoopTimeout(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'mainLoop') return;

    this.emitToPlayer(playerId, 'timeout', { message: "Time's up!" });

    // Move to second loop
    setTimeout(() => {
      this.startSecondLoop(playerId);
    }, 500);
  }

  // ===========================================================================
  // SECOND LOOP (Multiple Choice - 4 Options) - +1 point
  // ===========================================================================

  startSecondLoop(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || !state.currentWord) return;

    state.loopState = 'secondLoop';
    state.inputLocked = false;

    // Create 3 distractors + correct answer
    const distractors = this.vocabularyData
      .filter(item => item.id !== state.currentWord.id);
    const shuffledDistractors = this.shuffleArray([...distractors]).slice(0, 3);
    const options = this.shuffleArray([state.currentWord, ...shuffledDistractors]);

    // Emit to player: show 4 options
    this.emitToPlayer(playerId, 'second-loop-start', {
      image: state.currentWord.image,
      options: options.map((opt, idx) => ({
        id: opt.id,
        word: opt.word,
        index: idx + 1
      })),
      message: 'Select the correct word:'
    });

    // Start timer
    this.startPlayerTimer(playerId, this.settings.maxTime, () => {
      this.handleSecondLoopTimeout(playerId);
    });

    this.broadcastProgress();
  }

  handleSecondLoopAnswer(playerId, selectedId) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'secondLoop' || state.inputLocked) return;

    const isCorrect = selectedId === state.currentWord.id;

    if (isCorrect) {
      this.clearPlayerTimer(playerId);

      // Award points
      state.score += 1;
      this.updatePlayerScore(playerId, state.score);

      // Success: Remove word from queue
      state.queue.shift();
      state.wordsCompleted++;

      // Emit success feedback
      this.emitToPlayer(playerId, 'answer-result', {
        correct: true,
        points: 1,
        word: state.currentWord.word,
        message: 'Recovered!'
      });

      // Next word
      setTimeout(() => {
        this.startMainLoop(playerId);
      }, 1000);
    } else {
      // Lock input, wait for timer (soft fail)
      state.inputLocked = true;

      this.emitToPlayer(playerId, 'answer-result', {
        correct: false,
        points: 0,
        selectedId: selectedId,
        message: 'Incorrect. Wait...'
      });

      // Do NOT stop timer - wait for timeout to proceed to third loop
    }
  }

  handleSecondLoopTimeout(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'secondLoop') return;

    // Move to third loop
    this.startThirdLoop(playerId);
  }

  // ===========================================================================
  // THIRD LOOP (Binary Choice - 2 Options) - +0.5 points
  // ===========================================================================

  startThirdLoop(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || !state.currentWord) return;

    state.loopState = 'thirdLoop';
    state.inputLocked = false;

    // Create 1 distractor + correct answer
    const distractors = this.vocabularyData
      .filter(item => item.id !== state.currentWord.id);
    const shuffledDistractors = this.shuffleArray([...distractors]);
    const options = this.shuffleArray([state.currentWord, shuffledDistractors[0]]);

    // Emit to player: show 2 options
    this.emitToPlayer(playerId, 'third-loop-start', {
      image: state.currentWord.image,
      options: options.map((opt, idx) => ({
        id: opt.id,
        word: opt.word,
        index: idx + 1
      })),
      message: 'Last Chance! 50/50'
    });

    // Start timer
    this.startPlayerTimer(playerId, this.settings.maxTime, () => {
      this.handleThirdLoopTimeout(playerId);
    });

    this.broadcastProgress();
  }

  handleThirdLoopAnswer(playerId, selectedId) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'thirdLoop' || state.inputLocked) return;

    const isCorrect = selectedId === state.currentWord.id;

    if (isCorrect) {
      this.clearPlayerTimer(playerId);

      // Award points
      state.score += 0.5;
      this.updatePlayerScore(playerId, state.score);

      // Success: Remove word from queue
      state.queue.shift();
      state.wordsCompleted++;

      // Emit success feedback
      this.emitToPlayer(playerId, 'answer-result', {
        correct: true,
        points: 0.5,
        word: state.currentWord.word,
        message: 'Saved!'
      });

      // Next word
      setTimeout(() => {
        this.startMainLoop(playerId);
      }, 1000);
    } else {
      // Lock input, wait for timer
      state.inputLocked = true;

      this.emitToPlayer(playerId, 'answer-result', {
        correct: false,
        points: 0,
        selectedId: selectedId,
        message: 'Incorrect.'
      });
    }
  }

  handleThirdLoopTimeout(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || state.loopState !== 'thirdLoop') return;

    // Time expired: Remove word anyway (processed)
    state.queue.shift();
    state.wordsCompleted++;

    this.emitToPlayer(playerId, 'word-skipped', {
      word: state.currentWord.word,
      message: 'Word skipped.'
    });

    // Next word
    setTimeout(() => {
      this.startMainLoop(playerId);
    }, 500);
  }

  // ===========================================================================
  // GAME COMPLETION
  // ===========================================================================

  playerFinished(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state) return;

    state.isFinished = true;
    state.loopState = 'finished';
    this.clearPlayerTimer(playerId);

    // Sync score to player object
    const player = this.getPlayer(playerId);
    if (player) {
      player.score = state.score;
    }

    this.emitToPlayer(playerId, 'player-finished', {
      score: state.score,
      message: 'You finished!'
    });

    this.broadcastProgress();

    // Check if all players are finished
    this.checkGameCompletion();
  }

  checkGameCompletion() {
    const activePlayers = this.players.filter(p => p.isConnected && !p.isBot);

    const allFinished = activePlayers.every(player => {
      const state = this.playerStates.get(player.id);
      return state && state.isFinished;
    });

    if (allFinished && activePlayers.length > 0) {
      this.endGame();
    }
  }

  endGame() {
    this.state = 'results';

    const finalScores = this.getFinalScores();

    this.emitToAll('game-over', {
      finalScores: finalScores,
      winner: finalScores.length > 0 ? finalScores[0] : null
    });

    // After showing results, mark as finished
    setTimeout(() => {
      this.state = 'finished';
    }, 10000);
  }

  // ===========================================================================
  // PROGRESS & SCORES
  // ===========================================================================

  updatePlayerScore(playerId, newScore) {
    const player = this.getPlayer(playerId);
    if (player) {
      player.score = newScore;
    }
    this.broadcastProgress();
  }

  broadcastProgress() {
    const progress = this.getPlayersProgress();
    this.emitToAll('progress-update', { players: progress });
  }

  getPlayersProgress() {
    return this.players
      .filter(p => !p.isBot)
      .map(player => {
        const state = this.playerStates.get(player.id);
        return {
          id: player.id,
          name: player.name,
          score: state ? state.score : 0,
          wordsCompleted: state ? state.wordsCompleted : 0,
          wordsTotal: state ? state.wordsTotal : this.vocabularyData.length,
          loopState: state ? state.loopState : 'idle',
          isFinished: state ? state.isFinished : false,
          isConnected: player.isConnected
        };
      });
  }

  getFinalScores() {
    return this.players
      .filter(p => !p.isBot)
      .map((p) => {
        const state = this.playerStates.get(p.id);
        return {
          id: p.id,
          name: p.name,
          score: state ? state.score : p.score
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  // ===========================================================================
  // GAME STATE
  // ===========================================================================

  getState() {
    return {
      roomCode: this.roomCode,
      name: this.name,
      state: this.state,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isConnected: p.isConnected !== false,
        isBot: !!p.isBot,
      })),
      totalPlayers: this.players.length,
      vocabularyCount: this.vocabularyData.length,
      settings: this.settings
    };
  }

  // ===========================================================================
  // CURRENT WORD INFO (For Host Display)
  // ===========================================================================

  getCurrentWordForPlayer(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state || !state.currentWord) return null;

    return {
      image: state.currentWord.image,
      // Don't expose the word to host - that would be cheating!
      wordIndex: state.wordsCompleted + 1,
      totalWords: state.wordsTotal,
      loopState: state.loopState
    };
  }

  // Get the shared image to display on host (most common current image)
  getHostDisplayImage() {
    // For parallel play, all players see same shuffled queue differently
    // Host could show a generic "Game in Progress" or the first player's image
    const activePlayers = this.players.filter(p => p.isConnected && !p.isBot && !this.playerStates.get(p.id)?.isFinished);

    if (activePlayers.length === 0) return null;

    // Return first active player's current image
    const firstState = this.playerStates.get(activePlayers[0].id);
    if (firstState && firstState.currentWord) {
      return firstState.currentWord.image;
    }
    return null;
  }
}

// =============================================================================
// BOT AI HELPERS (Scaffolding - To be implemented later)
// =============================================================================

async function generateBotAnswer(word, cefrLevel = 'B1') {
  // TODO: Implement bot typing simulation
  // For now, return the correct word with some random chance of failure
  const shouldSucceed = Math.random() > 0.3; // 70% success rate
  if (shouldSucceed) {
    return word;
  }
  return 'wrong answer';
}

async function simulateBotChoice(correctId, options) {
  // TODO: Implement bot choice simulation
  // For now, random choice with bias toward correct answer
  const shouldSucceed = Math.random() > 0.4; // 60% success rate
  if (shouldSucceed) {
    return correctId;
  }
  const wrongOptions = options.filter(o => o.id !== correctId);
  return wrongOptions[Math.floor(Math.random() * wrongOptions.length)]?.id || correctId;
}

// =============================================================================
// VOCABULARY LOADER (For future Level/Session support)
// =============================================================================

function loadVocabularyFromLevel(levelIndex, sessionIndex) {
  // TODO: Implement Level/Session data structure
  // For now, return default vocabulary
  return [...DEFAULT_VOCABULARY];
}

async function fetchVocabularyFromAI(cefrLevel = 'B1') {
  // TODO: Use local AI to generate vocabulary
  // Placeholder for future implementation
  return [...DEFAULT_VOCABULARY];
}

module.exports = GameManager;
