import { ZONES } from './zones.js';
import { FIELD } from './routes.js';

// Default player spots. The QB (player 1) stands a few metres back with the ball;
// everyone else lines up evenly along the line of scrimmage. No blockers.
const LABELS = ['QB', 'X', 'Z', 'Y', 'H', 'F', 'R', 'S', 'T', 'W', 'U'];
const COLOURS = ['#ffd43b', '#4dabf7', '#ff922b', '#da77f2', '#f783ac', '#3bc9db', '#69db7c', '#ff8787', '#748ffc', '#e599f7', '#ffa94d'];

const QB_SPOT = { x: 25, y: -4.5 };
const LINE_Y = -1;

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

/* ---------------- defenders ---------------- */
// role: 'static' (stays put), 'zone' (guards one of the 4 zones), 'mark' (follows an attacker).
const SPARE_SPOTS = [[25, 3], [12, 3], [38, 3], [25, 8], [8, 14], [42, 14], [25, 20]];

export function makeDefender(play) {
  const ds = play.defenders;
  const used = new Set(ds.filter((d) => d.role === 'zone').map((d) => d.zone));
  const zone = [1, 2, 3, 4].find((z) => !used.has(z));
  const taken = (x, y) => ds.some((d) => Math.hypot(d.x - x, d.y - y) < 2.5);
  let n = 1;
  while (ds.some((d) => d.label === 'D' + n)) n++;
  const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (zone) {
    const [x, y] = ZONES[zone].centre;
    return { id, label: 'D' + n, x, y, role: 'zone', zone };
  }
  const spots = SPARE_SPOTS.map(([sx, sy]) => [sx, Math.min(sy, FIELD.front - 2)]);
  const [x, y] = spots.find(([sx, sy]) => !taken(sx, sy)) || [25, Math.min(10, FIELD.front - 2)];
  return { id, label: 'D' + n, x, y, role: 'mark', mark: null };
}

export function addDefender(play) {
  if (play.defenders.length >= MAX_DEFENDERS) return null;
  const d = makeDefender(play);
  play.defenders.push(d);
  return d;
}

export function setDefenderCount(play, n) {
  n = Math.max(1, Math.min(MAX_DEFENDERS, n));
  while (play.defenders.length < n) addDefender(play);
  play.defenders.length = n;
}

export function newPlay(name, kind = 'offence') {
  const play = {
    id: 'play_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    kind,
    players: [],
    defenders: [],
    created: Date.now(),
    updated: Date.now(),
  };
  if (kind === 'defence') {
    setDefenderCount(play, 4);
    play.vs = 'sample';
  } else {
    setPlayerCount(play, 5);
  }
  return play;
}

/** A simple 4-zone defence to test attacks against. */
export function sampleDefence() {
  const d = { id: 'sample-def', name: 'Sample defence', kind: 'defence', players: [], defenders: [] };
  setDefenderCount(d, 4);
  return d;
}

/** A simple attack to try defences against. */
let sample = null;
export function sampleAttack() {
  if (sample && sample.front === FIELD.front) return sample;
  sample = { id: 'sample', name: 'Sample attack', kind: 'offence', players: [], defenders: [], updated: 0 };
  setPlayerCount(sample, 5);
  const routes = { 1: 'go', 2: 'slant', 3: 'hook', 4: 'out' };
  sample.players.forEach((p, i) => {
    if (routes[i]) p.route = { id: routes[i], dir: p.x >= 25 ? 1 : -1, depth: 'm' };
  });
  sample.front = FIELD.front;
  return sample;
}
