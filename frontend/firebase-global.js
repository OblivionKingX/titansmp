// frontend/firebase-global.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getDatabase, ref, onValue, get, push, set, update, query, orderByChild, limitToLast, serverTimestamp, onDisconnect, increment, remove } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, where, query as fQuery, limit, orderBy as fOrderBy, serverTimestamp as fsTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js';
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const fs = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Make Firebase available globally so shared modules can use it consistently
// Make Firebase available globally so shared modules can use it consistently
window.firebaseApp = { 
  app, auth, db, fs, storage, functions,
  getAuth, getDatabase, getFirestore, getStorage, getFunctions,
  ref, onValue, get, push, query, orderByChild, limitToLast, serverTimestamp,
  onDisconnect, set, onAuthStateChanged, update, increment, remove,
  sRef, uploadBytes, getDownloadURL,
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, where, fQuery, limit, fOrderBy, fsTimestamp,
  httpsCallable, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
};

export { 
  app, auth, db, fs, storage, functions,
  getAuth, getDatabase, getFirestore, getStorage, getFunctions,
  ref, onValue, get, push, query, orderByChild, limitToLast, serverTimestamp,
  onDisconnect, set, onAuthStateChanged, update, increment, remove,
  sRef, uploadBytes, getDownloadURL,
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, where, fQuery, limit, fOrderBy, fsTimestamp,
  httpsCallable, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
};
