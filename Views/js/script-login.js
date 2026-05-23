// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

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
                window.location.href = "index.html"; // Redirige a tu página principal
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
                
                // Guardar información temporal en el navegador
                localStorage.setItem('userRole', selectedRole);
                localStorage.setItem('username', username);
                
                alert(`¡Bienvenido de vuelta, ${username}!`);

                // Redirección adaptada a los nombres de tus nuevos dashboards
                if (selectedRole === 'barbero') {
                    window.location.href = 'barbero-dashboard.html';
                } else if (selectedRole === 'dueno') {
                    window.location.href = 'dueno-dashboard.html';
                } else {
                    window.location.href = 'usuario-dashboard.html';
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