// Works out where every player, defender and the ball are at any moment of a play.
// `scene` = { players, defenders } (see scene.js).
import { routePoints, FIELD } from './routes.js';
import { ZONES, zoneAt, inZone, clampToZone, LINES } from './zones.js';

const SPEED = 6.5; // attackers, metres per second at "normal"
const DEF_SPEED = 5.8; // defenders are a little slower, so good routes can get open
const CHASE_SPEED = 7.4; // ...but sprint when chasing the ball carrier
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

const PASS_SPEED = 14; // ball in the air, units per second
const THROW_AFTER = 1.6; // seconds after the hike that the QB throws
const TAG_DIST = 1.4; // a defender this close to the ball carrier tags them
const COVER_DIST = 2.2; // a defender this close to the catch = covered
const CHASE_RANGE = 12; // defenders chase a live runner this close to them

/**
 * Everything about how a play unfolds.
 * opts.simulate: stop when the runner is tagged / the pass is covered, and work out a result.
 */
export function buildTimeline(scene, opts = {}) {
  const simulate = !!opts.simulate;
  const players = scene.players;
  const defenders = scene.defenders || [];
  const hikeTime = HIKE_TIME;
  const paths = players.map((p) => pathOf(p, scene));
  const rawPos = (i, t) => along(paths[i], (t - hikeTime) * SPEED);

  // Whoever ends up with the ball keeps running upfield after their route (run after the catch).
  const finalCarrier = (() => {
    const t = players.findIndex((p, i) => i > 0 && p.target);
    if (t > 0) return t;
    let last = -1;
    players.forEach((p, i) => {
      if (i > 0 && (p.route?.id === 'handoff' || p.route?.id === 'pitch')) last = i;
    });
    if (last > 0) return last;
    return players[0]?.route ? 0 : -1;
  })();
  if (finalCarrier >= 0) {
    const path = paths[finalCarrier];
    const end = path.pts[path.pts.length - 1];
    const goal = FIELD.front - 0.5;
    if (end[1] < goal - 0.5) {
      path.pts = [...path.pts, [end[0], goal]];
      path.cum = [...path.cum, path.len + (goal - end[1])];
      path.len += goal - end[1];
    }
  }

  /* ----- the ball: handoffs, pitches and the pass ----- */
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
      const a = rawPos(e.to, t);
      const b = rawPos(0, t);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (dist < best - 0.01) (best = dist), (e.t = t);
    }
    if (e.t == null) e.t = hikeTime + 0.3;
  }
  const targetIdx = players.findIndex((p, i) => i > 0 && p.target);
  if (targetIdx > 0) events.push({ type: 'pass', to: targetIdx, t: hikeTime + THROW_AFTER });
  events.sort((a, b) => a.t - b.t);

  const segs = [];
  let holder = 0;
  let tNow = hikeTime;
  let passSeg = null;
  for (const e of events) {
    if (e.t < tNow) e.t = tNow;
    if (e.type === 'pass') {
      // Only a forward pass from behind the line, and not to the player who already has it.
      if (e.to === holder || rawPos(holder, e.t)[1] >= 0) continue;
      const from = rawPos(holder, e.t);
      let t1 = e.t + 0.5;
      for (let k = 0; k < 4; k++) {
        const to = rawPos(e.to, t1);
        t1 = e.t + Math.max(0.3, Math.hypot(to[0] - from[0], to[1] - from[1]) / PASS_SPEED);
      }
      segs.push({ type: 'hold', who: holder, t0: tNow, t1: e.t });
      passSeg = { type: 'fly', fromWho: holder, to: e.to, t0: e.t, t1, pass: true };
      segs.push(passSeg);
      tNow = t1;
      holder = e.to;
      continue;
    }
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
  segs.push({ type: 'hold', who: holder, t0: tNow, t1: Infinity });
  const handedOff = events.some((e) => e.type !== 'pass');

  function rawBall(t) {
    if (!players.length) return null;
    for (const s of segs) {
      if (t > s.t1 || s.type === 'exchange') continue;
      if (s.type === 'hold') return { pos: rawPos(s.who, t), carrier: s.who, air: 0 };
      const from = rawPos(s.fromWho, s.t0);
      const to = rawPos(s.to, s.t1);
      const k = Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0)));
      return { pos: [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k], carrier: -1, air: Math.sin(Math.PI * k) };
    }
    return { pos: rawPos(holder, t), carrier: holder, air: 0 };
  }

  const maxLen = Math.max(0, ...paths.map((p) => p.len));
  let duration = Math.max(hikeTime + maxLen / SPEED, tNow, defenders.length ? 3 : 0) + 0.8;

  /* ----- defenders, step by step (they react to the attack) ----- */
  const marks = resolveMarks(scene);
  const steps = Math.ceil(duration / DT) + 2;
  const tracks = defenders.map(() => new Float32Array(steps * 2));
  const state = defenders.map((d) => {
    const role = roleOf(d);
    const z = role === 'zone' ? ZONES[zoneOf(d)] : null;
    return { x: d.x, y: d.y, role, z, home: z ? (inZone(z, d.x, d.y) ? [d.x, d.y] : z.centre) : [d.x, d.y] };
  });
  const nearestDef = (pt) => {
    let best = -1;
    let bd = Infinity;
    state.forEach((st, i) => {
      const dd = Math.hypot(st.x - pt[0], st.y - pt[1]);
      if (dd < bd) (bd = dd), (best = i);
    });
    return { i: best, d: bd };
  };

  let result = null;
  let caught = null;
  let lastK = steps - 1;
  for (let k = 0; k < steps; k++) {
    const t = k * DT;
    const b = rawBall(t);
    // A "live" runner: anyone with the ball past the line, or anyone but the QB.
    const live = b && b.carrier >= 0 && t > hikeTime && (b.carrier !== 0 || b.pos[1] > 0);
    state.forEach((st, i) => {
      if (t <= hikeTime || st.role === 'static') return;
      let target = st.home;
      if (st.role === 'mark' && marks[i] != null) {
        const [ax, ay] = rawPos(marks[i], t);
        target = [ax, ay + 1.2];
      } else if (st.z) {
        let best = null;
        let bd = Infinity;
        for (let a = 0; a < players.length; a++) {
          const [ax, ay] = rawPos(a, t);
          if (!inZone(st.z, ax, ay, 0.5)) continue;
          const dd = Math.hypot(ax - st.x, ay - st.y);
          if (dd < bd) (bd = dd), (best = [ax, ay + 1]);
        }
        target = best ? clampToZone(st.z, best[0], best[1], 1.5) : st.home;
      }
      let speed = DEF_SPEED;
      if (live && Math.hypot(b.pos[0] - st.x, b.pos[1] - st.y) < CHASE_RANGE) (target = b.pos), (speed = CHASE_SPEED); // go for the tag!
      const dx = target[0] - st.x;
      const dy = target[1] - st.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = speed * DT;
      if (dist > stepLen) (st.x += (dx / dist) * stepLen), (st.y += (dy / dist) * stepLen);
      else (st.x = target[0]), (st.y = target[1]);
    });
    state.forEach((st, i) => {
      tracks[i][k * 2] = st.x;
      tracks[i][k * 2 + 1] = st.y;
    });

    if (!simulate || result || t <= hikeTime || !defenders.length) continue;
    // The catch: is a defender right there?
    if (passSeg && !caught && t >= passSeg.t1) {
      const at = rawPos(passSeg.to, passSeg.t1);
      const n = nearestDef(at);
      if (n.d < COVER_DIST) result = { type: 'covered', t: passSeg.t1, where: at, who: passSeg.to, by: n.i };
      else caught = { t: passSeg.t1, where: at };
    }
    // The tag (or sack)
    if (!result && b && b.carrier >= 0) {
      const n = nearestDef(b.pos);
      if (n.d < TAG_DIST) {
        const sack = b.carrier === 0 && b.pos[1] < 0 && !handedOff && !caught;
        result = { type: sack ? 'sack' : 'tagged', t, where: b.pos, who: b.carrier, by: n.i, gain: b.pos[1], caught: !!caught };
      }
    }
    if (!result && b && b.carrier >= 0 && b.pos[1] >= LINES[3]) {
      result = { type: 'touchdown', t, where: b.pos, who: b.carrier, caught: !!caught };
    }
    if (result) {
      lastK = k;
      // freeze everyone where they are
      for (let r = k + 1; r < steps; r++) {
        state.forEach((st, i) => {
          tracks[i][r * 2] = st.x;
          tracks[i][r * 2 + 1] = st.y;
        });
      }
      break;
    }
  }

  const stopT = result ? result.t : Infinity;
  if (result) duration = result.t + 1.4;
  const clampT = (t) => Math.min(t, stopT);
  const posAt = (i, t) => rawPos(i, clampT(t));

  function defAt(i, t) {
    const tr = tracks[i];
    const f = Math.max(0, Math.min(Math.min(steps, lastK + 1) - 1.001, clampT(t) / DT));
    const k = Math.floor(f);
    const u = f - k;
    return [tr[k * 2] + (tr[k * 2 + 2] - tr[k * 2]) * u, tr[k * 2 + 1] + (tr[k * 2 + 3] - tr[k * 2 + 1]) * u];
  }

  // Results that only become clear at the end (or at the throw).
  if (simulate && !result && players.length) {
    const endT = duration - 0.8;
    if (passSeg) {
      const fin = rawPos(passSeg.to, endT);
      result = { type: 'complete', t: endT, where: fin, who: passSeg.to, gain: fin[1] };
    } else if (handedOff || players[0].route) {
      const fin = rawBall(endT);
      result = { type: 'run', t: endT, where: fin.pos, who: fin.carrier, gain: fin.pos[1] };
    } else {
      // No pass target: who was open when the QB would throw?
      const tt = hikeTime + THROW_AFTER;
      const open = [];
      const covered = [];
      players.forEach((p, i) => {
        if (i === 0) return;
        const at = rawPos(i, tt);
        let nd = Infinity;
        defenders.forEach((_, j) => {
          const dp = defAt(j, tt);
          nd = Math.min(nd, Math.hypot(dp[0] - at[0], dp[1] - at[1]));
        });
        (nd < COVER_DIST * 1.2 ? covered : open).push(i);
      });
      result = { type: 'scan', t: tt, open, covered };
    }
  }

  function ballAt(t) {
    if (result?.type === 'covered' && t >= result.t) return { pos: result.where, carrier: -1, air: 0, dropped: true };
    return rawBall(clampT(t));
  }

  function exchanges() {
    return segs
      .filter((s) => s.type === 'exchange' || (s.type === 'fly' && (s.pitch || s.pass)))
      .map((s) =>
        s.type === 'exchange'
          ? { kind: 'handoff', at: rawPos(s.at, s.t0) }
          : { kind: s.pass ? 'pass' : 'pitch', from: rawPos(s.fromWho, s.t0), to: rawPos(s.to, s.t1) },
      );
  }

  return { duration, hikeTime, posAt, ballAt, exchanges, defAt, marks, result, throwTime: hikeTime + THROW_AFTER };
}
