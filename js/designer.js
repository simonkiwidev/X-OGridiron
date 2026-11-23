// The play designer screen: pick routes, tap players, drag, draw, play back.
import { PASS_ROUTES, RUN_PLAYS, CUSTOM, FIELD, DEPTH_NAMES, routeById, defaultDir, hasDepth, iconPoints } from './routes.js';
import { setPlayerCount, addDefender, cleanLabel, MIN_PLAYERS, MAX_PLAYERS, MAX_DEFENDERS } from './formation.js';
import { renderPlay, svgOpen, fromSvg, toSvg, PLAYER_R } from './field.js';
import { buildTimeline } from './timeline.js';
import { $, esc, toast, showScreen } from './ui.js';

/* ---------------- state ---------------- */
let play = null;
let ctx = null; // { save(play), readOnly, back(), actions: [{label, cls, onClick}], subtitle }
let selected = null; // { kind: 'player'|'defender', id }
let armed = null; // route id waiting for a tap
let history = [];
let playback = null;
let svg = null;

export const currentPlay = () => play;

/**
 * Open a play.
 * context.save(play)  – called (debounced) after each change; omit for view-only
 * context.back()      – back button
 * context.actions     – extra buttons for the top bar
 */
export function openDesigner(p, context) {
  stopPlayback();
  play = p;
  ctx = context;
  selected = null;
  armed = null;
  history = [];
  showScreen('designer');
  const d = $('designer');
  d.classList.toggle('readonly', !!ctx.readOnly);
  $('play-name').value = play.name;
  $('play-name').readOnly = !!ctx.readOnly;
  $('saved').textContent = ctx.subtitle || '';
  renderActions();
  render();
}

export function closeDesigner() {
  stopPlayback();
  flushSave();
  play = null;
  ctx = null;
}

export function renderActions() {
  const el = $('top-actions');
  const acts = ctx?.actions || [];
  el.innerHTML = acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}">${esc(a.label)}</button>`).join('');
}
$('top-actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && ctx?.actions?.[b.dataset.act]) ctx.actions[b.dataset.act].onClick(play, b);
});

function snapshot() {
  history.push(JSON.stringify(play));
  if (history.length > 60) history.shift();
}

let saveTimer = null;
function changed() {
  if (!ctx?.save) return;
  play.updated = Date.now();
  clearTimeout(saveTimer);
  $('saved').textContent = '';
  saveTimer = setTimeout(flushSave, 400);
}
function flushSave() {
  if (!saveTimer || !play || !ctx?.save) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const ok = ctx.save(play);
  $('saved').textContent = ok === false ? 'Could not save' : 'Saved ✓';
}

function findPlayer(id) {
  return play.players.find((p) => p.id === id);
}
function findSelected() {
  if (!selected) return null;
  return selected.kind === 'player' ? findPlayer(selected.id) : play.defenders.find((d) => d.id === selected.id);
}

function renderField(extra = '') {
  if (!svg) {
    $('field').innerHTML = svgOpen('fsvg') + '</svg>';
    svg = $('field').firstChild;
  }
  svg.innerHTML = renderPlay(play, { selected }) + extra;
}

function render(extra = '') {
  if (selected && !findSelected()) selected = null;
  renderField(extra);
  renderPanel();
  renderHint();
  $('count').textContent = play.players.length;
  $('btn-minus').disabled = play.players.length <= MIN_PLAYERS;
  $('btn-plus').disabled = play.players.length >= MAX_PLAYERS;
  $('btn-def').disabled = play.defenders.length >= MAX_DEFENDERS;
  $('btn-undo').disabled = history.length === 0;
  for (const b of document.querySelectorAll('[data-route]')) b.classList.toggle('armed', b.dataset.route === armed);
}

function renderHint() {
  const h = $('hint');
  let msg = '';
  if (armed === 'custom') msg = 'Put your finger on a player and draw their route';
  else if (armed) msg = `Now tap a player for <b>${esc(routeById(armed).name)}</b> (or tap a spot to move one there)`;
  h.innerHTML = msg;
  h.classList.toggle('show', !!msg);
}

