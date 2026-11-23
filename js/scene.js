// What's on the field: a play plus (optionally) the opposing play it's being tried against.
import { sampleAttack } from './formation.js';

export const kindOf = (play) => (play?.kind === 'defence' ? 'defence' : 'offence');

/**
 * Attack plays: their own players, and either their own defenders or the chosen defence's.
 * Defence set-ups: their own defenders, against the chosen attack (or the sample attack).
 */
export function sceneOf(play, opponent = null) {
  if (kindOf(play) === 'defence') {
    const attack = opponent || null;
    return { players: attack ? attack.players : [], defenders: play.defenders, editPlayers: false, editDefenders: true };
  }
  return {
    players: play.players,
    defenders: opponent ? opponent.defenders : play.defenders,
    editPlayers: true,
    editDefenders: !opponent,
  };
}

/** The opponent named by play.vs, looked up in the library of plays. */
export function opponentOf(play, library = []) {
  const vs = play.vs;
  if (kindOf(play) === 'defence') {
    if (!vs || vs === 'sample') return sampleAttack();
    return library.find((p) => p.id === vs && kindOf(p) === 'offence') || sampleAttack();
  }
  if (!vs || vs === 'none') return null;
  return library.find((p) => p.id === vs && kindOf(p) === 'defence') || null;
}
