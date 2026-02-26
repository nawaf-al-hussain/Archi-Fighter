# Archi-Fighter
That is a street fighter like game involving architects. Using lightweight framework in js 

# Technologies used:
Frontend: Phaser
Backend: Deno + Oak + WebSocket
Game model: Server-authoritative
Physics: Phaser Arcade Physics (keep it simple)

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
git clone https://github.com/UnMugViolet/Archi-Fighter.git
```

2. Navigate to the project directory:
```
cd Archi-Fighter
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
  server.ts
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