function renderPanel() {
  const el = $('sel-panel');
  const obj = findSelected();
  if (!obj) {
    el.innerHTML = `<p class="tip"><b>1.</b> Tap a route &nbsp; <b>2.</b> Tap a player.<br>Drag players to move them.</p>`;
    return;
  }
  if (selected.kind === 'defender') {
    el.innerHTML = `<div class="sel-title"><span class="dot def">✕</span> Defender</div>
      <div class="sel-btns"><button class="btn danger" data-sel="remove-def">Remove defender</button></div>`;
    return;
  }
  const r = obj.route;
  const name = r ? routeById(r.id).name : 'No route yet — pick one below';
  const isQB = obj === play.players[0];
  let btns = '';
  if (r) {
    btns += `<button class="btn" data-sel="flip">⇆ Flip</button>`;
    if (hasDepth(r.id)) {
      btns += `<div class="seg">${Object.entries(DEPTH_NAMES)
        .map(([k, v]) => `<button class="btn${(r.depth || 'm') === k ? ' on' : ''}" data-sel="depth" data-depth="${k}">${v}</button>`)
        .join('')}</div>`;
    }
    btns += `<button class="btn danger" data-sel="clear">✕ Remove route</button>`;
  }
  el.innerHTML = `<div class="sel-title"><span class="dot" style="background:${obj.color}">${esc(obj.label)}</span> ${esc(name)}</div>
    <label class="label-edit">Player name
      <input class="label-input" data-label maxlength="2" value="${esc(obj.label)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Player name, up to 2 letters or numbers">
      <span class="muted small">${isQB ? 'Starts with the ball' : '2 letters or numbers'}</span>
    </label>
    <div class="sel-btns">${btns}</div>`;
}

// Renaming a player: up to 2 letters or numbers.
$('sel-panel').addEventListener('focusin', (e) => {
  if (e.target.matches('[data-label]')) snapshot();
});
$('sel-panel').addEventListener('input', (e) => {
  if (!e.target.matches('[data-label]')) return;
  const obj = findSelected();
  if (!obj) return;
  const v = cleanLabel(e.target.value);
  if (e.target.value !== v) e.target.value = v;
  if (!v) return;
  obj.label = v;
  const dot = $('sel-panel').querySelector('.dot');
  if (dot) dot.textContent = v;
  changed();
  renderField();
});
$('sel-panel').addEventListener('focusout', (e) => {
  if (e.target.matches('[data-label]') && !e.target.value) e.target.value = findSelected()?.label || '';
});
$('sel-panel').addEventListener('keydown', (e) => {
  if (e.target.matches('[data-label]') && e.key === 'Enter') e.target.blur();
});

$('sel-panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sel]');
  if (!b) return;
  const obj = findSelected();
  if (!obj) return;
  snapshot();
  const act = b.dataset.sel;
  if (act === 'remove-def') {
    play.defenders = play.defenders.filter((d) => d !== obj);
    selected = null;
  } else if (act === 'flip') obj.route.dir = -(obj.route.dir || 1);
  else if (act === 'depth') obj.route.depth = b.dataset.depth;
  else if (act === 'clear') obj.route = null;
  changed();
  render();
});

