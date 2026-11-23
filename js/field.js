// Draws the field, players and routes as SVG.
import { FIELD, routePoints, isRunRoute } from './routes.js';
import { buildTimeline, resolveMarks, roleOf, zoneOf } from './timeline.js';
import { ZONES, ZONE_LINES } from './zones.js';
import { sceneOf } from './scene.js';

export const VIEWBOX = { x: -1.5, y: -0.5, w: FIELD.width + 3, h: FIELD.front - FIELD.back + 1 };
export const PLAYER_R = 1.6;

export const toSvg = ([x, y]) => [x, FIELD.front - y];
export const fromSvg = ([sx, sy]) => [sx, FIELD.front - sy];

const f1 = (n) => Math.round(n * 100) / 100;
const ptsAttr = (pts) => pts.map((p) => toSvg(p).map(f1).join(',')).join(' ');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fieldMarkup(thumb) {
  const W = FIELD.width;
  const top = 0;
  const bottom = FIELD.front - FIELD.back;
  let s = `<rect x="${VIEWBOX.x}" y="${VIEWBOX.y}" width="${VIEWBOX.w}" height="${VIEWBOX.h}" fill="#1f7a3a"/>`;
  // mowing stripes every 5 m
  for (let y = FIELD.back, i = 0; y < FIELD.front; y += 5, i++) {
    if (i % 2) s += `<rect x="0" y="${FIELD.front - y - 5}" width="${W}" height="5" fill="#238443"/>`;
  }
  s += `<rect x="0" y="${top}" width="${W}" height="${bottom}" fill="none" stroke="#fff" stroke-width="0.25"/>`;
  for (let y = -10; y < FIELD.front; y += 5) {
    if (y === 0) continue;
    const sy = FIELD.front - y;
    s += `<line x1="0" x2="${W}" y1="${sy}" y2="${sy}" stroke="#fff" stroke-opacity="0.45" stroke-width="0.15"/>`;
    if (!thumb) {
      s += `<text x="2.2" y="${sy - 0.5}" class="fnum">${y > 0 ? y + ' m' : -y + ' m'}</text>`;
      s += `<text x="${W - 2.2}" y="${sy - 0.5}" class="fnum" text-anchor="end">${y > 0 ? y + ' m' : -y + ' m'}</text>`;
    }
  }
  // hash ticks every metre
  if (!thumb) {
    let ticks = '';
    for (let y = FIELD.back + 1; y < FIELD.front; y++) {
      if (y % 5 === 0) continue;
      const sy = FIELD.front - y;
      ticks += `M${W * 0.36} ${sy}h0.7M${W * 0.64 - 0.7} ${sy}h0.7`;
    }
    s += `<path d="${ticks}" stroke="#fff" stroke-opacity="0.35" stroke-width="0.12"/>`;
  }
  // line of scrimmage
  const los = FIELD.front;
  s += `<line x1="0" x2="${W}" y1="${los}" y2="${los}" stroke="#74c0fc" stroke-width="0.35"/>`;
  return s;
}

