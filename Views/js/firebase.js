// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDc1Oha-1Es-7vS9jZe5DkXXuI17OYVzKY",
  authDomain: "the-craftbarber.firebaseapp.com",
  projectId: "the-craftbarber",
  storageBucket: "the-craftbarber.firebasestorage.app",
  messagingSenderId: "1064165237871",
  appId: "1:1064165237871:web:3aae757a6f5a30bfb3d99a",
  measurementId: "G-HCPNHKKS7C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);