/* route buttons */
function routeIcon(id) {
  const pts = iconPoints(id).map(([x, y]) => [x * 30 + 5, y * 30 + 5]);
  const dash = RUN_PLAYS.some((r) => r.id === id) ? ' stroke-dasharray="4 3"' : '';
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const a = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  const p = (dx, dy) => `${(last[0] + dx * Math.cos(a) - dy * Math.sin(a)).toFixed(1)},${(last[1] + dx * Math.sin(a) + dy * Math.cos(a)).toFixed(1)}`;
  return `<svg viewBox="0 0 40 40" class="ricon" aria-hidden="true">
    <polyline points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${dash}/>
    <polygon points="${p(1, 0)} ${p(-6, 4)} ${p(-6, -4)}" fill="currentColor"/>
    <circle cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
}

function buildRouteButtons() {
  const btn = (r) => `<button class="rbtn" data-route="${r.id}">${routeIcon(r.id)}<span>${esc(r.name)}</span></button>`;
  $('routes-pass').innerHTML = PASS_ROUTES.map(btn).join('');
  $('routes-run').innerHTML = RUN_PLAYS.map(btn).join('');
  $('routes-custom').innerHTML = btn(CUSTOM);
}
buildRouteButtons();

document.querySelector('.panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-route]');
  if (!b || !play) return;
  stopPlayback();
  const id = b.dataset.route;
  if (id === 'qbrun') {
    applyRoute(play.players[0], id); // only the QB can do a QB run
    return;
  }
  armed = armed === id ? null : id;
  const obj = findSelected();
  if (armed && armed !== 'custom' && selected?.kind === 'player' && obj && !obj.route && canTake(obj, armed, false)) {
    applyRoute(obj, armed);
    return;
  }
  render();
});

function canTake(player, id, warn = true) {
  if ((id === 'handoff' || id === 'pitch') && player === play.players[0]) {
    if (warn) toast('Tap the player who will GET the ball, not the QB');
    return false;
  }
  return true;
}

function applyRoute(player, id) {
  if (!canTake(player, id)) return;
  snapshot();
  player.route = { id, dir: defaultDir(id, player, play), depth: 'm' };
  armed = null;
  selected = { kind: 'player', id: player.id };
  changed();
  render();
}

/* ---------------- field touch ---------------- */
const fieldEl = $('field');
let down = null;
let drawing = null;

function toField(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return fromSvg([p.x, p.y]);
}

function hitTest([x, y]) {
  let best = null;
  let bestD = 2.8;
  play.players.forEach((p) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) (bestD = d), (best = { kind: 'player', obj: p });
  });
  play.defenders.forEach((p) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) (bestD = d), (best = { kind: 'defender', obj: p });
  });
  return best;
}

function clampPos(kind, [x, y]) {
  const cx = Math.max(PLAYER_R, Math.min(FIELD.width - PLAYER_R, x));
  const cy = kind === 'player' ? Math.max(FIELD.back + 1, Math.min(-0.6, y)) : Math.max(0.6, Math.min(FIELD.front - 1, y));
  return [cx, cy];
}

fieldEl.addEventListener('pointerdown', (e) => {
  if (!play) return;
  if (playback) {
    stopPlayback();
    return;
  }
  if (ctx.readOnly) return;
  e.preventDefault();
  fieldEl.setPointerCapture(e.pointerId);
  const pt = toField(e);
  if (armed === 'custom') {
    let near = null;
    let nd = 4;
    play.players.forEach((p) => {
      const d = Math.hypot(p.x - pt[0], p.y - pt[1]);
      if (d < nd) (nd = d), (near = p);
    });
    if (!near) {
      toast('Start your drawing on a player');
      return;
    }
    drawing = { player: near, pts: [[near.x, near.y]] };
    selected = { kind: 'player', id: near.id };
    return;
  }
  down = { pt, hit: hitTest(pt), cx: e.clientX, cy: e.clientY, moved: false };
});

fieldEl.addEventListener('pointermove', (e) => {
  if (drawing) {
    const pt = toField(e);
    const clamped = [Math.max(0.8, Math.min(FIELD.width - 0.8, pt[0])), Math.max(FIELD.back + 0.5, Math.min(FIELD.front - 0.5, pt[1]))];
    const last = drawing.pts[drawing.pts.length - 1];
    if (Math.hypot(clamped[0] - last[0], clamped[1] - last[1]) > 0.7) {
      drawing.pts.push(clamped);
      const attr = drawing.pts.map((p) => toSvg(p).join(',')).join(' ');
      render(`<polyline points="${attr}" fill="none" stroke="${drawing.player.color}" stroke-width="0.55" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    return;
  }
  if (!down || !down.hit) return;
  if (!down.moved && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) < 8) return;
  if (!down.moved) {
    down.moved = true;
    snapshot();
  }
  const [x, y] = clampPos(down.hit.kind, toField(e));
  down.hit.obj.x = x;
  down.hit.obj.y = y;
  down.hit.obj.auto = false;
  selected = { kind: down.hit.kind, id: down.hit.obj.id };
  render();
});

function finishDrawing() {
  const { player, pts } = drawing;
  drawing = null;
  const simple = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const l = simple[simple.length - 1];
    if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) > 1.5 || i === pts.length - 1) simple.push(pts[i]);
  }
  if (simple.length < 2 || Math.hypot(simple.at(-1)[0] - pts[0][0], simple.at(-1)[1] - pts[0][1]) < 2) {
    toast('Draw a longer route');
    render();
    return;
  }
  snapshot();
  player.route = { id: 'custom', dir: 1, pts: simple.slice(1).map(([x, y]) => [+(x - player.x).toFixed(2), +(y - player.y).toFixed(2)]) };
  armed = null;
  changed();
  render();
}

