// Shared constants (never change)
export const TRACK_WIDTH = 80;
export const W = 900;
export const H = 650;

// Single mutable state object shared across all modules
export const state = {
  canvas: null,
  ctx: null,

  car: {
    x: 0, y: 0,
    prevX: 0, prevY: 0,
    angle: 0,
    vx: 0, vy: 0,
    onTrack: true,
    lapStartTime: null,
    laps: 0,
    bestLap: null,
    worstLap: null,
    raceStartTime: null,
    raceStarted: false,
    finished: false,
    totalLaps: 5,
    steerAmount: 0,
  },

  keys: {},
  paused: false,

  // Track-derived (populated by loadMap)
  splinePts: [],
  outerPts: [],
  innerPts: [],
  NSPLINE: 0,
  sfPt: { x: 0, y: 0 },
  sfDx: 0, sfDy: 0, sfLen: 0, sfNx: 0, sfNy: 0,
  finishA: { x: 0, y: 0 },
  finishB: { x: 0, y: 0 },
  checkpoints: [],
  obstacles: [],
  bushes: [],
  camX: 0, camY: 0,
  currentMapIndex: 0,

  // Physics constants (mutable per map, reset by loadMap)
  MAX_SPEED: 3.25,
  SPEED_PHASE1: 2.625,
  OFFTRACK_MAX: 1.5,
  ACCEL: 0.08,
  BRAKE: 0.12,
  FRICTION: 0.97,
  STEER_SPEED: 0.055,

  // Multiplayer
  myPlayerId: null,
  playerName: 'Player',
  roomCode: null,
  myColor: '#e63333',
  isHost: false,
  gameStarted: false,
  remotePlayers: {},
  lastSync: 0,
  animFrameId: null,
  myPlayerRef: null,
  unsubRoom: null,
  lobbyMapIndex: 0,

  // Ghost replay (solo only)
  ghostFrames: [],
  ghostReplay: [],
  ghostIndex: 0,
  ghostSaved: false,
  ghostEnabled: false,
  ghostCheckpointTimes: [],
  ghostRecordingCpTimes: [],
  ghostSplitIdx: 0,
  splitFadeTimer: null,
  splitHideTimer: null,

  // Particle system
  particles: [],

  // Firebase handles (set by firebase.js after init)
  db: null,
  fbRef: null,
  fbSet: null,

  // Callback set by index.html bootstrap
  startGame: null,

  soloSetupActive: false,

  // AI race mode
  aiCars:       [],
  aiRaceMode:   false,
  aiCount:      1,
  aiDifficulty: 'medium',
  aiFinished:   0,
};
