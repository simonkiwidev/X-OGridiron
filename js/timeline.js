// Works out where every player, defender and the ball are at any moment of a play.
// `scene` = { players, defenders } (see scene.js).
import { routePoints } from './routes.js';
import { ZONES, zoneAt, inZone, clampToZone } from './zones.js';

const SPEED = 6.5; // attackers, metres per second at "normal"
const DEF_SPEED = 5.8; // defenders are a little slower, so good routes can get open
const PITCH_DELAY = 0.35;
const PITCH_FLIGHT = 0.45;
const DT = 1 / 30;
export const HIKE_TIME = 0.4; // short pause on "Hike!" before everyone moves

function pathOf(player, scene) {
  const pts = routePoints(player, scene) || [[player.x, player.y]];
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

export const roleOf = (d) => (d.role === 'zone' || d.role === 'mark' ? d.role : 'static');
export const zoneOf = (d) => d.zone || zoneAt(d.x, d.y);

/** Which attacker (index) each marking defender follows. Chosen ones first, then the nearest free attacker. */
export function resolveMarks(scene) {
  const { players, defenders } = scene;
  const res = [];
  const taken = new Set();
  defenders.forEach((d, i) => {
    if (roleOf(d) !== 'mark' || !d.mark) return;
    const a = players.findIndex((p) => p.id === d.mark);
    if (a >= 0) (res[i] = a), taken.add(a);
  });
  defenders.forEach((d, i) => {
    if (roleOf(d) !== 'mark' || res[i] != null || !players.length) return;
    const pick = (allowTaken) => {
      let best = -1;
      let bd = Infinity;
      players.forEach((p, a) => {
        if (!allowTaken && taken.has(a)) return;
        if (a === 0 && players.length > 1 && !allowTaken) return; // leave the QB unless asked
        const dist = Math.hypot(p.x - d.x, p.y - d.y);
        if (dist < bd) (bd = dist), (best = a);
      });
      return best;
    };
    let a = pick(false);
    if (a < 0) a = pick(true);
    if (a >= 0) (res[i] = a), taken.add(a);
  });
  return res;
}

export function buildTimeline(scene) {
  const players = scene.players;
  const defenders = scene.defenders || [];
  const hikeTime = HIKE_TIME;
  const paths = players.map((p) => pathOf(p, scene));
  const posAt = (i, t) => along(paths[i], (t - hikeTime) * SPEED);

  /* ----- the ball ----- */
  const segs = [];
  let holder = 0; // QB
  let tNow = hikeTime;
  const events = [];
  players.forEach((p, i) => {
    if (i === 0 || !p.route) return;
    if (p.route.id === 'pitch') events.push({ type: 'pitch', to: i, t: hikeTime + PITCH_DELAY });
    if (p.route.id === 'handoff') events.push({ type: 'handoff', to: i });
  });
  for (const e of events) {
    if (e.type !== 'handoff') continue;
    const end = hikeTime + paths[e.to].len / SPEED;
    let best = Infinity;
    for (let t = hikeTime + 0.1; t <= end; t += 0.02) {
      const a = posAt(e.to, t);
      const b = posAt(0, t);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (dist < best - 0.01) (best = dist), (e.t = t);
    }
    if (e.t == null) e.t = hikeTime + 0.3;
  }
  events.sort((a, b) => a.t - b.t);
  for (const e of events) {
    if (e.t < tNow) e.t = tNow;
    segs.push({ type: 'hold', who: holder, t0: tNow, t1: e.t });
    if (e.type === 'pitch') {
      segs.push({ type: 'fly', fromWho: holder, to: e.to, t0: e.t, t1: e.t + PITCH_FLIGHT, pitch: true });
      tNow = e.t + PITCH_FLIGHT;
    } else {
      tNow = e.t;
      segs.push({ type: 'exchange', at: e.to, t0: e.t, t1: e.t });
    }
    holder = e.to;
  }
  const maxLen = Math.max(0, ...paths.map((p) => p.len));
  const duration = Math.max(hikeTime + maxLen / SPEED, tNow, defenders.length ? 3 : 0) + 0.8;
  segs.push({ type: 'hold', who: holder, t0: tNow, t1: Infinity });

  function ballAt(t) {
    if (!players.length) return null;
    for (const s of segs) {
      if (t > s.t1 || s.type === 'exchange') continue;
      if (s.type === 'hold') return { pos: posAt(s.who, t), carrier: s.who, air: 0 };
      const from = posAt(s.fromWho, s.t0);
      const to = posAt(s.to, s.t1);
      const k = Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0)));
      return { pos: [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k], carrier: -1, air: Math.sin(Math.PI * k) };
    }
    return { pos: posAt(holder, t), carrier: holder, air: 0 };
  }

  function exchanges() {
    return segs
      .filter((s) => s.type === 'exchange' || (s.type === 'fly' && s.pitch))
      .map((s) =>
        s.type === 'exchange'
          ? { kind: 'handoff', at: posAt(s.at, s.t0) }
          : { kind: 'pitch', from: posAt(s.fromWho, s.t0), to: posAt(s.to, s.t1) },
      );
  }

  /* ----- defenders ----- */
  const marks = resolveMarks(scene);
  const steps = Math.ceil(duration / DT) + 2;
  const tracks = defenders.map((d, i) => {
    const role = roleOf(d);
    const track = new Float32Array(steps * 2);
    let x = d.x;
    let y = d.y;
    const z = role === 'zone' ? ZONES[zoneOf(d)] : null;
    const home = z ? (inZone(z, x, y) ? [x, y] : z.centre) : [x, y];
    for (let k = 0; k < steps; k++) {
      const t = k * DT;
      if (t > hikeTime && role !== 'static') {
        let target = home;
        if (role === 'mark' && marks[i] != null) {
          const [ax, ay] = posAt(marks[i], t);
          target = [ax, ay + 1.2]; // stay on the far side of them
        } else if (z) {
          // Chase the nearest attacker inside my zone, otherwise go back to my spot.
          let best = null;
          let bd = Infinity;
          for (let a = 0; a < players.length; a++) {
            const [ax, ay] = posAt(a, t);
            if (!inZone(z, ax, ay, 0.5)) continue;
            const dd = Math.hypot(ax - x, ay - y);
            if (dd < bd) (bd = dd), (best = [ax, ay + 1]);
          }
          target = best ? clampToZone(z, best[0], best[1], 1.5) : home;
        }
        const dx = target[0] - x;
        const dy = target[1] - y;
        const dist = Math.hypot(dx, dy);
        const step = DEF_SPEED * DT;
        if (dist > step) (x += (dx / dist) * step), (y += (dy / dist) * step);
        else (x = target[0]), (y = target[1]);
      }
      track[k * 2] = x;
      track[k * 2 + 1] = y;
    }
    return track;
  });

  function defAt(i, t) {
    const tr = tracks[i];
    const f = Math.max(0, Math.min(steps - 1.001, t / DT));
    const k = Math.floor(f);
    const u = f - k;
    return [tr[k * 2] + (tr[k * 2 + 2] - tr[k * 2]) * u, tr[k * 2 + 1] + (tr[k * 2 + 3] - tr[k * 2 + 1]) * u];
  }

  return { duration, hikeTime, posAt, ballAt, exchanges, defAt, marks };
}
