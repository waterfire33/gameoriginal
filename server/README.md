# Multiplayer Game Server

A simplified real-time party game server inspired by Quiplash, built with **Node.js**, **Express**, and **Socket.IO**.

Players join with a room code, submit funny answers to prompts, vote on each other’s answers, and see scores over multiple rounds.

## Project Structure

```text
server/
  index.js          # Express + Socket.IO server
  gameManager.js    # Game + room state logic
  package.json      # Dependencies and scripts
public/
  host.html         # Main display / host UI
  player.html       # Player (phone) UI
```

> Note: `public/` lives one level above `server/`, and is served statically by `server/index.js`.

## Prerequisites

- Node.js (LTS recommended)
- npm

## Setup

From the `server` directory:

```bash
npm install
```

## Running the Server

Development (with auto-restart via nodemon):

```bash
npm run dev
```

Production-style run:

```bash
npm start
```

By default the server listens on port **3000**.

## Using the Game

1. **Open the host UI** in a browser:
   - `http://localhost:3000/host.html`
2. Enter a game name and host name, then click **Create Game**.
3. A **room code** appears on the host screen, plus a join URL.
4. **Players join** from their phones/tablets:
   - Go to `http://localhost:3000/player.html`
   - Enter the room code and their name.
5. When at least 2 players have joined, the host can click **Start Game**.
6. Flow:
   - Players see a prompt and submit answers.
   - When all answers are in, everyone votes.
   - Results and scores are shown, then the next round starts.

## Configuration

- Max players: enforced in `index.js` (`game.players.length >= 8`).
- Rounds, prompts, and timers are configured in `gameManager.js`:
  - `maxRounds`
  - `generatePrompts()`
  - `startTimer('answer', 60)` and `startTimer('vote', 30)`

Adjust these values to tune difficulty, pacing, and content.

## Next Steps / Ideas

- Persist games in a database.
- Add authentication for hosts.
- Add more prompt categories and localization.
- Deploy behind HTTPS and a reverse proxy (e.g., Nginx) for production.
