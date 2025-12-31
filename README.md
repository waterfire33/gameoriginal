# 🎲 Multiplayer Party Game

A real-time social party game inspired by Quiplash, built with Node.js, Express, Socket.IO, and modern web technologies. Players submit funny answers to shared AI-generated prompts, vote on the best ones, and enjoy hilarious multiplayer experiences with CEFR English levels, bots, and various voting modes!


### ✨ Features

### 🎮 Core Gameplay
- **Shared prompts per round** - All players answer the same absurd fill-in-the-blank question
- **Real-time multiplayer** with WebSocket connections
- **AI-generated prompts** using local LLaMA model, adapted to CEFR English levels
- **Multiple voting modes** - Battle Royale (all answers), Pairs (head-to-head), Thriples (3-way)
- **Score accumulation** across multiple rounds with tiebreakers
- **Automatic round progression** with timers and intermissions

### 🤖 Debug & Testing
- **Bot players** - Add AI-controlled bots for testing (via /hostdebug.html)
- **Debug mode** - Special host interface for bot management and solo play
- **Console logging** - Detailed logs for troubleshooting

### 🎨 Modern UI/UX
- **Dark mode only** - Sleek, modern design
- **Responsive design** - Works on desktop, tablet, and mobile
- **Real-time timers** - Visual progress bars and countdowns
- **Touch-optimized** - Mobile-friendly interactions
- **Smooth animations** - Polished transitions and effects
- **Centered prompt display** - Prominent question presentation during answering

### 🏠 Host Controls
- **Host-exclusive starting** - Only game creator can begin rounds
- **Live player management** - Monitor connected players (real and bots)
- **Dynamic QR codes** - Easy sharing with network-aware URLs
- **Configurable settings** - Adjust rounds, timing, voting modes, and CEFR levels
- **Bot controls** - Add/remove bots in debug mode

### 🌐 Network & Accessibility
- **Automatic IP detection** - Works on any network
- **mDNS service discovery** - Local network discovery (when supported)
- **Cross-platform support** - iOS, Android, Windows, macOS, Linux
- **No installation required** - Web-based for instant access

### ⚙️ Advanced Features
- **CEFR English levels** - A1 (Beginner) to C1 (Advanced) for educational gameplay
- **Configurable rounds** - 3-10+ rounds per game
- **Intermission phases** - Breaks between rounds for better pacing
- **Fallback prompts** - 20 curated Quiplash-style prompts if AI fails
- **Error recovery** - Graceful handling of disconnections and timeouts
- **Prompt validation** - Ensures AI-generated prompts are fill-in-the-blank format

## 🚀 Quick Start

