// The play designer screen. Works for attack plays (players + routes) and
// defence set-ups (defenders who stay, guard a zone or mark an attacker).
import { PASS_ROUTES, RUN_PLAYS, CUSTOM, FIELD, DEPTH_NAMES, routeById, defaultDir, hasDepth, iconPoints, toMetres } from './routes.js';
import { setPlayerCount, addDefender, setDefenderCount, cleanLabel, sampleDefence, MIN_PLAYERS, MAX_PLAYERS, MAX_DEFENDERS } from './formation.js';
import { renderPlay, svgOpen, fromSvg, toSvg, PLAYER_R } from './field.js';
import { buildTimeline, roleOf, zoneOf, resolveMarks } from './timeline.js';
import { ZONES, zoneAt, linesCrossed } from './zones.js';
import { sceneOf, opponentOf, kindOf } from './scene.js';
import { $, esc, toast, showScreen } from './ui.js';

/* ---------------- state ---------------- */
let play = null;
let ctx = null; // { save(play), readOnly, back(), actions: [{label, cls, onClick}], subtitle, library() }
let scene = null;
let selected = null; // { kind: 'player'|'defender', id }
let armed = null; // route id waiting for a tap
let history = [];
let playback = null;
let svg = null;

export const currentPlay = () => play;
const isDefence = () => kindOf(play) === 'defence';
const library = () => (ctx?.library ? ctx.library() : []);

/**
 * Open a play.
 * context.save(play)  – called (debounced) after each change; omit for view-only
 * context.back()      – back button
 * context.actions     – extra buttons for the top bar
 * context.library()   – plays this play can be tried against
 */
