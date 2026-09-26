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
            // Por si acaso no has creado el div del error en el HTML, usa un alert nativo
            alert(message);
        }
    }

    // ==========================================
    // 3. LOGICA DEL BOTÓN HOME (CORREGIDO)
    // ==========================================
    if (homeBtn) {
        homeBtn.addEventListener("click", () => {
            // 100ms de retraso para que se aprecie físicamente la animación de hundirse
            setTimeout(() => {
                window.location.href = "home.html"; // Redirige a tu página principal
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
            e.preventDefault(); // Evita que se recargue la página
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const username = usernameInput.value.trim();
            
            // Obtener el rol seleccionado desde los radio buttons
            let selectedRole = 'usuario';
            for (const radio of roleRadios) {
                if (radio.checked) {
                    selectedRole = radio.value;
                    break;
                }
            }
            
            // Validar que los campos no estén vacíos
            if (!email || !password || !username) {
                showError('❌ Por favor, completa todos los campos');
                return;
            }
            
            try {
                // Intentar iniciar sesión con Firebase Auth
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // El rol real viene de Firestore, no del radio seleccionado.
                // Así nadie puede entrar al panel de admin simplemente marcando "DUEÑO".
                const profileSnap = await getDoc(doc(db, 'users', user.uid));
                if (!profileSnap.exists()) {
                    showError('❌ Tu perfil de aplicación no existe.');
                    return;
                }

                const profile = profileSnap.data();
                const actualRole = profile.role || 'usuario';
                const status = profile.status || 'approved';

                if (actualRole === 'barbero' && status === 'pending') {
                    showError('⏳ Tu solicitud de barbero todavía está pendiente de aprobación.');
                    await auth.signOut();
                    return;
                }
                if (actualRole === 'barbero' && status === 'rejected') {
                    showError('❌ Tu solicitud para ser barbero no fue aprobada.');
                    await auth.signOut();
                    return;
                }
                if (actualRole !== selectedRole && !(actualRole === 'dueno' && selectedRole === 'dueno')) {
                    showError('❌ El rol seleccionado no coincide con tu cuenta.');
                    await auth.signOut();
                    return;
                }

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
                
                // Mensajes de error controlados
                let mensaje = '';
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential': // Firebase v10 a veces unifica este error por seguridad
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