// Everything that talks to Firebase (sign-in + the shared class space).
import * as fb from './vendor/firebase.js';
import { randomCode } from './pictures.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAItMDUbzSrfu7U5KE0LzLmHgPVD0fRjOg',
  authDomain: 'xandogridiron-72930.firebaseapp.com',
  projectId: 'xandogridiron-72930',
  storageBucket: 'xandogridiron-72930.firebasestorage.app',
  messagingSenderId: '612925064788',
  appId: '1:612925064788:web:e6d7c3aac23db7ad958fc1',
};

const app = fb.initializeApp(firebaseConfig);
const auth = fb.initializeAuth(app, {
  persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence],
  popupRedirectResolver: fb.browserPopupRedirectResolver,
});
let db;
try {
  db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
} catch {
  db = fb.initializeFirestore(app, {});
}

// For local testing only: add ?emulator to the address to use the Firebase emulator.
if (location.search.includes('emulator')) {
  fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const qrcode = fb.qrcode;

/* ---------------- auth ---------------- */
let currentUser = null;
let resolveReady;
const authReady = new Promise((r) => (resolveReady = r));
const authListeners = new Set();
fb.onAuthStateChanged(auth, (u) => {
  currentUser = u;
  resolveReady();
  authListeners.forEach((f) => f(u));
});
fb.getRedirectResult(auth).catch(() => {});

export const onAuth = (f) => (authListeners.add(f), () => authListeners.delete(f));
export async function getUser() {
  await authReady;
  return currentUser;
}

/** Make sure this device has a (possibly anonymous) Firebase user. */
export async function ensureUser() {
  await authReady;
  if (currentUser) return currentUser;
  const cred = await withTimeout(fb.signInAnonymously(auth), 12000);
  return cred.user;
}

const uid = () => currentUser?.uid;

export async function teacherGuest() {
  return ensureUser();
}

export async function signInGoogle() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await authReady;
  if (currentUser?.isAnonymous) {
    try {
      // Upgrading a guest keeps all of their classes.
      return (await fb.linkWithPopup(currentUser, provider)).user;
    } catch (e) {
      if (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use') throw e;
    }
  }
  return (await fb.signInWithPopup(auth, provider)).user;
}

export async function signInEmail(email, password) {
  return (await fb.signInWithEmailAndPassword(auth, email, password)).user;
}

export async function createEmailAccount(email, password) {
  await authReady;
  if (currentUser?.isAnonymous) {
    const cred = fb.EmailAuthProvider.credential(email, password);
    return (await fb.linkWithCredential(currentUser, cred)).user;
  }
  return (await fb.createUserWithEmailAndPassword(auth, email, password)).user;
}

export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);
export const signOut = () => fb.signOut(auth);

export function authMessage(e) {
  const map = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Please type a password.',
    'auth/weak-password': 'Passwords need at least 6 characters.',
    'auth/email-already-in-use': 'There’s already an account with that email. Try signing in.',
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/wrong-password': 'Email or password is wrong.',
    'auth/user-not-found': 'No account with that email. Try “Create account”.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups and try again.',
    'auth/network-request-failed': 'No internet connection. Try again when you’re online.',
    'auth/unauthorized-domain': 'This website isn’t allowed to sign in yet. Add it under Firebase → Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'This sign-in method is turned off in Firebase → Authentication → Sign-in method.',
    'auth/admin-restricted-operation': 'Guest sign-in is turned off. Turn on “Anonymous” in Firebase → Authentication → Sign-in method.',
    'auth/credential-already-in-use': 'That account is already in use. Sign in with it instead.',
    timeout: 'No internet connection. Try again when you’re online.',
  };
  return map[e?.code] || map[e?.message] || 'Something went wrong. Please try again.';
}

/* ---------------- helpers ---------------- */
function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)),
  ]);
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function classCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

const classRef = (c) => fb.doc(db, 'classes', c);
const teamRef = (c, t) => fb.doc(db, 'classes', c, 'teams', t);
const secretRef = (c, t) => fb.doc(db, 'classes', c, 'teams', t, 'secret', 'code');
const memberRef = (c, t, u) => fb.doc(db, 'classes', c, 'teams', t, 'members', u);
const playsCol = (c, t) => fb.collection(db, 'classes', c, 'teams', t, 'plays');
const bookCol = (c) => fb.collection(db, 'classes', c, 'playbook');

const snapList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const fromPlayDoc = (d) => {
  try {
    return { ...JSON.parse(d.data), id: d.id, name: d.name, updated: d.updated };
  } catch {
    return null;
  }
};

/* ---------------- classes (teacher) ---------------- */
export function createClass(name) {
  const ref = fb.doc(fb.collection(db, 'classes'));
  const code = classCode();
  const b = fb.writeBatch(db);
  b.set(ref, { name, owner: uid(), code, created: Date.now() });
  b.set(fb.doc(db, 'classCodes', code), { classId: ref.id });
  b.commit().catch((e) => console.error(e));
  return ref.id;
}

export function watchMyClasses(cb) {
  const q = fb.query(fb.collection(db, 'classes'), fb.where('owner', '==', uid()));
  return fb.onSnapshot(q, (s) => cb(snapList(s).sort((a, b) => b.created - a.created)), (e) => cb(null, e));
}

export function watchClass(c, cb) {
  return fb.onSnapshot(classRef(c), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => cb(null, e));
}

export const renameClass = (c, name) => fb.updateDoc(classRef(c), { name }).catch(console.error);
export const setClassField = (c, field) => fb.updateDoc(classRef(c), { field }).catch(console.error);

