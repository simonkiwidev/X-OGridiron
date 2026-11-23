import { PASS_ROUTES, RUN_PLAYS, CUSTOM, FIELD, DEPTH_NAMES, routeById, defaultDir, hasDepth, iconPoints } from './routes.js';
import { newPlay, setPlayerCount, addDefender, MIN_PLAYERS, MAX_PLAYERS, MAX_DEFENDERS } from './formation.js';
import { renderPlay, svgOpen, fromSvg, toSvg, PLAYER_R } from './field.js';
import { buildTimeline } from './timeline.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------------- state ---------------- */
let play = null;
let selected = null; // { kind: 'player'|'defender', id }
let armed = null; // route id waiting for a tap
let history = [];
let playback = null; // { raf, state: 'running'|'done' }
let svg = null;

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------------- routing ---------------- */
function route() {
  stopPlayback();
  const m = location.hash.match(/^#\/play\/(.+)$/);
  if (m) {
    const p = store.getPlay(decodeURIComponent(m[1]));
    if (p) return openDesigner(p);
    location.replace('#/');
    return;
  }
  showHome();
}
window.addEventListener('hashchange', route);

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

/* ---------------- home ---------------- */
function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function showHome() {
  play = null;
  show('home');
  const list = store.listPlays();
  $('empty').hidden = list.length > 0;
  $('play-list').innerHTML = list
    .map(
      (p) => `
    <article class="card" data-id="${esc(p.id)}">
      <button class="thumb" data-act="open" aria-label="Open ${esc(p.name)}">${svgOpen('tsvg')}${renderPlay(p, { thumb: true })}</svg></button>
      <div class="card-info">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-meta">${p.players.length} players · ${ago(p.updated)}</div>
      </div>
      <div class="card-acts">
        <button class="btn small" data-act="copy">Copy</button>
        <button class="btn small danger" data-act="delete">Delete</button>
      </div>
    </article>`,
    )
    .join('');
}

$('play-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.card').dataset.id;
  const p = store.getPlay(id);
  if (!p) return;
  if (btn.dataset.act === 'open') location.hash = '#/play/' + encodeURIComponent(id);
  if (btn.dataset.act === 'copy') {
    const c = clone(p);
    c.id = newPlay('x').id;
    c.name = (p.name + ' copy').slice(0, 30);
    c.created = c.updated = Date.now();
    store.savePlay(c);
    showHome();
    toast('Copied!');
  }
  if (btn.dataset.act === 'delete' && confirm(`Delete "${p.name}"?`)) {
    store.deletePlay(id);
    showHome();
  }
});

$('btn-new').addEventListener('click', () => {
  const n = store.listPlays().length + 1;
  const p = newPlay(`Play ${n}`);
  store.savePlay(p);
  location.hash = '#/play/' + encodeURIComponent(p.id);
});

/* ---------------- designer ---------------- */
function openDesigner(p) {
  play = p;
  selected = null;
  armed = null;
  history = [];
  show('designer');
  $('play-name').value = play.name;
  $('saved').textContent = '';
  render();
}

function snapshot() {
  history.push(JSON.stringify(play));
  if (history.length > 60) history.shift();
}

let saveTimer;
function changed() {
  play.updated = Date.now();
  clearTimeout(saveTimer);
  $('saved').textContent = '';
  saveTimer = setTimeout(() => {
    const ok = store.savePlay(play);
    $('saved').textContent = ok ? 'Saved ✓' : 'Could not save';
  }, 250);
}

function findPlayer(id) {
  return play.players.find((p) => p.id === id);
}
function findSelected() {
  if (!selected) return null;
  return selected.kind === 'player' ? findPlayer(selected.id) : play.defenders.find((d) => d.id === selected.id);
}

function render(extra = '') {
  if (!svg) {
    $('field').innerHTML = svgOpen('fsvg') + '</svg>';
    svg = $('field').firstChild;
  }
  if (selected && !findSelected()) selected = null;
  svg.innerHTML = renderPlay(play, { selected }) + extra;
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
    <div class="sel-btns">${btns}</div>`;
}

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
  const pts = iconPoints(id).map(([x, y]) => `${(x * 30 + 5).toFixed(1)},${(y * 30 + 5).toFixed(1)}`);
  const dash = RUN_PLAYS.some((r) => r.id === id) ? ' stroke-dasharray="4 3"' : '';
  const last = pts[pts.length - 1].split(',').map(Number);
  const prev = pts[pts.length - 2].split(',').map(Number);
  const a = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
  const p = (dx, dy) => `${(last[0] + dx * Math.cos(a) - dy * Math.sin(a)).toFixed(1)},${(last[1] + dx * Math.sin(a) + dy * Math.cos(a)).toFixed(1)}`;
  const start = pts[0];
  return `<svg viewBox="0 0 40 40" class="ricon" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${dash}/>
    <polygon points="${p(1, 0)} ${p(-6, 4)} ${p(-6, -4)}" fill="currentColor"/>
    <circle cx="${start.split(',')[0]}" cy="${start.split(',')[1]}" r="3.5" fill="currentColor"/></svg>`;
}

function buildRouteButtons() {
  const btn = (r) => `<button class="rbtn" data-route="${r.id}">${routeIcon(r.id)}<span>${esc(r.name)}</span></button>`;
  $('routes-pass').innerHTML = PASS_ROUTES.map(btn).join('');
  $('routes-run').innerHTML = RUN_PLAYS.map(btn).join('');
  $('routes-custom').innerHTML = btn(CUSTOM);
}

document.querySelector('.panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-route]');
  if (!b) return;
  stopPlayback();
  const id = b.dataset.route;
  if (id === 'qbrun') {
    // Only the QB can do a QB run, so do it straight away.
    applyRoute(play.players[0], id);
    return;
  }
  armed = armed === id ? null : id;
  // If a player is already selected and has no route, give it to them straight away.
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
  selected = { kind: down.hit.kind, id: down.hit.obj.id };
  render();
});

function finishDrawing() {
  const { player, pts } = drawing;
  drawing = null;
  // thin out the points so the route is smooth
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

fieldEl.addEventListener('pointerup', (e) => {
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
    // applyRoute takes its own snapshot; swap it for the pre-move state so one Undo reverts both
    const before = JSON.stringify(play);
    near.x = target[0];
    near.y = target[1];
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
  render();
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
  if (play) store.savePlay(play);
  location.hash = '#/';
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
  play.name = e.target.value.trim() || 'Untitled play';
  changed();
});
$('play-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});

$('btn-minus').addEventListener('click', () => {
  stopPlayback();
  snapshot();
  setPlayerCount(play, play.players.length - 1);
  changed();
  render();
});
$('btn-plus').addEventListener('click', () => {
  stopPlayback();
  snapshot();
  setPlayerCount(play, play.players.length + 1);
  changed();
  render();
});
$('btn-def').addEventListener('click', () => {
  stopPlayback();
  snapshot();
  const d = addDefender(play);
  if (d) selected = { kind: 'defender', id: d.id };
  changed();
  render();
});

/* ---------------- start ---------------- */
buildRouteButtons();
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
