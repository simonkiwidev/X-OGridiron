// Simple filter to keep rude or silly team names out. The teacher can still rename or remove any team.
const STRONG = [
  'fuck', 'fuk', 'fck', 'shit', 'sh1t', 'bitch', 'cunt', 'dick', 'pussy', 'bastard', 'slut', 'whore',
  'twat', 'nigg', 'nigga', 'fag', 'retard', 'penis', 'vagina', 'boob', 'tits', 'porn', 'sexy', 'nazi', 'hitler',
  'murder', 'bollock', 'asshole', 'dildo', 'piss', 'damn', 'stupid', 'idiot', 'dumb',
  'loser', 'fatty', 'ugly', 'poop', 'fart', 'vomit', 'spew', 'booger', 'diarrh', 'toilet',
];
const WORDS = ['kill', 'killer', 'killers', 'crap', 'arse', 'butt', 'butts', 'cock', 'horny', 'rape', 'wank', 'wanker', 'ass', 'sex', 'poo', 'bum', 'wee', 'pee', 'hell', 'gay', 'god', 'die', 'dead', 'hate', 'suck', 'sucks', 'snot', 'tit', 'nob', 'knob'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

function normalise(s) {
  return s.toLowerCase().replace(/[0-9@$!]/g, (c) => LEET[c] || c);
}

/** Returns an error message, or '' if the name is OK. */
export function checkTeamName(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return 'Team names need at least 2 letters.';
  if (name.length > 20) return 'Team names can be up to 20 letters.';
  if (!/^[a-zA-Z0-9 '\-]+$/.test(name)) return 'Use only letters, numbers and spaces.';
  const n = normalise(name);
  const squashed = n.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const words = n.split(/[^a-z]+/);
  if (STRONG.some((w) => n.replace(/[^a-z]/g, '').includes(w) || squashed.includes(w)) || words.some((w) => WORDS.includes(w))) {
    return 'Please choose a different team name.';
  }
  return '';
}

export const cleanName = (raw) => raw.trim().replace(/\s+/g, ' ');
