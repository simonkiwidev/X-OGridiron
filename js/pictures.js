// Picture codes: each team has 3 pictures (e.g. 🦈 🍕 🚀) instead of a PIN.
export const PICS = ['🦈', '🍕', '🚀', '🐶', '🌈', '⚽', '🦖', '🍦', '⭐', '🐸', '🍌', '🔥'];
export const PIC_NAMES = ['shark', 'pizza', 'rocket', 'dog', 'rainbow', 'ball', 'dinosaur', 'ice cream', 'star', 'frog', 'banana', 'fire'];
export const CODE_LEN = 3;

export function randomCode() {
  const a = [];
  for (let i = 0; i < CODE_LEN; i++) a.push(Math.floor(Math.random() * PICS.length));
  return a.join('-');
}

export const codeToPics = (code) => (code || '').split('-').filter((x) => x !== '').map((i) => PICS[+i] || '?');
export const codeLabel = (code) => (code || '').split('-').map((i) => PIC_NAMES[+i]).join(', ');
