// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Tu configuración de Firebase
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
const db = getFirestore(app);

// ==========================================
// 2. ESPERA A QUE EL HTML ESTÉ CARGADO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    
    // Obtener elementos de la interfaz
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const usernameInput = document.getElementById('username');
    const roleRadios = document.querySelectorAll('input[name="role"]');
    const errorDiv = document.getElementById('error-message');
    const homeBtn = document.getElementById("btn-home");
    const registerLink = document.getElementById('link-to-register');

    // Función interna para mostrar errores estilo Minecraft
    function showError(message) {
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 3000);
        } else {
            alert(message);
        }
    }

    // ==========================================
    // 3. LÓGICA DEL BOTÓN HOME
    // ==========================================
    if (homeBtn) {
        homeBtn.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "home.html";
            }, 100);
        });
    }

    // ==========================================
    // 4. CONTROL DEL ENLACE PUENTE (A REGISTRO)
    // ==========================================
    if (registerLink) {
        registerLink.addEventListener('click', function(e) {
            e.preventDefault();
            setTimeout(() => {
                window.location.href = this.getAttribute('href');
            }, 100);
        });
    }

    // ==========================================
    // 5. MANEJO DEL ENVÍO DEL FORMULARIO (LOGIN)
    // ==========================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const username = usernameInput.value.trim();
            
            let selectedRole = 'usuario';
            for (const radio of roleRadios) {
                if (radio.checked) {
                    selectedRole = radio.value;
                    break;
                }
            }
            
            if (!email || !password || !username) {
                showError('❌ Por favor, completa todos los campos');
                return;
            }
            
            try {
                // 1. Autenticación con Firebase Auth
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // 2. Consulta de datos del perfil en Firestore
                const profileSnap = await getDoc(doc(db, 'users', user.uid));
                if (!profileSnap.exists()) {
                    showError('❌ Tu perfil de aplicación no existe.');
                    await auth.signOut();
                    return;
                }

                const profile = profileSnap.data();
                const actualRole = profile.role || 'usuario';
                const status = profile.status || 'approved';

                // 3. Validación de rechazo general (Evita el paso de usuarios rechazados por el Admin)
                if (status === 'rejected') {
                    showError('❌ Tu solicitud o cuenta ha sido rechazada por el administrador.');
                    await auth.signOut();
                    return;
                }

                // 4. Validación de solicitud pendiente
                if (status === 'pending') {
                    showError('⏳ Tu solicitud todavía está pendiente de aprobación por el administrador.');
                    await auth.signOut();
                    return;
                }

                // 5. Validación de coincidencia de rol
                if (actualRole !== selectedRole && !(actualRole === 'dueno' && selectedRole === 'dueno')) {
                    showError('❌ El rol seleccionado no coincide con el registrado en tu cuenta.');
                    await auth.signOut();
                    return;
                }

                // 6. Almacenamiento local y redirección
                const realUsername = profile.username || user.displayName || username;
                localStorage.setItem('userRole', actualRole);
                localStorage.setItem('username', realUsername);
                
                alert(`¡Bienvenido de vuelta, ${realUsername}!`);

                if (actualRole === 'barbero') {
                    window.location.href = 'dashboard-barbero.html';
                } else if (actualRole === 'dueno' || actualRole === 'admin') {
                    window.location.href = 'dashboard-admin.html';
                } else {
                    window.location.href = 'dashboard-usuario.html';
                }

            } catch (error) {
                console.error('Error al iniciar sesión:', error);
                
                let mensaje = '';
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential':
                        mensaje = '❌ Correo o contraseña incorrectos';
                        break;
                    case 'auth/wrong-password':
                        mensaje = '❌ Contraseña incorrecta';
                        break;
                    case 'auth/invalid-email':
                        mensaje = '❌ El formato del email no es válido';
                        break;
                    case 'auth/too-many-requests':
                        mensaje = '⚠️ Cuenta bloqueada temporalmente. Intenta más tarde';
                        break;
                    default:
                        mensaje = '❌ Error al conectar: ' + error.message;
                }
                showError(mensaje);
            }
        });
    }
});