fieldEl.addEventListener('pointerup', () => {
  if (drawing) return finishDrawing();
  if (!down) return;
  const d = down;
  down = null;
  if (d.moved) {
    changed();
    render();
    return;
  }
  if (armed) {
    if (d.hit?.kind === 'player') return applyRoute(d.hit.obj, armed);
    if (d.hit?.kind === 'defender') return toast('Routes are for your team, not defenders');
    // tapped an empty spot: move the nearest team-mate there and give them the route
    const target = clampPos('player', d.pt);
    let near = null;
    let nd = Infinity;
    play.players.forEach((p) => {
      if (!canTake(p, armed, false)) return;
      const dist = Math.hypot(p.x - target[0], p.y - target[1]);
      if (dist < nd) (nd = dist), (near = p);
    });
    if (!near) return;
    const before = JSON.stringify(play); // so one Undo reverts the move and the route
    near.x = target[0];
    near.y = target[1];
    near.auto = false;
    applyRoute(near, armed);
    history[history.length - 1] = before;
    return;
  }
  selected = d.hit ? { kind: d.hit.kind, id: d.hit.obj.id } : null;
  render();
});

fieldEl.addEventListener('pointercancel', () => {
  drawing = null;
  down = null;
  if (play) render();
});

/* ---------------- playback ---------------- */
function startPlayback(speed) {
  if (playback) {
    stopPlayback();
    return;
  }
  armed = null;
  selected = null;
  render();
  const tl = buildTimeline(play);
  $('field').classList.add('playing');
  const els = play.players.map((_, i) => svg.querySelector('#pl-' + i));
  const ball = svg.querySelector('#ballpos');
  let t = 0;
  let last = performance.now();
  playback = { state: 'running' };
  setPlayButtons();
  const frame = (now) => {
    if (!playback) return;
    t += Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    els.forEach((el, i) => {
      const [x, y] = toSvg(tl.posAt(i, t));
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    });
    const b = tl.ballAt(t);
    const [bx, by] = toSvg(b.carrier >= 0 ? [b.pos[0] + 1.2, b.pos[1] + 0.3] : b.pos);
    ball.setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${(1 + b.air * 0.7).toFixed(2)})`);
    els.forEach((el, i) => el.classList.toggle('carrier', b.carrier === i && t > tl.hikeTime));
    if (t >= tl.duration) {
      playback.state = 'done';
      setPlayButtons();
      return;
    }
    playback.raf = requestAnimationFrame(frame);
  };
  playback.raf = requestAnimationFrame(frame);
}

function stopPlayback() {
  if (!playback) return;
  cancelAnimationFrame(playback.raf);
  playback = null;
  $('field').classList.remove('playing');
  setPlayButtons();
  if (play) render();
}

function setPlayButtons() {
  const p = $('btn-play');
  const s = $('btn-slow');
  if (!playback) {
    p.textContent = '▶ Play';
    s.textContent = '🐢 Slow-mo';
  } else {
    const label = playback.state === 'done' ? '⟲ Reset' : '■ Stop';
    p.textContent = label;
    s.textContent = label;
  }
}

$('btn-play').addEventListener('click', () => startPlayback(1));
$('btn-slow').addEventListener('click', () => startPlayback(0.35));

/* ---------------- toolbar ---------------- */
$('btn-back').addEventListener('click', () => {
  const back = ctx?.back;
  closeDesigner();
  back?.();
});

$('btn-undo').addEventListener('click', () => {
  stopPlayback();
  const prev = history.pop();
  if (!prev) return;
  play = JSON.parse(prev);
  $('play-name').value = play.name;
  changed();
  render();
});

$('play-name').addEventListener('input', (e) => {
  if (ctx?.readOnly) return;
  play.name = e.target.value.trim() || 'Untitled play';
  changed();
});
$('play-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});

function step(n) {
  stopPlayback();
  snapshot();
  setPlayerCount(play, play.players.length + n);
  changed();
  render();
}
$('btn-minus').addEventListener('click', () => step(-1));
$('btn-plus').addEventListener('click', () => step(1));
$('btn-def').addEventListener('click', () => {
  stopPlayback();
  snapshot();
  const d = addDefender(play);
  if (d) selected = { kind: 'defender', id: d.id };
  changed();
  render();
});

window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
