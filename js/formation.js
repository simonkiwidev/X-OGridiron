// Default player spots. Players are added in this order as the count goes up.
export const FORMATION = [
  { label: 'QB', x: 25, y: -4.5, color: '#ffd43b' },
  { label: 'C', x: 25, y: -1, color: '#f1f3f5' },
  { label: 'X', x: 6, y: -1, color: '#4dabf7' },
  { label: 'Z', x: 44, y: -1, color: '#ff922b' },
  { label: 'Y', x: 37, y: -2, color: '#da77f2' },
  { label: 'RB', x: 29, y: -5, color: '#f783ac' },
  { label: 'H', x: 13, y: -2, color: '#3bc9db' },
  { label: 'LG', x: 21.5, y: -1, color: '#ced4da' },
  { label: 'RG', x: 28.5, y: -1, color: '#ced4da' },
  { label: 'LT', x: 18, y: -1, color: '#adb5bd' },
  { label: 'RT', x: 32, y: -1, color: '#adb5bd' },
];

export const DEFENCE_SPOTS = [
  [25, 6], [10, 7], [40, 7], [18, 3], [32, 3], [25, 15],
  [14, 14], [36, 14], [21, 1.5], [29, 1.5], [25, 1.5],
];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 11;
export const MAX_DEFENDERS = 11;

export function makePlayer(i) {
  const f = FORMATION[i];
  return { id: 'p' + i, label: f.label, color: f.color, x: f.x, y: f.y, route: null };
}

export function setPlayerCount(play, n) {
  n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
  while (play.players.length < n) play.players.push(makePlayer(play.players.length));
  play.players.length = n;
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
