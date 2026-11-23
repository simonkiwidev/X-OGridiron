// Works out where every player and the ball are at any moment of a play.
import { routePoints } from './routes.js';

const SPEED = 6.5; // metres per second (play-back speed at "normal")
const PITCH_DELAY = 0.35;
const PITCH_FLIGHT = 0.45;

function pathOf(player, play) {
  const pts = routePoints(player, play) || [[player.x, player.y]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, cum, len: cum[cum.length - 1] };
}

function along(path, d) {
  const { pts, cum, len } = path;
  if (d <= 0 || pts.length === 1) return pts[0];
  if (d >= len) return pts[pts.length - 1];
  let i = 1;
  while (cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}

export function buildTimeline(play) {
  const players = play.players;
  const hikeTime = 0.4; // short pause on "Hike!" before everyone runs
  const paths = players.map((p) => pathOf(p, play));

  const posAt = (i, t) => along(paths[i], (t - hikeTime) * SPEED);

  // Ball segments: hold (ball goes with a player) or fly (ball in the air).
  const segs = [];
  let holder = 0; // QB
  let tNow = hikeTime;

  // Ball exchanges (handoffs and pitches), worked out in time order.
  const events = [];
  players.forEach((p, i) => {
    if (i === 0 || !p.route) return;
    if (p.route.id === 'pitch') events.push({ type: 'pitch', to: i, t: hikeTime + PITCH_DELAY });
    if (p.route.id === 'handoff') events.push({ type: 'handoff', to: i });
  });
  // Handoff time = moment the runner passes closest to the QB.
  for (const e of events) {
    if (e.type !== 'handoff') continue;
    const end = hikeTime + paths[e.to].len / SPEED;
    let best = Infinity;
    for (let t = hikeTime + 0.1; t <= end; t += 0.02) {
      const a = posAt(e.to, t), b = posAt(0, t);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (dist < best - 0.01) { best = dist; e.t = t; }
    }
    if (e.t == null) e.t = hikeTime + 0.3;
  }
  events.sort((a, b) => a.t - b.t);

  for (const e of events) {
    if (e.t < tNow) e.t = tNow;
    segs.push({ type: 'hold', who: holder, t0: tNow, t1: e.t });
    if (e.type === 'pitch') {
      segs.push({ type: 'fly', from: null, fromWho: holder, to: e.to, t0: e.t, t1: e.t + PITCH_FLIGHT, pitch: true });
      tNow = e.t + PITCH_FLIGHT;
    } else {
      tNow = e.t;
      segs.push({ type: 'exchange', at: e.to, t0: e.t, t1: e.t });
    }
    holder = e.to;
  }

  const maxLen = Math.max(...paths.map((p) => p.len));
  const duration = Math.max(hikeTime + maxLen / SPEED, tNow) + 0.8;
  segs.push({ type: 'hold', who: holder, t0: tNow, t1: Infinity });

  function ballAt(t) {
    for (const s of segs) {
      if (t > s.t1 || s.type === 'exchange') continue;
      if (s.type === 'hold') return { pos: posAt(s.who, t), carrier: s.who, air: 0 };
      const from = s.from || posAt(s.fromWho, s.t0);
      const to = posAt(s.to, s.t1);
      const k = Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0)));
      return {
        pos: [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k],
        carrier: -1,
        air: Math.sin(Math.PI * k),
      };
    }
    return { pos: posAt(holder, t), carrier: holder, air: 0 };
  }

  /** Where the ball changes hands, for drawing on the still diagram. */
  function exchanges() {
    return segs
      .filter((s) => s.type === 'exchange' || (s.type === 'fly' && s.pitch))
      .map((s) =>
        s.type === 'exchange'
          ? { kind: 'handoff', at: posAt(s.at, s.t0) }
          : { kind: 'pitch', from: posAt(s.fromWho, s.t0), to: posAt(s.to, s.t1) },
      );
  }

  return { duration, hikeTime, posAt, ballAt, exchanges };
}
