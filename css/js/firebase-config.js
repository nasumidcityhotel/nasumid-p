/**
 * firebase-config.js
 * Firebaseの初期化設定
 */

const firebaseConfig = {
  apiKey: "AIzaSyCEJVn6MwaKqPhkzAaHGKVODXhKetzNBpA",
  authDomain: "nasumidsystem.firebaseapp.com",
  projectId: "nasumidsystem",
  storageBucket: "nasumidsystem.firebasestorage.app",
  messagingSenderId: "374946548981",
  appId: "1:374946548981:web:d596abf77429111b6549bc",
  measurementId: "G-FST9JSM9KZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

console.log("🔥 Firebase Initialized");