### Prerequisites
- **Node.js** (LTS 18+ recommended)
- **npm** (comes with Node.js)
- **Ollama** (optional, for AI prompts) - Install from [ollama.ai](https://ollama.ai)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mmknisali/gameoriginal
   cd gameoriginal
   ```

2. **Install dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the game**
   - **Host**: Open `http://localhost:3000/host.html`
   - **Players**: Open `http://localhost:3000` (auto-redirects)
   - **Debug Host**: Open `http://localhost:3000/hostdebug.html` for bot testing

## 🎯 How to Play

### For the Host
1. **Create a game** - Enter game name, your name, rounds, voting mode, and CEFR level
2. **Share the QR code** - Players scan to join instantly (uses network IP)
3. **Monitor players** - Wait for players to join; add bots if needed (via /hostdebug.html)
4. **Start the game** - Click "Start Game" when ready (1+ players in debug mode)
5. **Manage rounds** - Game progresses automatically with shared prompts

### For Players
1. **Join via QR** - Scan the host's QR code
2. **Enter room code** - Or visit the shared URL
3. **Wait for start** - Host begins when ready
4. **Submit answers** - 60 seconds to answer the centered shared question
5. **Vote on answers** - 30 seconds to pick winners (mode varies: all, pairs, or 3-way)
6. **See results** - Scores update each round with possible tiebreakers

### Game Flow
```
Join → Wait → Start → Shared Prompt Display → Answer (60s) → Vote (30s) → Results (5s) → Intermission (10s) → Repeat
```

### Debug Mode (Bots)
- Navigate to `/hostdebug.html` to access debug mode
- Add/remove bots to test gameplay without real players
- Bots auto-answer and vote using AI
- Allows solo play or testing with mixed real/bot players

## ⚙️ Configuration

### Game Settings (Host UI)
- **Max Rounds**: 1-10 rounds per game
- **Voting Mode**: Battle Royale (all answers), Pairs (head-to-head), Thriples (3-way)
- **CEFR Level**: A1 (Beginner) to C1 (Advanced) for AI prompt adaptation

### Advanced Settings (in `server/gameManager.js`)
```javascript
const defaultSettings = {
  maxRounds: 3,        // Number of rounds (1-10)
  answerTime: 60,      // Seconds to submit answers
  voteTime: 30,        // Seconds to vote
  intermissionTime: 10, // Seconds between rounds
  votingMode: 'pairs', // 'individual', 'pairs', 'thriples'
  cefrLevel: 'B1'      // 'A1', 'A2', 'B1', 'B2', 'C1'
};
```

### Server Configuration
- **Port**: Set `PORT` environment variable (default: 3000)
- **Network**: Automatically detects local IPs
- **AI**: Local Ollama (llama3.2:3b) for prompts and bot answers; fallbacks if unavailable
- **Debug Mode**: Accessible via `/hostdebug.html` for bot testing

## 🌐 Network Setup

### Local Network Access
The server automatically detects your local IP addresses. Share these with players on the same network:

```
🌐 Network Access URLs:
   📡 http://'ipadress':3000 (for all devices on the same network)
   👑 Host: http://'ipadress':3000/host.html
   🎯 Player: http://'ipadress':3000
   🔧 Debug Host: http://'ipadress':3000/hostdebug.html
```

### mDNS Service Discovery
For networks that support it:
- Service name: `game-server.local`
- Automatic discovery on compatible devices
- Fallback to IP addresses if not supported

### Port Forwarding (for external access)
```bash
# Forward port 3000 on your router
# Then share your public IP
```

## 🛠️ Development

### Vocabulary Game (Bonus Feature)
Located in `src/`, this is a separate single-player educational game:
- Enter words to fetch definitions from dictionaryapi.dev
- Adapted to CEFR levels (A1-C1) for language learning
- Matching game to pair words with definitions
- Run with `npm run dev` in root directory

### Project Structure
```
multiplayer-party-game/
├── server/                 # Backend Node.js server
│   ├── index.js           # Express + Socket.IO server
│   ├── gameManager.js     # Game logic and state
│   └── package.json       # Server dependencies
├── public/                # Frontend web assets
│   ├── host.html         # Normal host interface
│   ├── hostdebug.html    # Debug host interface with bots
│   ├── host.css          # Host styling
│   ├── player.html       # Player interface
│   ├── player.css        # Player styling
│   └── favicon           # App icons
├── src/                   # Client-side game (vocabulary matching)
│   ├── main.ts           # Vocabulary game logic
│   └── ...               # Vite build files
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

### Development Commands
```bash
# Server development
cd server
npm install
npm run dev  # Auto-restart on changes

# Client development (vocabulary game)
cd ..
npm install
npm run dev  # Vite dev server

# Production
cd server && npm start
```

### Adding Features
- **Multiplayer Frontend**: Edit HTML/CSS/JS in `public/`
- **Backend**: Modify `server/index.js` and `gameManager.js`
- **Game logic**: Extend the `Game` class in `gameManager.js`
- **Vocabulary Game**: Edit `src/main.ts` and related files

### Testing
- **Manual testing**: Open multiple browser tabs/windows
- **Network testing**: Use different devices on same WiFi
- **Mobile testing**: Use browser dev tools mobile view
- **Debug testing**: Use `/hostdebug.html` with bots

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly** - Multi-device testing recommended
5. **Commit**: `git commit -m 'Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Guidelines
- **Code style**: Follow existing patterns
- **Testing**: Test on multiple devices/browsers
- **Documentation**: Update README for new features
- **Compatibility**: Ensure mobile responsiveness

## 📋 Requirements

### System Requirements
- **OS**: Windows 10+, macOS 10.14+, Linux (Ubuntu 18.04+)
- **RAM**: 512MB minimum, 1GB recommended
- **Storage**: 100MB free space
- **Network**: Local network access

### Browser Support
- **Chrome**: 80+
- **Firefox**: 75+
- **Safari**: 13+
- **Edge**: 80+
- **Mobile browsers**: iOS Safari, Chrome Mobile

## 🐛 Troubleshooting

### Common Issues

**"Create Game" button doesn't work**
- Check browser console for JavaScript errors
- Ensure server is running on correct port
- Try refreshing the page

**Players can't connect**
- Verify all devices are on same network
- Check firewall settings (allow port 3000)
- Try IP addresses instead of localhost

**QR code shows localhost**
- Server detects network IP automatically
- If not working, manually use network IP
- Check network configuration

**Shared prompts not displaying**
- Ensure all players get the same prompt (assigned in `assignPrompts()`)
- Check console for prompt assignment logs

**Bots not working in debug mode**
- Use `/hostdebug.html` for bot controls
- Bots require debug mode enabled
- Check server logs for bot simulation errors

**Voting modes not switching**
- Voting mode is set per game at creation
- Thriples mode requires at least 3 answers
- Check client-side voting UI for mode-specific displays

**CEFR levels not affecting prompts**
- AI adapts prompts to level; static fallbacks are general
- Verify level selection in host UI
- Test with AI enabled for level-specific generation

**AI prompts not working**
- Install Ollama: https://ollama.ai
- Run `ollama pull llama3.2:3b`
- Restart server - falls back to 20 static Quiplash-style prompts if AI fails

**mDNS not working**
- Use IP addresses directly
- Check if Avahi/Bonjour is installed
- Some networks block multicast DNS

### Debug Mode
```bash
# Check server logs
cd server && npm run dev

# Test network connectivity
curl http://localhost:3000
curl http://[your-ip]:3000
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Quiplash** - Original game inspiration
- **Socket.IO** - Real-time communication
- **Ollama** - Local AI integration
- **QRCode.js** - QR code generation
- **Open source community** - Amazing libraries and tools

## 📂 Repository

- **GitHub**: [mmknisali/gameoriginal](https://github.com/mmknisali/gameoriginal)

## 🎉 Support

- **Issues**: [GitHub Issues](https://github.com/mmknisali/gameoriginal/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mmknisali/gameoriginal/discussions)
- **Email**: alinader5525@gmail.com

---

**Ready to laugh?** 🎲 Start your multiplayer party game now!

*Made with ❤️