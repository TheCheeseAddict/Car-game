# Car Game

A top-down browser racing game with multiplayer support, AI opponents, multiple maps, ghost replay, and realistic car physics. No install required.

---

## Controls

| Key | Action |
|-----|--------|
| Arrow Up / W | Accelerate |
| Arrow Down / S | Brake / Reverse |
| Arrow Left / A | Steer left |
| Arrow Right / D | Steer right |
| R | Reset car to start |
| Esc | Open / close pause menu |

---

## Maps

### 1. Classic
Standard winding circuit on a grass background. 7 wooden log obstacles. Default car physics.

### 2. Oval Sprint
Simple oval track ideal for speed runs. 6 wooden log obstacles. Default car physics.

### 3. City Block
Urban street circuit with 20 waypoints including chicanes and corners. 7 parked car obstacles. Detailed city environment with buildings and lit windows.

### 4. Desert Oval
Large scrolling world (~2620 × 660px). Long straights with smooth U-turns. Sandy terrain with dune shading. All players drive a **dragster car** with special physics:
- Top speed: 260 km/h
- Speed-dependent turn radius (easy to turn at low speed, very wide radius at high speed)
- Reduced lateral grip — more sliding through corners
- Higher friction when turning, causing speed loss in corners

### 5. Forest Rally
Scrolling rally stage (~2760 × 650px) with 46 waypoints including hairpins, chicanes, and S-sections. 7 log obstacles (box collision). Dark atmosphere with fog overlay and pine trees. Modified physics with lower top speed and higher friction.

---

## Solo Race Setup

When you click **Play Solo**, a setup screen appears before the race:

- **Mode** — choose Solo (ghost replay) or AI Race (race against bots)
- **AI Cars** — select 1, 2, or 3 AI opponents (AI Race only)
- **Difficulty** — Easy, Medium, or Hard (AI Race only)
- **Laps** — set the lap count for the race

---

## Game Modes

### Solo
Race against yourself with ghost replay. The game records your best lap and plays it back as a semi-transparent ghost car on future runs. Split times appear at each checkpoint showing whether you're ahead or behind your best.

### AI Race
Race against up to 3 AI-controlled bots on any map. Bots are named **CYBORG**, **BLAZE**, and **SPECTER**, each with a unique color and slightly different driving personality (racing line offset, corner braking bias, steering smoothness). AI cars navigate via spline waypoints, avoid obstacles, and adapt their speed to upcoming corners.

#### Difficulty levels
| Difficulty | Steering noise | Lookahead | Corner braking |
|------------|---------------|-----------|----------------|
| Easy | High (more drift) | 16 pts | 58 % of max speed |
| Medium | Low | 20 pts | 50 % of max speed |
| Hard | Very low | 26 pts | 42 % of max speed |

After the race ends, a results overlay shows the final standings with finish times or current lap progress for unfinished AI cars.

### Multiplayer
Real-time competitive racing via Firebase Realtime Database. Up to 8 players per room.

---

## Multiplayer

### Creating a Room
1. From the lobby, click **Multiplayer**
2. Enter your username
3. Click **Create Room** — a 6-character room code is generated
4. Share the code with friends
5. As host, select the map and lap count, then click **Start Race**

### Joining a Room
1. From the lobby, click **Multiplayer**
2. Enter your username and the room code
3. Click **Join**
4. Wait for the host to start the race

### How It Works
- Each player runs physics locally and syncs position at 20Hz
- The host controls map selection and lap count — these sync to all players automatically
- Each player is assigned a unique random color visible to everyone
- On the Desert Oval, all players share the dragster car design and player names appear above every car (including your own)
- When the race ends, the winner is shown on all screens
- Players are automatically removed from the room when they close the tab

---

## Race Rules

- The race starts on your first key press
- You must pass through 4 checkpoints in order before the finish line counts
- The first player to complete all laps wins
- The winner screen shows: best lap (all-time), best lap (this race), worst lap, and average lap time

---

## Lap Settings

- Default: 5 laps
- Range: 1–20 laps
- In multiplayer, the host's lap count applies to all players

---

## Ghost Replay (Solo)

- Toggle **On/Off** in the lobby or pause menu
- Your best lap is saved per map in the browser (localStorage)
- The ghost is shown as a faded car replaying your previous best run
- Split time deltas are shown at each checkpoint (green = faster, red = slower)

---

## Physics

### Default Car (Classic, Oval Sprint, City Block)
| Parameter | Value |
|-----------|-------|
| Top speed | ~130 km/h |
| Acceleration | 0.08 px/frame² |
| Braking | 0.12 px/frame² |
| Friction | 0.97 |
| Steering | 0.055 rad/frame |

### Desert Dragster
| Parameter | Value |
|-----------|-------|
| Top speed | ~260 km/h |
| Acceleration | 0.14 px/frame² |
| Braking | 0.18 px/frame² |
| Friction | 0.9805 |
| Steering | Speed-dependent (0.034 @ 80 km/h → 0.010 @ 260 km/h) |
| Lateral grip | 0.38 (more slide than standard 0.58) |

### Forest Rally Car
| Parameter | Value |
|-----------|-------|
| Top speed | ~192 km/h |
| Acceleration | 0.11 px/frame² |
| Braking | 0.15 px/frame² |
| Friction | 0.983 |
| Steering | 0.032 rad/frame |

### Off-Track
Speed is capped at 1.5 px/frame and friction increases when the car leaves the track surface. An orange screen tint indicates you are off-track.

---

## UI

### HUD (In-Game)
- **Speed** — bottom left, in km/h
- **Lap counter** — bottom right (current / total)
- **Lap timer** — top right, current lap elapsed time
- **Split times** — checkpoint delta vs ghost, fades after 2.2 seconds
- **Off-track overlay** — orange tint when off track
- **Player names** — visible above all cars on Desert Oval

### Pause Menu (Esc)
- Resume
- Restart Race
- Back to Lobby
- Change username
- Toggle ghost (solo mode)
- Toggle obstacles on / off

### Lobby
- Map carousel with preview and best lap time
- Username input
- Ghost toggle
- Play Solo / Multiplayer

---

## Technical Details

- Modular ES module architecture: `index.html` + `js/` directory (`state.js`, `maps.js`, `track.js`, `physics.js`, `rendering.js`, `hud.js`, `lap.js`, `lobby.js`, `menu.js`, `firebase.js`, `ai.js`)
- Firebase Realtime Database for multiplayer sync (europe-west1 region)
- Canvas 2D rendering at 60 FPS via `requestAnimationFrame`
- Catmull-Rom spline interpolation for smooth track curves
- Seeded PRNG for deterministic map decorations (same visuals every time)
- Ghost replay stored in `localStorage` per map
- `onDisconnect().remove()` for automatic Firebase cleanup on tab close
- Particle system for visual effects
- AI navigation via evenly-spaced spline sub-points with forward-only index advancement to prevent inner-track snapping

---

## Browser Support

Works in any modern browser (Chrome, Firefox, Edge, Safari). No install or server required for solo play. Multiplayer requires an internet connection.