function arrowHead(pts, color) {
  const n = pts.length;
  const [x2, y2] = toSvg(pts[n - 1]);
  const [x1, y1] = toSvg(pts[n - 2]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = 1.4, Wd = 0.75;
  const p = (dx, dy) => `${f1(x2 + dx * Math.cos(a) - dy * Math.sin(a))},${f1(y2 + dx * Math.sin(a) + dy * Math.cos(a))}`;
  return `<polygon points="${p(0.3, 0)} ${p(-L, Wd)} ${p(-L, -Wd)}" fill="${color}" stroke="#0b2e17" stroke-width="0.15"/>`;
}

function routeMarkup(player, play, selected) {
  const pts = routePoints(player, play);
  if (!pts || pts.length < 2) return '';
  const run = isRunRoute(player.route.id);
  const dash = run ? ' stroke-dasharray="1.1 0.7"' : '';
  const w = selected ? 0.65 : 0.5;
  return (
    `<g class="route${selected ? ' sel' : ''}">` +
    `<polyline points="${ptsAttr(pts)}" fill="none" stroke="#0b2e17" stroke-opacity="0.55" stroke-width="${w + 0.35}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<polyline points="${ptsAttr(pts)}" fill="none" stroke="${player.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash}/>` +
    arrowHead(pts, player.color) +
    `</g>`
  );
}

export function ballMarkup(id = '') {
  return (
    `<g ${id ? `id="${id}"` : ''} class="ball">` +
    `<ellipse rx="0.85" ry="0.55" fill="#8b4513" stroke="#3b1d08" stroke-width="0.12"/>` +
    `<line x1="-0.35" x2="0.35" y1="0" y2="0" stroke="#fff" stroke-width="0.1"/>` +
    `</g>`
  );
}

function playerMarkup(p, i, selected, thumb, faded) {
  const [x, y] = toSvg([p.x, p.y]);
  const ring = selected ? `<circle r="${PLAYER_R + 0.7}" fill="none" stroke="#fff" stroke-width="0.35" class="selring"/>` : '';
  const label = thumb ? '' : `<text class="plabel" dy="0.45">${esc(p.label)}</text>`;
  return (
    `<g class="player${faded ? ' faded' : ''}" id="pl-${i}" transform="translate(${f1(x)} ${f1(y)})">${ring}` +
    `<circle r="${PLAYER_R}" fill="${p.color}" stroke="#0b2e17" stroke-width="0.3"/>${label}</g>`
  );
}

function defenderMarkup(d, i, selected, thumb, faded) {
  const [x, y] = toSvg([d.x, d.y]);
  const ring = selected ? `<circle r="${PLAYER_R + 0.7}" fill="none" stroke="#fff" stroke-width="0.35" class="selring"/>` : '';
  const role = roleOf(d);
  const label = thumb ? '' : `<text class="dlabel" dy="0.45">${esc(d.label || '')}</text>`;
  // little badge: zone number, or a "follow" eye for markers
  const badge =
    thumb || role === 'static'
      ? ''
      : `<g transform="translate(1.35 -1.35)"><circle r="0.75" fill="#fff" stroke="#7a1414" stroke-width="0.12"/>` +
        `<text class="dbadge" dy="0.32">${role === 'zone' ? zoneOf(d) : '👁'}</text></g>`;
  return (
    `<g class="defender${faded ? ' faded' : ''}" id="df-${i}" transform="translate(${f1(x)} ${f1(y)})">${ring}` +
    `<rect x="${-PLAYER_R}" y="${-PLAYER_R}" width="${PLAYER_R * 2}" height="${PLAYER_R * 2}" rx="0.55" fill="#e03131" stroke="#3b0a0a" stroke-width="0.3"/>` +
    `${label}${badge}</g>`
  );
}

function zonesMarkup(scene, sel, thumb) {
  const ds = scene.defenders || [];
  if (!ds.some((d) => roleOf(d) === 'zone')) return '';
  const L = ZONE_LINES;
  const sy = (y) => f1(FIELD.front - y);
  let s = '';
  const selD = sel.kind === 'defender' ? ds.find((d) => d.id === sel.id) : null;
  if (selD && roleOf(selD) === 'zone') {
    const z = ZONES[zoneOf(selD)];
    s += `<rect x="${z.x0}" y="${sy(z.y1)}" width="${z.x1 - z.x0}" height="${f1(z.y1 - z.y0)}" fill="#ff6b6b" fill-opacity="0.16"/>`;
  }
  const dash = 'stroke="#fff" stroke-opacity="0.55" stroke-width="0.2" stroke-dasharray="0.9 0.6"';
  s += `<line x1="${L.mid}" x2="${L.mid}" y1="${sy(L.front)}" y2="${sy(L.back)}" ${dash}/>`;
  s += `<line x1="0" x2="${FIELD.width}" y1="${sy(L.split)}" y2="${sy(L.split)}" ${dash}/>`;
  s += `<line x1="0" x2="${FIELD.width}" y1="${sy(L.back)}" y2="${sy(L.back)}" ${dash}/>`;
  if (!thumb) {
    for (const z of Object.values(ZONES)) {
      s += `<text class="znum" x="${f1(z.centre[0])}" y="${sy(z.centre[1] - 1.4)}">${z.id}</text>`;
    }
  }
  return s;
}

function markLinesMarkup(scene) {
  const marks = resolveMarks(scene);
  let s = '';
  scene.defenders.forEach((d, i) => {
    const a = marks[i];
    if (a == null) return;
    const p = scene.players[a];
    s += `<polyline class="markline" points="${ptsAttr([[d.x, d.y], [p.x, p.y]])}" fill="none" stroke="#ff8787" stroke-width="0.25" stroke-dasharray="0.5 0.5" stroke-opacity="0.9"/>`;
  });
  return s;
}

function exchangeMarkup(scene) {
  let s = '';
  for (const e of buildTimeline({ players: scene.players, defenders: [] }).exchanges()) {
    if (e.kind === 'pitch') {
      s += `<polyline points="${ptsAttr([e.from, e.to])}" fill="none" stroke="#d9a066" stroke-width="0.3" stroke-dasharray="0.4 0.5"/>`;
      const [x, y] = toSvg(e.to);
      s += `<g transform="translate(${f1(x)} ${f1(y)}) scale(0.8)">${ballMarkup()}</g>`;
    } else {
      const [x, y] = toSvg(e.at);
      s += `<g transform="translate(${f1(x)} ${f1(y)}) scale(0.8)">${ballMarkup()}</g>`;
    }
  }
  return s;
}

/**
 * Full SVG markup for a play.
 * opts: { selected: {kind, id}, thumb, scene }   (scene defaults to the play on its own)
 */
export function renderPlay(play, opts = {}) {
  const sel = opts.selected || {};
  const scene = opts.scene || sceneOf(play);
  let s = fieldMarkup(opts.thumb);
  s += zonesMarkup(scene, sel, opts.thumb);
  scene.players.forEach((p) => (s += routeMarkup(p, scene, sel.kind === 'player' && sel.id === p.id)));
  s += exchangeMarkup(scene);
  s += markLinesMarkup(scene);
  scene.defenders.forEach((d, i) => (s += defenderMarkup(d, i, sel.kind === 'defender' && sel.id === d.id, opts.thumb, !scene.editDefenders)));
  scene.players.forEach((p, i) => (s += playerMarkup(p, i, sel.kind === 'player' && sel.id === p.id, opts.thumb, !scene.editPlayers)));
  const holder = scene.players[0];
  if (holder) {
    const [bx, by] = toSvg([holder.x + 1.2, holder.y + 0.3]);
    s += `<g id="ballpos" transform="translate(${f1(bx)} ${f1(by)})">${ballMarkup('ball')}</g>`;
  }
  return s;
}

export function svgOpen(cls = '') {
  const v = VIEWBOX;
  return `<svg class="${cls}" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
}
