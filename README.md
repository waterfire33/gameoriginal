# 🎲 Multiplayer Party Game

A real-time social party game inspired by Quiplash, built with Node.js, Express, Socket.IO, and modern web technologies. Players submit funny answers to AI-generated prompts and vote on the best ones in this hilarious multiplayer experience!


### ✨ Features

### 🎮 Core Gameplay
- **Real-time multiplayer** with WebSocket connections
- **AI-generated prompts** using local LLaMA model
- **Voting system** - Players vote on funniest answers
- **Score accumulation** across multiple rounds
- **Automatic round progression** with timers

### 🎨 Modern UI/UX
- **Dark mode only** - Sleek, modern design
- **Responsive design** - Works on desktop, tablet, and mobile
- **Real-time timers** - Visual progress bars and countdowns
- **Touch-optimized** - Mobile-friendly interactions
- **Smooth animations** - Polished transitions and effects

### 🏠 Host Controls
- **Host-exclusive starting** - Only game creator can begin rounds
- **Live player management** - Monitor connected players
- **Dynamic QR codes** - Easy sharing with network-aware URLs
- **Configurable settings** - Adjust rounds, timing, and game modes

### 🌐 Network & Accessibility
- **Automatic IP detection** - Works on any network
- **mDNS service discovery** - Local network discovery (when supported)
- **Cross-platform support** - iOS, Android, Windows, macOS, Linux
- **No installation required** - Web-based for instant access

### ⚙️ Advanced Features
- **Configurable rounds** - 3-10+ rounds per game
- **Intermission phases** - Breaks between rounds for better pacing
- **Multiple game modes** - Classic, speed, creative variations
- **Fallback prompts** - Works even without AI
- **Error recovery** - Graceful handling of disconnections

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

## 🎯 How to Play

### For the Host
1. **Create a game** - Enter game name and your name
2. **Share the QR code** - Players scan to join instantly
3. **Monitor players** - Wait for 3+ players to join
4. **Start the game** - Click "Start Game" when ready
5. **Manage rounds** - Game progresses automatically

### For Players
1. **Join via QR** - Scan the host's QR code
2. **Enter room code** - Or visit the shared URL
3. **Wait for start** - Host begins when ready
4. **Submit answers** - 60 seconds to be funny
5. **Vote on pairs** - 30 seconds to pick winners
6. **See results** - Scores update each round

### Game Flow
```
Join → Wait → Start → Answer (60s) → Vote (30s) → Results (5s) → Intermission (10s) → Repeat
```

## ⚙️ Configuration

### Game Settings (in `server/gameManager.js`)
```javascript
const defaultSettings = {
  maxRounds: 3,        // Number of rounds (1-10)
  answerTime: 60,      // Seconds to submit answers
  voteTime: 30,        // Seconds to vote
  intermissionTime: 10, // Seconds between rounds
  gameMode: 'classic'  // 'classic', 'speed', 'creative'
};
```

### Server Configuration
- **Port**: Set `PORT` environment variable (default: 3000)
- **Network**: Automatically detects local IPs
- **AI**: Optional local Ollama for dynamic prompts

## 🌐 Network Setup

### Local Network Access
The server automatically detects your local IP addresses. Share these with players on the same network:

```
🌐 Network Access URLs:
   📡 http://'ipadress':3000 (for all devices on the same network)
   👑 Host: http://'ipadress':3000/host.html
   🎯 Player: http://'ipadress':3000
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

### Project Structure
```
multiplayer-party-game/
├── server/                 # Backend Node.js server
│   ├── index.js           # Express + Socket.IO server
│   ├── gameManager.js     # Game logic and state
│   └── package.json       # Server dependencies
├── public/                # Frontend web assets
│   ├── host.html         # Host interface
│   ├── host.css          # Host styling
│   ├── player.html       # Player interface
│   ├── player.css        # Player styling
│   └── favicon           # App icons
├── src/                   # Development assets (if any)
└── README.md             # This file
```

### Development Commands
```bash
cd server

# Install dependencies
npm install

# Start development server with auto-restart
npm run dev

# Start production server
npm start

# Check syntax
node -c index.js
node -c gameManager.js
```

### Adding Features
- **Frontend**: Edit HTML/CSS/JS in `public/`
- **Backend**: Modify `server/index.js` and `gameManager.js`
- **Game logic**: Extend the `Game` class in `gameManager.js`

### Testing
- **Manual testing**: Open multiple browser tabs/windows
- **Network testing**: Use different devices on same WiFi
- **Mobile testing**: Use browser dev tools mobile view

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

**AI prompts not working**
- Install Ollama: https://ollama.ai
- Run `ollama pull llama3.2:3b`
- Restart server - falls back to static prompts if AI fails

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

## 🎉 Support

- **Issues**: [GitHub Issues](https://github.com/mmknisali/gameoriginal/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mmknisali/gameoriginal/discussions)
- **Email**: alinader5525@gmail.com

---

**Ready to laugh?** 🎲 Start your multiplayer party game now!

*Made with ❤️