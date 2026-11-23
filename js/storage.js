// Play storage. For now plays live on this device (localStorage).
// This module is the single place to swap in Firebase (Firestore) later.

const KEY = 'xog.plays.v1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function listPlays() {
  return readAll().sort((a, b) => b.updated - a.updated);
}

export function getPlay(id) {
  return readAll().find((p) => p.id === id) || null;
}

export function savePlay(play) {
  const list = readAll();
  const i = list.findIndex((p) => p.id === play.id);
  const copy = JSON.parse(JSON.stringify(play));
  if (i >= 0) list[i] = copy;
  else list.push(copy);
  return writeAll(list);
}

export function deletePlay(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}
