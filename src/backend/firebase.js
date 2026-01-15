// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhGSJrv9qMPwJTysk0HGTqwNuLtPLyM1I",
  authDomain: "caresync-1c1f4.firebaseapp.com",
  projectId: "caresync-1c1f4",
  storageBucket: "caresync-1c1f4.firebasestorage.app",
  messagingSenderId: "905242544616",
  appId: "1:905242544616:web:b9b98d3d02f65cc1cdbc5d",
  measurementId: "G-HY2BVW4VLF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;