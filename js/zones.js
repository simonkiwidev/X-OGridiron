// The four PE zones beyond the line (2 × 2): short-left 1, short-right 2, deep-left 3, deep-right 4.
import { FIELD, onFieldChange } from './routes.js';

const MID = 25;
export const ZONES = {
  1: { id: 1, name: 'Short left' },
  2: { id: 2, name: 'Short right' },
  3: { id: 3, name: 'Deep left' },
  4: { id: 4, name: 'Deep right' },
};
export const ZONE_LINES = { mid: MID, split: 11, back: 24, front: 0.5 };

// The four PE lines across the field, evenly spaced in front of the line of scrimmage.
// Crossing line 4 is a touchdown.
export const LINES = [0, 0, 0, 0];
export const linesCrossed = (y) => LINES.filter((l) => y >= l).length;

// Short zones run from the line of scrimmage to line 2, deep zones from line 2 to line 4.
function rebuild() {
  const step = (FIELD.front - 1) / 4;
  LINES.forEach((_, i) => (LINES[i] = +((i + 1) * step).toFixed(2)));
  const split = LINES[1];
  const back = LINES[3];
  Object.assign(ZONE_LINES, { split, back });
  Object.assign(ZONES[1], { x0: 0, x1: MID, y0: 0.5, y1: split });
  Object.assign(ZONES[2], { x0: MID, x1: 50, y0: 0.5, y1: split });
  Object.assign(ZONES[3], { x0: 0, x1: MID, y0: split, y1: back });
  Object.assign(ZONES[4], { x0: MID, x1: 50, y0: split, y1: back });
  for (const z of Object.values(ZONES)) z.centre = [(z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2];
}
rebuild();
onFieldChange(rebuild);

export const zoneAt = (x, y) => (x < MID ? (y < ZONE_LINES.split ? 1 : 3) : y < ZONE_LINES.split ? 2 : 4);

export const inZone = (z, x, y, m = 0) => x >= z.x0 - m && x <= z.x1 + m && y >= z.y0 - m && y <= z.y1 + m;

export const clampToZone = (z, x, y, m = 0) => [
  Math.max(z.x0 - m, Math.min(z.x1 + m, x)),
  Math.max(z.y0 - m, Math.min(z.y1 + m, y)),
];
