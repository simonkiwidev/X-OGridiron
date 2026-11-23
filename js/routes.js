// Route library and geometry.
// Field coordinates are in metres: x = 0..50 across (left sideline to right),
// y = metres downfield from the line of scrimmage (negative = behind the line).
// Preset route points are relative to the player's start:
//   dx > 0 means "towards the outside" (flipped by `dir`), dy > 0 means downfield.

export const FIELD = { width: 50, back: -12, front: 28 };

export const DEPTH = { s: 0.6, m: 1, d: 1.5 };
export const DEPTH_NAMES = { s: 'Short', m: 'Medium', d: 'Deep' };

export const PASS_ROUTES = [
  { id: 'go', name: 'Go / Fly', pts: [[0, 25]] },
  { id: 'slant', name: 'Slant', pts: [[0, 2], [-8, 10]] },
  { id: 'hook', name: 'Button Hook', pts: [[0, 10], [-1.5, 8]] },
  { id: 'out', name: 'Out', pts: [[0, 8], [9, 8]] },
  { id: 'in', name: 'In', pts: [[0, 8], [-12, 8]] },
  { id: 'post', name: 'Post', pts: [[0, 10], [-8, 22]] },
  { id: 'corner', name: 'Corner', pts: [[0, 10], [8, 20]] },
  { id: 'flat', name: 'Flat', pts: [[3, 1.5], [10, 2.5]] },
  { id: 'comeback', name: 'Comeback', pts: [[0, 12], [3, 9]] },
  { id: 'wheel', name: 'Wheel', pts: [[5, 0.5], [8, 3], [8.5, 8], [8.5, 22]] },
  { id: 'hitch', name: 'Hitch', pts: [[0, 5], [-0.5, 3.8]] },
  { id: 'drag', name: 'Drag', pts: [[0, 1.5], [-15, 4]] },
];

export const RUN_PLAYS = [
  { id: 'qbrun', name: 'QB Run', run: true, help: 'The QB keeps the ball and runs.' },
  { id: 'handoff', name: 'Handoff', run: true, help: 'Tap the runner. The QB hands them the ball as they run past.' },
  { id: 'pitch', name: 'Pitch', run: true, help: 'Tap the runner. The QB tosses the ball back to them behind the line.' },
];

export const CUSTOM = { id: 'custom', name: 'Draw my own' };

const ALL = [...PASS_ROUTES, ...RUN_PLAYS, CUSTOM];
export const routeById = (id) => ALL.find((r) => r.id === id);
export const isRunRoute = (id) => id === 'qbrun' || id === 'handoff' || id === 'pitch';
export const hasDepth = (id) => id !== 'custom';

const clampPt = ([x, y]) => [
  Math.max(0.8, Math.min(FIELD.width - 0.8, x)),
  Math.max(FIELD.back + 0.5, Math.min(FIELD.front - 0.5, y)),
];

const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Default direction when a route is first given to a player. */
export function defaultDir(routeId, player, play) {
  const qb = play.players[0];
  if (routeId === 'handoff') return sign(qb.x - player.x) || 1; // cut across behind the QB
  if (routeId === 'pitch') return sign(player.x - qb.x) || 1; // run away from the QB
  if (routeId === 'qbrun' || routeId === 'custom') return 1;
  return player.x >= FIELD.width / 2 ? 1 : -1; // outside = towards nearest sideline
}

/** Absolute route points for a player (including start), or null. */
export function routePoints(player, play) {
  const r = player.route;
  if (!r) return null;
  const dir = r.dir || 1;
  const k = DEPTH[r.depth || 'm'];
  const sx = player.x;
  const sy = player.y;
  const qb = play.players[0];
  let pts;

  if (r.id === 'custom') {
    pts = r.pts.map(([dx, dy]) => [sx + dx * dir, sy + dy]);
  } else if (r.id === 'qbrun' || (r.id === 'handoff' && player === qb) || (r.id === 'pitch' && player === qb)) {
    pts = [[sx + 3 * dir, sy + 2.5], [sx + 4 * dir, sy + 2.5 + 12 * k]];
  } else if (r.id === 'handoff') {
    const meet = [qb.x, qb.y + 1.2];
    pts = [meet, [qb.x + 3 * dir, 0.5], [qb.x + 4 * dir, 0.5 + 13 * k]];
  } else if (r.id === 'pitch') {
    const y0 = Math.min(sy + 0.5, -1.5);
    pts = [[sx + 7 * dir, y0], [sx + 11 * dir, -0.5], [sx + 12 * dir, -0.5 + 12 * k]];
  } else {
    const preset = routeById(r.id);
    if (!preset) return null;
    pts = preset.pts.map(([dx, dy]) => [sx + dx * dir, sy + dy * k]);
  }
  return [[sx, sy], ...pts.map(clampPt)];
}

/** Points for the small route icon on the route buttons (in a 0..1 box). */
export function iconPoints(routeId) {
  const fake = { x: 0, y: 0 };
  let pts;
  if (routeId === 'qbrun') pts = [[0, 0], [3, 2.5], [4, 14.5]];
  else if (routeId === 'handoff') pts = [[4, 0], [0, 1.5], [-3, 4], [-4, 15]];
  else if (routeId === 'pitch') pts = [[0, 0], [7, 0.5], [11, 3], [12, 14]];
  else if (routeId === 'custom') pts = [[0, 0], [2, 5], [-2, 9], [3, 13], [1, 16]];
  else {
    const preset = routeById(routeId);
    pts = [[0, 0], ...preset.pts.map(([dx, dy]) => [fake.x + dx, fake.y + dy])];
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.map(([x, y]) => [0.5 + (x - cx) / span, 0.5 - (y - cy) / span]);
}
