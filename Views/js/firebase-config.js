// js/firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js';

// 🔥 TU CONFIGURACIÓN REAL (copiada de Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyDc1Oha-1Es-7vS9jZe5DkXXuI17OYVzKY",
  authDomain: "the-craftbarber.firebaseapp.com",
  projectId: "the-craftbarber",
  storageBucket: "the-craftbarber.firebasestorage.app",
  messagingSenderId: "1064165237871",
  appId: "1:1064165237871:web:3aae757a6f5a30bfb3d99a",
  measurementId: "G-HCPNHKKS7C"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app); // Analytics es opcional

// Exportar lo que necesitas en otros archivos
export { auth, onAuthStateChanged, signOut, analytics };