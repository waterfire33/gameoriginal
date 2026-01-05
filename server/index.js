const express = require('express');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const GameManager = require('./gameManager');

function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Prefer IPv4 LAN addresses (e.g. 192.168.x.x / 10.x.x.x) and skip internal/loopback.
      if (net && net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  // Dedupe
  return [...new Set(ips)];
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // Enable WebSocket fallbacks
  transports: ['websocket', 'polling'],
});

const gameManager = new GameManager();

// Serve static files
app.use(express.static('../public'));
app.use(express.json());

// Serve hostdebug.html
app.get('/hostdebug.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/hostdebug.html'));
});

// Redirect root to player.html for easier access
app.get('/', (req, res) => {
  res.redirect('/player.html');
});

// Game state API (optional)
app.get('/api/game/:roomCode', (req, res) => {
  const game = gameManager.getGame(req.params.roomCode);
  res.json(game ? game.getState() : { error: 'Game not found' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Host creates a new game (host does not play)
  socket.on('create-game', ({ playerName, gameName, maxRounds, votingMode, cefrLevel, debug = false }) => {
    const settings = {};
    if (maxRounds) settings.maxRounds = maxRounds;
    if (votingMode) settings.votingMode = votingMode;
    if (cefrLevel) settings.cefrLevel = cefrLevel;
    const roomCode = gameManager.createGame(gameName, socket.id, playerName, settings, (event, data) => io.to(roomCode).emit(event, data), debug);

    socket.join(roomCode);
    const lanIps = getLanIPv4Addresses();
    const joinUrl = lanIps.length > 0 ? `http://${lanIps[0]}:${PORT}/player.html?room=${roomCode}` : `http://localhost:${PORT}/player.html?room=${roomCode}`;
    socket.emit('game-created', {
      roomCode,
      joinUrl,
      gameState: gameManager.getGame(roomCode).getState(),
    });

    console.log(`Game created: ${roomCode} by host ${playerName} (debug: ${debug})`);
  });

  // Player joins existing game
  socket.on('join-game', ({ roomCode, playerName }) => {
    const game = gameManager.getGame(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.players.length >= 8) {
      // Max players
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    const player = gameManager.addPlayer(roomCode, playerName, socket.id);
    socket.join(roomCode);

    // Notify the joiner
    socket.emit('joined-game', {
      playerId: player.id,
      gameState: game.getState(),
    });

    // Notify everyone in the room
    io.to(roomCode).emit('player-joined', {
      player,
      gameState: game.getState(),
    });
  });

  // Player submits answer
  socket.on('submit-answer', ({ roomCode, playerId, promptId, answer }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) return;

    game.submitAnswer(playerId, promptId, answer);

    // Broadcast to all players that someone answered
    io.to(roomCode).emit('answer-submitted', {
      playerId,
      answersRemaining: game.getRemainingAnswers(),
    });
  });

  // Player submits vote
  socket.on('submit-vote', ({ roomCode, playerId, voteId }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) return;

    game.submitVote(playerId, voteId);

    io.to(roomCode).emit('vote-submitted', {
      playerId,
      votesRemaining: game.getRemainingVotes(),
    });
  });

  // Add bot to game
  socket.on('add-bot', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) return;

    // Only host can add bots
    if (socket.id !== game.hostSocketId) {
      socket.emit('error', { message: 'Only the host can add bots.' });
      return;
    }

    console.log('Adding bot to room', roomCode, 'current players:', game.players.length);
    const bot = game.addBot();
    if (!bot) {
      socket.emit('error', { message: 'Cannot add more bots.' });
      return;
    }

    // Notify everyone in the room
    io.to(roomCode).emit('bot-added', {
      bot,
      gameState: game.getState(),
    });
  });

  // Remove bot from game
  socket.on('remove-bot', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) return;

    // Only host can remove bots
    if (socket.id !== game.hostSocketId) {
      socket.emit('error', { message: 'Only the host can remove bots.' });
      return;
    }

    game.removeBot();

    // Notify everyone in the room
    io.to(roomCode).emit('bot-removed', {
      gameState: game.getState(),
    });
  });

  // Host starts the game once enough players have joined
  socket.on('start-game', async ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) return;

    // Only host can start the game
    if (socket.id !== game.hostSocketId) {
      socket.emit('error', { message: 'Only the host can start the game.' });
      return;
    }

    console.log('Start game requested for', roomCode, 'players:', game.players.length, 'debug:', game.debugMode);
    // Require at least 2 players (not counting host), or 1 in debug mode
    if (game.players.length < (game.debugMode ? 1 : 2)) {
      socket.emit('error', { message: `At least ${game.debugMode ? 1 : 2} player(s) are required to start the game.` });
      return;
    }

    try {
      await game.startGame();
      io.to(roomCode).emit('game-started', {
        round: game.round,
        maxRounds: game.settings.maxRounds,
        prompts: game.getCurrentPrompts(),
      });
    } catch (err) {
      console.error('Failed to start game with AI-generated prompts:', err);
      socket.emit('error', { message: 'Failed to start game. Please try again.' });
    }
  });

  // Host reconnects
  socket.on('host-reconnect', ({ roomCode }) => {
    const game = gameManager.getGame(roomCode);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Update host socket ID
    game.hostSocketId = socket.id;
    socket.join(roomCode);

    const lanIps = getLanIPv4Addresses();
    const joinUrl = lanIps.length > 0 ? `http://${lanIps[0]}:${PORT}/player.html?room=${roomCode}` : `http://localhost:${PORT}/player.html?room=${roomCode}`;
    
    socket.emit('game-created', {
      roomCode,
      joinUrl,
      gameState: game.getState(),
    });
    
    console.log(`Host reconnected to room ${roomCode}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    gameManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const lanIps = getLanIPv4Addresses();

  console.log(`Server running on http://localhost:${PORT}`);
  for (const ip of lanIps) {
    console.log(`Server running on http://${ip}:${PORT}/player.html`);
  }

  if (lanIps.length === 0) {
    console.log('❌ No LAN IPv4 address detected. Are you connected to a network?');
  } else {
    networkBaseUrl = `http://${lanIps[0]}:${PORT}`;
    console.log('\n🌐 Network Access URLs:');
    lanIps.forEach(ip => {
      console.log(`   📡 http://${ip}:${PORT} (for all devices on the same network)`);
      console.log(`   👑 Host: http://${ip}:${PORT}/host.html`);
      console.log(`   🎯 Player: http://${ip}:${PORT}`);
    });

    // Try to advertise via mDNS
    try {
      const avahi = spawn('avahi-publish-service', ['game-server', '_http._tcp', PORT], {
        stdio: 'pipe', // Don't inherit to avoid cluttering console
        detached: true
      });
      
      avahi.on('error', (err) => {
         // Ignore errors if avahi is missing (e.g. on macOS)
      });

      avahi.unref();

      console.log('\n🔍 mDNS Service Discovery:');
      console.log('   If supported on your network: http://game-server.local');
      console.log('   Note: May not work with VPNs like Tailscale');
    } catch (err) {
      console.log('   mDNS advertising failed - use IP addresses above');
    }

    console.log('\n💡 Share the network URL with friends on the same WiFi/LAN!');
  }
});