export function openDesigner(p, context) {
  stopPlayback();
  play = p;
  ctx = context;
  selected = null;
  armed = null;
  history = [];
  svg = null;
  hideResult();
  showScreen('designer');
  const d = $('designer');
  d.classList.toggle('readonly', !!ctx.readOnly);
  d.classList.toggle('kind-defence', isDefence());
  $('play-name').value = play.name;
  $('play-name').readOnly = !!ctx.readOnly;
  $('saved').textContent = ctx.subtitle || '';
  renderActions();
  renderVsChoices();
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

/* "Try against" chooser */
function renderVsChoices() {
  const sel = $('vs-select');
  const lib = library().filter((p) => p.id !== play.id);
  let opts;
  if (isDefence()) {
    opts = [['sample', 'Sample attack'], ...lib.filter((p) => kindOf(p) === 'offence').map((p) => [p.id, p.name])];
  } else {
    opts = [['none', 'No defence'], ...lib.filter((p) => kindOf(p) === 'defence').map((p) => [p.id, '🛡 ' + p.name])];
  }
  const current = play.vs && opts.some(([id]) => id === play.vs) ? play.vs : opts[0][0];
  sel.innerHTML = opts.map(([id, name]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(name)}</option>`).join('');
  $('vs-label').textContent = isDefence() ? 'Try against' : 'Against';
}
$('vs-select').addEventListener('change', (e) => {
  stopPlayback();
  play.vs = e.target.value;
  selected = null;
  changed();
  render();
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

function findSelected() {
  if (!selected || !scene) return null;
  if (selected.kind === 'player') return scene.editPlayers ? scene.players.find((p) => p.id === selected.id) : null;
  return scene.editDefenders ? scene.defenders.find((d) => d.id === selected.id) : null;
}

/* ---------------- drawing ---------------- */
let testDefence = null; // sample defence used by Simulate when there's no defence
function computeScene() {
  scene = sceneOf(play, opponentOf(play, library()));
  if (testDefence && !scene.defenders.length) scene = { ...scene, defenders: testDefence.defenders, editDefenders: false };
}

function renderField(extra = '') {
  if (!svg) {
    $('field').innerHTML = svgOpen('fsvg') + '</svg>';
    svg = $('field').firstChild;
  }
  svg.innerHTML = renderPlay(play, { selected, scene }) + extra;
}

function render(extra = '') {
  computeScene();
  if (selected && !findSelected()) selected = null;
  renderField(extra);
  renderPanel();
  renderHint();
  const def = isDefence();
  const n = def ? play.defenders.length : play.players.length;
  $('count').textContent = n;
  $('count-label').textContent = def ? (n === 1 ? 'defender' : 'defenders') : 'players';
  $('btn-minus').disabled = n <= (def ? 1 : MIN_PLAYERS);
  $('btn-plus').disabled = n >= (def ? MAX_DEFENDERS : MAX_PLAYERS);
  $('btn-def').disabled = !scene.editDefenders || play.defenders.length >= MAX_DEFENDERS;
  $('btn-undo').disabled = history.length === 0;
  for (const b of document.querySelectorAll('[data-route]')) b.classList.toggle('armed', b.dataset.route === armed);
  $('def-group').hidden = !scene.editDefenders || !scene.defenders.length;
}

function renderHint() {
  const h = $('hint');
  let msg = '';
  if (armed === 'custom') msg = 'Put your finger on a player and draw their route';
  else if (armed) msg = `Now tap a player for <b>${esc(routeById(armed).name)}</b> (or tap a spot to move one there)`;
  h.innerHTML = msg;
  h.classList.toggle('show', !!msg);
}

const labelEditor = (obj, note) => `
  <label class="label-edit">Name
    <input class="label-input" data-label maxlength="2" value="${esc(obj.label || '')}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Name, up to 2 letters or numbers">
    <span class="muted small">${note}</span>
  </label>`;

const ROLE_BTNS = [
  ['static', '🧍 Stay'],
  ['zone', '🟥 Zone'],
  ['mark', '👁 Mark'],
];

function renderPanel() {
  const el = $('sel-panel');
  const obj = findSelected();
  if (!obj) {
    el.innerHTML = isDefence()
      ? `<p class="tip"><b>Tap a defender</b> to choose their job.<br>Drag them to move them. Drop a zone defender in a square to guard it.</p>`
      : `<p class="tip"><b>1.</b> Tap a route &nbsp; <b>2.</b> Tap a player.<br>Drag players to move them.</p>`;
    return;
  }
  if (selected.kind === 'defender') {
    const role = roleOf(obj);
    const marks = resolveMarks(scene);
    const idx = scene.defenders.indexOf(obj);
    const markIdx = marks[idx];
    let extra = '';
    if (role === 'zone') {
      const z = zoneOf(obj);
      extra = `<div class="chip-row"><span class="muted small">Guard zone</span>${Object.values(ZONES)
        .map((zz) => `<button class="chip${zz.id === z ? ' on' : ''}" data-zone="${zz.id}" title="${zz.name}">${zz.id}</button>`)
        .join('')}<span class="muted small">${ZONES[z].name}</span></div>`;
    } else if (role === 'mark') {
      extra = scene.players.length
        ? `<div class="chip-row"><span class="muted small">Mark</span>
            <button class="chip${!obj.mark ? ' on' : ''}" data-mark="">Nearest</button>
            ${scene.players
              .map(
                (p, a) =>
                  `<button class="chip pchip${obj.mark === p.id ? ' on' : ''}${!obj.mark && markIdx === a ? ' auto' : ''}" style="--pc:${p.color}" data-mark="${esc(p.id)}">${esc(p.label)}</button>`,
              )
              .join('')}</div>`
        : `<p class="muted small">Pick an attack to try against, then choose who to mark.</p>`;
    }
    el.innerHTML = `<div class="sel-title"><span class="dot def">${esc(obj.label || '')}</span> Defender</div>
      ${labelEditor(obj, '2 letters or numbers')}
      <div class="seg role-seg">${ROLE_BTNS.map(([r, t]) => `<button class="btn${role === r ? ' on' : ''}" data-role="${r}">${t}</button>`).join('')}</div>
      ${extra}
      <div class="sel-btns"><button class="btn danger" data-sel="remove-def">Remove defender</button></div>`;
    return;
  }
  const r = obj.route;
  const name = r ? routeById(r.id).name : 'No route yet — pick one below';
  const isQB = obj === play.players[0];
  let btns = '';
  if (!isQB) btns += `<button class="btn${obj.target ? ' on-target' : ''}" data-sel="target">🎯 ${obj.target ? 'QB throws here ✓' : 'Throw here'}</button>`;
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
    ${labelEditor(obj, isQB ? 'Starts with the ball' : '2 letters or numbers')}
    <div class="sel-btns">${btns}</div>`;
}

// Renaming: up to 2 letters or numbers.
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

function setRole(d, role) {
  d.role = role;
  if (role === 'zone') d.zone = zoneAt(d.x, d.y);
  if (role === 'mark' && d.mark === undefined) d.mark = null;
}

$('sel-panel').addEventListener('click', (e) => {
  const obj = findSelected();
  if (!obj) return;
  const roleBtn = e.target.closest('[data-role]');
  const zoneBtn = e.target.closest('[data-zone]');
  const markBtn = e.target.closest('[data-mark]');
  const b = e.target.closest('[data-sel]');
  if (!roleBtn && !zoneBtn && !markBtn && !b) return;
  stopPlayback();
  snapshot();
  if (roleBtn) setRole(obj, roleBtn.dataset.role);
  else if (zoneBtn) {
    obj.zone = +zoneBtn.dataset.zone;
    const z = ZONES[obj.zone];
    if (zoneAt(obj.x, obj.y) !== obj.zone) {
      // walk them into their zone, next to anyone already standing in the middle
      const spots = [[0, 0], [-5, 0], [5, 0], [0, -3], [0, 3]].map(([dx, dy]) => [z.centre[0] + dx, z.centre[1] + dy]);
      const free = spots.find(([x, y]) => !play.defenders.some((d) => d !== obj && Math.hypot(d.x - x, d.y - y) < 2.5));
      [obj.x, obj.y] = free || z.centre;
    }
  } else if (markBtn) obj.mark = markBtn.dataset.mark || null;
  else {
    const act = b.dataset.sel;
    if (act === 'remove-def') {
      play.defenders = play.defenders.filter((d) => d !== obj);
      selected = null;
    } else if (act === 'flip') obj.route.dir = -(obj.route.dir || 1);
    else if (act === 'depth') obj.route.depth = b.dataset.depth;
    else if (act === 'clear') obj.route = null;
    else if (act === 'target') {
      const on = !obj.target;
      play.players.forEach((p) => delete p.target); // only one receiver
      if (on) obj.target = true;
      if (on) toast(`The QB will throw to ${obj.label}`);
    }
  }
  changed();
  render();
});

// "Everyone" buttons for the whole defence.
$('def-group').addEventListener('click', (e) => {
  const b = e.target.closest('[data-all]');
  if (!b || !scene.editDefenders) return;
  stopPlayback();
  snapshot();
  play.defenders.forEach((d) => {
    setRole(d, b.dataset.all);
    if (b.dataset.all === 'mark') d.mark = null;
  });
  changed();
  render();
  toast({ static: 'Everyone stays put', zone: 'Everyone guards the zone they stand in', mark: 'Everyone marks the nearest attacker' }[b.dataset.all]);
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
  if (!b || !play || isDefence()) return;
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
  if (scene.editPlayers) {
    scene.players.forEach((p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) (bestD = d), (best = { kind: 'player', obj: p });
    });
  }
  if (scene.editDefenders) {
    scene.defenders.forEach((p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) (bestD = d), (best = { kind: 'defender', obj: p });
    });
  }
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
      renderField(`<polyline points="${attr}" fill="none" stroke="${drawing.player.color}" stroke-width="0.55" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
    return;
  }
  if (!down || !down.hit) return;
  if (!down.moved && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) < 8) return;
  if (!down.moved) {
    down.moved = true;
    snapshot();
  }
  const o = down.hit.obj;
  [o.x, o.y] = clampPos(down.hit.kind, toField(e));
  o.auto = false;
  // Zone defenders guard whichever square they're dropped in.
  if (down.hit.kind === 'defender' && roleOf(o) === 'zone') o.zone = zoneAt(o.x, o.y);
  selected = { kind: down.hit.kind, id: o.id };
  renderField();
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
    [near.x, near.y] = target;
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
function startPlayback(speed, simulate = false) {
  if (playback) {
    stopPlayback();
    return;
  }
  armed = null;
  selected = null;
  hideResult();
  if (simulate) {
    computeScene();
    if (!scene.players.length) return toast('Pick an attack to try against first');
    if (!scene.defenders.length) {
      testDefence = sampleDefence();
      toast('No defence picked, so testing against a sample defence');
    }
  }
  render();
  const tl = buildTimeline(scene, { simulate });
  $('field').classList.add('playing');
  const pEls = scene.players.map((_, i) => svg.querySelector('#pl-' + i));
  const dEls = scene.defenders.map((_, i) => svg.querySelector('#df-' + i));
  const ball = svg.querySelector('#ballpos');
  let t = 0;
  let last = performance.now();
  let shown = false;
  playback = { state: 'running' };
  setPlayButtons();
  const place = (el, pos) => {
    const [x, y] = toSvg(pos);
    el?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  };
  const frame = (now) => {
    if (!playback) return;
    t += Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    pEls.forEach((el, i) => place(el, tl.posAt(i, t)));
    dEls.forEach((el, i) => place(el, tl.defAt(i, t)));
    const b = tl.ballAt(t);
    if (b && ball) {
      const [bx, by] = toSvg(b.carrier >= 0 ? [b.pos[0] + 1.2, b.pos[1] + 0.3] : b.pos);
      ball.setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${(1 + b.air * 0.7).toFixed(2)})`);
      pEls.forEach((el, i) => el?.classList.toggle('carrier', b.carrier === i && t > tl.hikeTime));
    }
    if (simulate && tl.result && !shown && t >= tl.result.t) {
      shown = true;
      showResult(tl.result);
    }
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
  testDefence = null;
  hideResult();
  $('field').classList.remove('playing');
  setPlayButtons();
  if (play) render();
}

