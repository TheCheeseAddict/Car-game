import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, onDisconnect }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { state } from './state.js';
import { COLOR_PALETTE } from './maps.js';
import { loadMap } from './track.js';
import { resetGame, setLaps } from './menu.js';
import { showWinner } from './hud.js';

const firebaseConfig = {
  apiKey: "AIzaSyAOVIcGJ3_IlE7oW-u_YA58aS6oJDvy7pg",
  authDomain: "car-game-mp-48d63.firebaseapp.com",
  databaseURL: "https://car-game-mp-48d63-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "car-game-mp-48d63",
  storageBucket: "car-game-mp-48d63.firebasestorage.app",
  messagingSenderId: "947732271098",
  appId: "1:947732271098:web:47189764f09cd140c75e43",
};

const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

// Store Firebase handles on state so other modules (menu, lap) can use them
state.db    = db;
state.fbRef = ref;
state.fbSet = set;

async function pickColor() {
  if (!state.roomCode) return COLOR_PALETTE[0];
  const snap = await get(ref(db, `rooms/${state.roomCode}/players`));
  const takenColors = new Set();
  if (snap.exists()) {
    for (const p of Object.values(snap.val())) {
      if (p.color) takenColors.add(p.color);
    }
  }
  return COLOR_PALETTE.find(c => !takenColors.has(c)) ?? COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

async function joinRoom() {
  state.myColor = await pickColor();
  state.myPlayerRef = ref(db, `rooms/${state.roomCode}/players/${state.myPlayerId}`);
  await set(state.myPlayerRef, {
    x: 0, y: 0, angle: 0, laps: 0, onTrack: true,
    name: state.playerName, color: state.myColor,
  });
  onDisconnect(state.myPlayerRef).remove();
  listenToRoom();
}

function listenToRoom() {
  state.unsubRoom = onValue(ref(db, `rooms/${state.roomCode}`), snap => {
    const data = snap.val();
    if (!data) return;

    if (!state.isHost && data.mapIndex !== undefined && data.mapIndex !== state.currentMapIndex) {
      loadMap(data.mapIndex);
      resetGame();
    }
    if (!state.isHost && data.laps !== undefined && data.laps !== state.car.totalLaps) {
      setLaps(data.laps);
    }
    if (data.started && !state.gameStarted) {
      if (state.startGame) state.startGame();
    }
    if (data.winner && !state.car.finished) {
      const stats = {
        best:  state.car.bestLap,
        worst: state.car.worstLap,
        avg:   state.car.raceStarted
          ? (performance.now() - state.car.raceStartTime) / 1000 / Math.max(state.car.laps, 1)
          : null,
      };
      if (data.winner === state.myPlayerId) {
        showWinner('WINNER!!', true, stats);
      } else {
        const winnerName = (data.players && data.players[data.winner] && data.players[data.winner].name)
          || data.winner.slice(0, 4);
        showWinner(`${winnerName} WINS!`, false, stats);
      }
    }
    state.remotePlayers = {};
    for (const [id, p] of Object.entries(data.players || {})) {
      if (id !== state.myPlayerId) state.remotePlayers[id] = p;
    }
  });
}

export function setupFirebaseButtons() {
  document.getElementById('btnCreate').onclick = async () => {
    state.myPlayerId = Math.random().toString(36).slice(2, 10);
    state.roomCode   = Math.random().toString(36).slice(2, 8).toUpperCase();
    state.isHost     = true;
    await set(ref(db, `rooms/${state.roomCode}`), {
      mapIndex: state.currentMapIndex,
      laps: state.car.totalLaps,
      started: false,
      players: {},
    });
    await joinRoom();
    document.getElementById('lobbyStatus').textContent = `Room code: ${state.roomCode}  —  share this with friends!`;
    document.getElementById('btnStartRace').style.display = 'block';
  };

  document.getElementById('btnJoin').onclick = async () => {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) { document.getElementById('lobbyStatus').textContent = 'Enter a room code first.'; return; }
    state.myPlayerId = Math.random().toString(36).slice(2, 10);
    state.roomCode   = code;
    state.isHost     = false;
    document.getElementById('lobbyStatus').textContent = `Joining ${state.roomCode}...`;
    await joinRoom();
    document.getElementById('lobbyStatus').textContent = `Joined ${state.roomCode} — waiting for host to start...`;
  };

  document.getElementById('btnStartRace').onclick = () => {
    set(ref(db, `rooms/${state.roomCode}/started`), true);
  };
}

export function setupSyncUsername() {
  function syncUsername(val) {
    state.playerName = val.trim() || 'Player';
    document.getElementById('usernameInput').value = val;
    document.getElementById('menuUsernameInput').value = val;
  }
  document.getElementById('usernameInput').addEventListener('input', e => syncUsername(e.target.value));
  document.getElementById('menuUsernameInput').addEventListener('input', e => syncUsername(e.target.value));
}

export { db, ref, set };
