// Draws the field, players and routes as SVG.
import { FIELD, routePoints, isRunRoute } from './routes.js';
import { buildTimeline } from './timeline.js';

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

function playerMarkup(p, i, selected, thumb) {
  const [x, y] = toSvg([p.x, p.y]);
  const ring = selected ? `<circle r="${PLAYER_R + 0.7}" fill="none" stroke="#fff" stroke-width="0.35" class="selring"/>` : '';
  const label = thumb ? '' : `<text class="plabel" dy="0.45">${esc(p.label)}</text>`;
  return (
    `<g class="player" id="pl-${i}" transform="translate(${f1(x)} ${f1(y)})">${ring}` +
    `<circle r="${PLAYER_R}" fill="${p.color}" stroke="#0b2e17" stroke-width="0.3"/>${label}</g>`
  );
}

function defenderMarkup(d, selected) {
  const [x, y] = toSvg([d.x, d.y]);
  const ring = selected ? `<circle r="${PLAYER_R + 0.7}" fill="none" stroke="#fff" stroke-width="0.35"/>` : '';
  const k = 1.1;
  return (
    `<g class="defender" transform="translate(${f1(x)} ${f1(y)})">${ring}` +
    `<circle r="${PLAYER_R}" fill="#c92a2a" fill-opacity="0.25"/>` +
    `<path d="M${-k} ${-k}L${k} ${k}M${k} ${-k}L${-k} ${k}" stroke="#ff6b6b" stroke-width="0.6" stroke-linecap="round"/>` +
    `<path d="M${-k} ${-k}L${k} ${k}M${k} ${-k}L${-k} ${k}" stroke="#fff" stroke-opacity="0.5" stroke-width="0.15" stroke-linecap="round"/></g>`
  );
}

function exchangeMarkup(play) {
  let s = '';
  for (const e of buildTimeline(play).exchanges()) {
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
 * opts: { selected: {kind, id}, thumb, hideRoutes }
 */
export function renderPlay(play, opts = {}) {
  const sel = opts.selected || {};
  let s = fieldMarkup(opts.thumb);
  if (!opts.hideRoutes) {
    play.players.forEach((p) => (s += routeMarkup(p, play, sel.kind === 'player' && sel.id === p.id)));
    s += exchangeMarkup(play);
  }
  play.defenders.forEach((d) => (s += defenderMarkup(d, sel.kind === 'defender' && sel.id === d.id)));
  play.players.forEach((p, i) => (s += playerMarkup(p, i, sel.kind === 'player' && sel.id === p.id, opts.thumb)));
  // ball starts with the centre (or QB if there is no centre)
  const holder = play.players.find((p) => p.label === 'C') || play.players[0];
  const [bx, by] = toSvg([holder.x, holder.y + PLAYER_R + 0.6]);
  s += `<g id="ballpos" transform="translate(${f1(bx)} ${f1(by)})">${ballMarkup('ball')}</g>`;
  return s;
}

export function svgOpen(cls = '') {
  const v = VIEWBOX;
  return `<svg class="${cls}" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
}