export async function findClassByCode(code) {
  await ensureUser();
  const s = await withTimeout(fb.getDoc(fb.doc(db, 'classCodes', code.toUpperCase())));
  if (!s.exists()) return null;
  const c = await withTimeout(fb.getDoc(classRef(s.data().classId)));
  return c.exists() ? { id: c.id, ...c.data() } : null;
}

export async function getClass(c) {
  await ensureUser();
  const s = await withTimeout(fb.getDoc(classRef(c)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

async function deleteTeamDocs(c, t) {
  const [plays, members] = await Promise.all([
    fb.getDocs(playsCol(c, t)),
    fb.getDocs(fb.collection(db, 'classes', c, 'teams', t, 'members')),
  ]);
  const refs = [...plays.docs.map((d) => d.ref), ...members.docs.map((d) => d.ref), secretRef(c, t), teamRef(c, t)];
  for (let i = 0; i < refs.length; i += 400) {
    const b = fb.writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}

export async function resetClass(c) {
  const teams = await fb.getDocs(fb.collection(db, 'classes', c, 'teams'));
  for (const t of teams.docs) await deleteTeamDocs(c, t.id);
}

export async function deleteClass(c, code) {
  await resetClass(c);
  const book = await fb.getDocs(bookCol(c));
  const b = fb.writeBatch(db);
  book.docs.forEach((d) => b.delete(d.ref));
  if (code) b.delete(fb.doc(db, 'classCodes', code));
  b.delete(classRef(c));
  await b.commit();
}

/* ---------------- teams ---------------- */
export function watchTeams(c, cb) {
  return fb.onSnapshot(
    fb.collection(db, 'classes', c, 'teams'),
    (s) => cb(snapList(s).sort((a, b) => a.name.localeCompare(b.name))),
    (e) => cb(null, e),
  );
}

export function watchSecret(c, t, cb) {
  return fb.onSnapshot(secretRef(c, t), (s) => cb(s.exists() ? s.data().code : null), () => cb(null));
}

/** Teacher adds a team. Works offline (syncs later). */
export function teacherCreateTeam(c, name) {
  const ref = fb.doc(fb.collection(db, 'classes', c, 'teams'));
  const code = randomCode();
  const b = fb.writeBatch(db);
  b.set(ref, { name, createdBy: uid(), created: Date.now() });
  b.set(secretRef(c, ref.id), { code });
  b.commit().catch(console.error);
  return { id: ref.id, code };
}

/** Student makes a new team and joins it. Needs internet. */
export async function studentCreateTeam(c, name) {
  await ensureUser();
  const ref = fb.doc(fb.collection(db, 'classes', c, 'teams'));
  const code = randomCode();
  const b = fb.writeBatch(db);
  b.set(ref, { name, createdBy: uid(), created: Date.now() });
  b.set(secretRef(c, ref.id), { code });
  b.set(memberRef(c, ref.id, uid()), { code, joined: Date.now() });
  await withTimeout(b.commit(), 12000);
  return { id: ref.id, code };
}

/** Join a team with its picture code. Rejects with code 'permission-denied' if the code is wrong. */
export async function joinTeam(c, t, code) {
  await ensureUser();
  await withTimeout(fb.setDoc(memberRef(c, t, uid()), { code, joined: Date.now() }), 12000);
}

export async function getTeam(c, t) {
  const s = await withTimeout(fb.getDoc(teamRef(c, t)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export const renameTeam = (c, t, name) => fb.updateDoc(teamRef(c, t), { name }).catch(console.error);
export const deleteTeam = (c, t) => deleteTeamDocs(c, t);

export async function newTeamCode(c, t) {
  const code = randomCode();
  const members = await fb.getDocs(fb.collection(db, 'classes', c, 'teams', t, 'members'));
  const b = fb.writeBatch(db);
  b.set(secretRef(c, t), { code });
  members.docs.forEach((d) => b.delete(d.ref)); // everyone must use the new code
  await b.commit();
  return code;
}

/* ---------------- plays ---------------- */
export function watchPlays(c, t, cb) {
  return fb.onSnapshot(
    playsCol(c, t),
    (s) => cb(snapList(s).map(fromPlayDoc).filter(Boolean).sort((a, b) => b.updated - a.updated)),
    (e) => cb(null, e),
  );
}

export function savePlay(c, t, play) {
  const { id, name, updated } = play;
  fb.setDoc(fb.doc(playsCol(c, t), id), { name, updated, data: JSON.stringify(play) }).catch(console.error);
}

export const deletePlay = (c, t, id) => fb.deleteDoc(fb.doc(playsCol(c, t), id)).catch(console.error);

export function watchPlaybook(c, cb) {
  return fb.onSnapshot(
    bookCol(c),
    (s) =>
      cb(
        s.docs
          .map((d) => {
            const p = fromPlayDoc(d.data());
            return p && { ...p, id: d.id, fromTeam: d.data().fromTeam || '' };
          })
          .filter(Boolean)
          .sort((a, b) => b.updated - a.updated),
      ),
    (e) => cb(null, e),
  );
}

export function shareToPlaybook(c, play, fromTeam) {
  const id = `${play.id}`;
  fb.setDoc(fb.doc(bookCol(c), id), {
    name: play.name,
    updated: Date.now(),
    fromTeam: fromTeam || '',
    data: JSON.stringify(play),
  }).catch(console.error);
}

export const removeFromPlaybook = (c, id) => fb.deleteDoc(fb.doc(bookCol(c), id)).catch(console.error);
