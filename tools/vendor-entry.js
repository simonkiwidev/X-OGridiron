export { initializeApp } from 'firebase/app';
export {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider, EmailAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, linkWithPopup, linkWithCredential, signOut,
  connectAuthEmulator, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver, initializeAuth,
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy,
  onSnapshot, serverTimestamp, connectFirestoreEmulator,
} from 'firebase/firestore';
import qrcode from 'qrcode-generator';
export { qrcode };