function setPlayButtons() {
  const btns = [$('btn-play'), $('btn-slow'), $('btn-sim')];
  const labels = ['▶ Play', '🐢 Slow-mo', '🎯 Simulate'];
  btns.forEach((b, i) => {
    b.textContent = !playback ? labels[i] : playback.state === 'done' ? '⟲ Reset' : '■ Stop';
  });
}

/* ---------------- simulate results ---------------- */
function describe(r) {
  const def = isDefence();
  const who = (i) => scene.players[i]?.label || '';
  const by = (i) => scene.defenders[i]?.label || 'A defender';
  const n = (y) => linesCrossed(y);
  const gainText = (y) =>
    y < 0 ? 'behind the line of scrimmage' : n(y) === 0 ? 'before line 1' : `after crossing ${n(y) === 1 ? '1 line' : `${n(y)} lines`}`;
  const td = r.where && n(r.where[1]) >= 4;
  switch (r.type) {
    case 'covered':
      return def
        ? ['good', '🛡 DEFENDED!', `${by(r.by)} covered the pass to ${who(r.who)}.`]
        : ['bad', '❌ COVERED', `${by(r.by)} was too close to ${who(r.who)}. Try a different route or receiver.`];
    case 'sack':
      return def
        ? ['good', '💥 SACK!', `${by(r.by)} tagged the QB before the throw.`]
        : ['bad', '💥 SACKED', `${by(r.by)} tagged the QB before the throw. Watch out for rushers!`];
    case 'tagged': {
      const g = gainText(r.gain);
      if (r.caught) {
        return def
          ? ['ok', '🏃 Tagged', `${who(r.who)} caught it, but ${by(r.by)} tagged them ${g}.`]
          : ['good', '✅ COMPLETE!', `${who(r.who)} caught it and was tagged by ${by(r.by)} ${g}.`];
      }
      const short = n(r.gain) === 0;
      return def
        ? [short ? 'good' : 'ok', short ? '🛡 STOPPED!' : '🏃 Tagged', `${by(r.by)} tagged ${who(r.who)} ${g}.`]
        : [short ? 'bad' : 'ok', '🏃 Tagged', `${who(r.who)} was tagged by ${by(r.by)} ${g}.`];
    }
    case 'touchdown':
      return def
        ? ['bad', '😬 TOUCHDOWN', `${who(r.who)} ${r.caught ? 'caught it and ' : ''}got past line 4.`]
        : ['good', '🏈 TOUCHDOWN!', `${who(r.who)} ${r.caught ? 'caught it and ' : ''}crossed all 4 lines!`];
    case 'complete':
      if (td) return def ? ['bad', '😬 TOUCHDOWN', `${who(r.who)} caught it and nobody could tag them.`] : ['good', '🏈 TOUCHDOWN!', `${who(r.who)} caught it and ran all the way!`];
      return def
        ? ['bad', '😬 Complete', `${who(r.who)} caught it and finished ${gainText(r.gain)}.`]
        : ['good', '✅ COMPLETE!', `${who(r.who)} caught it and finished ${gainText(r.gain)}. Nobody tagged them!`];
    case 'run':
      if (td) return def ? ['bad', '😬 TOUCHDOWN', `${who(r.who)} ran all the way.`] : ['good', '🏈 TOUCHDOWN!', `${who(r.who)} ran all the way!`];
      return def
        ? ['bad', '😬 Big gain', `${who(r.who)} finished ${gainText(r.gain)} without being tagged.`]
        : ['good', '🏃 Big gain!', `${who(r.who)} finished ${gainText(r.gain)} without being tagged.`];
    case 'scan': {
      const names = (list) => list.map(who).join(', ') || 'nobody';
      const n = r.open.length + r.covered.length;
      return def
        ? [r.open.length ? 'ok' : 'good', `🛡 You covered ${r.covered.length} of ${n}`, `Open when the QB throws: ${names(r.open)}.`]
        : [r.open.length ? 'good' : 'bad', `👀 Open: ${names(r.open)}`, `Covered: ${names(r.covered)}. Tap a player and choose 🎯 Throw here to test a pass.`];
    }
  }
  return ['ok', '', ''];
}

function showResult(r) {
  const [tone, title, text] = describe(r);
  const el = $('result');
  el.className = 'result ' + tone;
  el.innerHTML = `<div class="r-title">${esc(title)}</div><div class="r-text">${esc(text)}</div>`;
  el.hidden = false;
  if (r.where && svg) {
    const [x, y] = toSvg(r.where);
    svg.insertAdjacentHTML('beforeend', `<circle class="r-spot ${tone}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6"/>`);
  }
}
function hideResult() {
  $('result').hidden = true;
}

$('btn-play').addEventListener('click', () => startPlayback(1));
$('btn-slow').addEventListener('click', () => startPlayback(0.35));
$('btn-sim').addEventListener('click', () => startPlayback(0.8, true));

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
  renderVsChoices();
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
  if (isDefence()) setDefenderCount(play, play.defenders.length + n);
  else setPlayerCount(play, play.players.length + n);
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
