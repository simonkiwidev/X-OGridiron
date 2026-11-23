// The four PE zones beyond the line (2 × 2): short-left 1, short-right 2, deep-left 3, deep-right 4.
const MID = 25;
const SPLIT = 11; // metres from the line where "short" becomes "deep"
const BACK = 24;

export const ZONES = {
  1: { id: 1, name: 'Short left', x0: 0, x1: MID, y0: 0.5, y1: SPLIT },
  2: { id: 2, name: 'Short right', x0: MID, x1: 50, y0: 0.5, y1: SPLIT },
  3: { id: 3, name: 'Deep left', x0: 0, x1: MID, y0: SPLIT, y1: BACK },
  4: { id: 4, name: 'Deep right', x0: MID, x1: 50, y0: SPLIT, y1: BACK },
};
for (const z of Object.values(ZONES)) z.centre = [(z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2];

export const ZONE_LINES = { mid: MID, split: SPLIT, back: BACK, front: 0.5 };

export const zoneAt = (x, y) => (x < MID ? (y < SPLIT ? 1 : 3) : y < SPLIT ? 2 : 4);

export const inZone = (z, x, y, m = 0) => x >= z.x0 - m && x <= z.x1 + m && y >= z.y0 - m && y <= z.y1 + m;

export const clampToZone = (z, x, y, m = 0) => [
  Math.max(z.x0 - m, Math.min(z.x1 + m, x)),
  Math.max(z.y0 - m, Math.min(z.y1 + m, y)),
];
