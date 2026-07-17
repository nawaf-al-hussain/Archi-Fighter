# Arch Rivals
A street fighter like game involving architects. Built with lightweight JS frameworks.

# Technologies used:
Frontend: Phaser
Backend: Deno + Oak + WebRTC (P2P data channel for online play)
Game model: Authoritative-opponent with server-side round_end consensus
Physics: Phaser Arcade Physics (keep it simple)
Realtime: WebRTC P2P via Deno KV signaling relay + matchmaking queue

# Features:
- Real-time multiplayer battles (1v1)
- Battle against AI opponents
- Character selection with unique abilities
- Simple controls (move, jump, simple attack, heavy attack)
- Health bars and win conditions
- Basic animations and sound effects

# Setup Instructions:

## Install tools and dependencies:

1. Install Deno (if you don't have it already):
```
curl -fsSL https://deno.land/install.sh | sh
```

## Running the Game:

1. Clone the repository:
```
git clone https://github.com/nawaf-al-hussain/arch-rivals.git
```

2. Navigate to the project directory:
```
cd arch-rivals
```

3. Start the server and client:
```
npm run dev
```

Start server only:
```
npm run server
```

Start client only:
```
npm run client
```

4. Open your browser and navigate to `http://localhost:8080` to play the game.
   - Client runs on: `http://localhost:8080` 
   - Server runs on: `http://localhost:5145`

# Structure:
```
/client
  index.html
  game.js
  scenes/
  assets/

/server
  server.ts                    # Entry: registers routes + WS handler

  /database
    database.ts                # DatabaseHandler class

  /models
    character.model.ts         # Character shape + DB queries (getAll, getById...)
    player.model.ts            # Player shape + DB queries
    match.model.ts             # Match result, history

  /controllers
    character.controller.ts    # Calls model, returns response
    player.controller.ts
    match.controller.ts

  /routes
    character.routes.ts        # GET /characters, GET /characters/:id
    player.routes.ts           # POST /players, GET /players/:id
    match.routes.ts            # GET /matches/history
    index.ts                   # Aggregates all routers into one

  /game
    game.session.ts            # One live 1v1 match (state, timer, health)
    game.engine.ts             # Validates inputs, applies physics/damage
    ai.ts                      # AI opponent decision making

  /websocket
    ws.handler.ts              # Upgrades connection, routes WS events
    ws.events.ts               # Event types: MOVE, ATTACK, STATE_UPDATE...

  /types
    types.ts                   # Shared interfaces: Character, Player, GameState
```     

# Future Improvements:
- Add hadoken
- Having a score board
- You can do kicks

# Contributing:
Feel free to fork the repository and submit pull requests. For major changes, please open an issue first to discuss what you would like to change.

# License:
This project is licensed under the MIT License - see the LICENSE file for details.

# Support the project
If you like this project, consider giving it a star on GitHub and sharing it with your friends! Your support is greatly appreciated.
Don't have skills to contribute? Do not worry, you can still support the project by sharing it on social media, providing feedback, or simply playing the game and enjoying it!

# Contact:
If you have any questions, suggestions, or want to get in touch, feel free to reach out to me at [contact@pauljaguin.com](mailto:jaguinpaul@gmail.com). I would love to hear from you!

---

## Deploy

Arch Rivals runs on three free-tier services. No credit card required for any of them.

### 1. Neon (Postgres)

1. Sign up at https://neon.tech (no credit card).
2. Create a project, copy the **pooled connection string** (the one with `-pooler` in the hostname).
3. Save it — you'll need it for both the server and GitHub Actions.

### 2. Deno Deploy (server)

1. Sign up at https://deno.com/deploy with GitHub (no credit card).
2. Create a new project, link this GitHub repo.
3. Set the entry point to `server/entry.ts`.
4. Add environment variables in the Deploy dashboard:
   - `DATABASE_URL` = your Neon pooled connection string
   - `ALLOWED_ORIGINS` = `https://YOUR-VERCEL-URL.vercel.app,http://localhost:8080` (e.g. `https://arch-rivals.vercel.app`)
5. Deploy.

### 3. Vercel (client)

1. Sign up at https://vercel.com with GitHub (no credit card).
2. Import this repo.
3. Vercel auto-detects `vercel.json` — no manual config needed.
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://YOUR-DENO-DEPLOY-URL.deno.dev/api/v1`
5. Deploy.

### 4. GitHub Actions (migrations)

1. In repo Settings → Secrets and variables → Actions, add:
   - `NEON_DATABASE_URL` = your Neon pooled connection string
2. Migrations run automatically on every push to `main` that touches `server/database/*`.

### Local development

```bash
# 1. Start Postgres
docker compose up -d

# 2. Copy .env.example to .env, fill in values
cp .env.example .env
# Edit .env with your local DB credentials

# 3. Run migrations + seeders
cd server && deno task db:migrate && deno task db:seed

# 4. Start everything
cd .. && npm run dev
```

Open `http://localhost:8080`.

### Troubleshooting

- **CORS errors in browser console:** Check that your Vercel URL is in `ALLOWED_ORIGINS` on Deno Deploy.
- **WebRTC fails to connect:** Open DevTools Console. Look for `[RTC]` logs. If ICE timeout, your network may block UDP — try a different network or use vs AI / 1v1 Local mode.
- **First request slow (1-3s):** Deno Deploy isolate cold start. Subsequent requests will be fast.
- **`DATABASE_URL is not a valid URL`:** Make sure you copied the connection string exactly, including `?sslmode=require`.
