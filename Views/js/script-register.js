// ==========================================
// 1. IMPORTACIONES DE FIREBASE
// ==========================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

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
    const registerForm = document.getElementById('register-form');
    const usernameInput = document.getElementById('reg-username');
    const emailInput = document.getElementById('reg-email');
    const passwordInput = document.getElementById('reg-password');
    const confirmInput = document.getElementById('reg-confirm-password');
    const roleRadios = document.querySelectorAll('input[name="role"]');
    const messageDiv = document.getElementById('message');
    const homeBtn = document.getElementById("btn-home");
    const loginLink = document.getElementById('link-to-login');

    // Función interna para mostrar mensajes estilo Minecraft
    function showMessage(text, isError = true) {
        if (messageDiv) {
            messageDiv.textContent = text;
            messageDiv.style.color = isError ? '#ff4444' : '#4CAF50';
            messageDiv.style.display = 'block';
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        } else {
            alert(text);
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
    // 4. CONTROL DEL ENLACE PUENTE (A LOGIN)
    // ==========================================
    if (loginLink) {
        loginLink.addEventListener('click', function(e) {
            e.preventDefault();
            setTimeout(() => {
                window.location.href = this.getAttribute('href');
            }, 100);
        });
    }

    // ==========================================
    // 5. MANEJO DEL ENVÍO DEL FORMULARIO (REGISTER)
    // ==========================================
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evita que se recargue la página
            
            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;
            
            // Obtener el rol seleccionado desde los radio buttons
            let selectedRole = 'usuario';
            for (const radio of roleRadios) {
                if (radio.checked) {
                    selectedRole = radio.value;
                    break;
                }
            }
            
            // Validaciones locales obligatorias
            if (!username || !email || !password || !confirmPassword) {
                showMessage('❌ Por favor, completa todos los campos');
                return;
            }
            
            if (password !== confirmPassword) {
                showMessage('❌ Las contraseñas no coinciden');
                return;
            }
            
            if (password.length < 6) {
                showMessage('❌ La contraseña debe tener al menos 6 caracteres');
                return;
            }
            
            try {
                // 1. Crear usuario en Firebase Authentication
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // 2. Actualizar el perfil interno de Firebase con el nombre de usuario
                await updateProfile(user, {
                    displayName: username
                });
                
                // 3. Almacenamiento local de sesión en el navegador
                localStorage.setItem('userRole', selectedRole);
                localStorage.setItem('username', username);
                
                showMessage('✅ ¡Cuenta creada exitosamente! Redirigiendo...', false);
                
                // Redirigir al login después de 2 segundos para dar tiempo a ver el éxito
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
                
            } catch (error) {
                console.error('Error al registrar:', error);
                
                // Mensajes de error controlados
                let mensaje = '';
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        mensaje = '❌ Este correo electrónico ya está registrado';
                        break;
                    case 'auth/invalid-email':
                        mensaje = '❌ El formato del email no es válido';
                        break;
                    case 'auth/weak-password':
                        mensaje = '❌ La contraseña es muy débil';
                        break;
                    default:
                        mensaje = '❌ Error al registrar: ' + error.message;
                }
                showMessage(mensaje);
            }
        });
    }
});