// Default player spots. The QB (player 1) stands a few metres back with the ball;
// everyone else lines up evenly along the line of scrimmage. No blockers.
const LABELS = ['QB', 'X', 'Z', 'Y', 'H', 'F', 'R', 'S', 'T', 'W', 'U'];
const COLOURS = ['#ffd43b', '#4dabf7', '#ff922b', '#da77f2', '#f783ac', '#3bc9db', '#69db7c', '#ff8787', '#748ffc', '#e599f7', '#ffa94d'];

const QB_SPOT = { x: 25, y: -4.5 };
const LINE_Y = -1;

export const DEFENCE_SPOTS = [
  [25, 6], [10, 7], [40, 7], [18, 3], [32, 3], [25, 15],
  [14, 14], [36, 14], [21, 1.5], [29, 1.5], [25, 1.5],
];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 11;
export const MAX_DEFENDERS = 11;

/** Player labels: up to 2 letters or numbers. */
export const cleanLabel = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);

export function makePlayer(i) {
  const spot = i === 0 ? QB_SPOT : { x: 25, y: LINE_Y };
  return { id: 'p' + i, label: LABELS[i], color: COLOURS[i], x: spot.x, y: spot.y, route: null, auto: i > 0 };
}

/** Spread the players nobody has moved yet evenly along the line. */
export function spreadPlayers(play) {
  const others = play.players.slice(1);
  const n = others.length;
  const left = 4;
  const width = 42;
  others.forEach((p, i) => {
    if (!p.auto) return;
    p.x = +(left + ((i + 0.5) * width) / n).toFixed(2);
    p.y = LINE_Y;
  });
}

export function setPlayerCount(play, n) {
  n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
  while (play.players.length < n) play.players.push(makePlayer(play.players.length));
  play.players.length = n;
  spreadPlayers(play);
}

export function addDefender(play) {
  if (play.defenders.length >= MAX_DEFENDERS) return null;
  const taken = (x, y) => play.defenders.some((d) => Math.hypot(d.x - x, d.y - y) < 2);
  const spot = DEFENCE_SPOTS.find(([x, y]) => !taken(x, y)) || [25, 10];
  const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const d = { id, x: spot[0], y: spot[1] };
  play.defenders.push(d);
  return d;
}

export function newPlay(name) {
  const play = {
    id: 'play_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    players: [],
    defenders: [],
    created: Date.now(),
    updated: Date.now(),
  };
  setPlayerCount(play, 5);
  return play;
}
