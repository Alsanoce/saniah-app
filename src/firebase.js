// src/firebase.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqCAPMe0ROdSXzdsuGZZ6PRwmEo6RypSg",
  authDomain: "whater-f15d4.firebaseapp.com",
  projectId: "whater-f15d4",
  storageBucket: "whater-f15d4.appspot.com",
  messagingSenderId: "875744692410",
  appId: "1:875744692410:web:4647c93c7835c61bdc1a83"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
