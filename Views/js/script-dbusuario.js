// ==========================================
// 1. IMPORTACIONES DE FIREBASE V10
// ==========================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDc1Oha-1Es-7vS9jZe5DkXXuI17OYVzKY",
    authDomain: "the-craftbarber.firebaseapp.com",
    projectId: "the-craftbarber",
    storageBucket: "the-craftbarber.firebasestorage.app",
    messagingSenderId: "1064165237871",
    appId: "1:1064165237871:web:3aae757a6f5a30bfb3d99a",
    measurementId: "G-HCPNHKKS7C"
};

// Inicializar Firebase y Servicios
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. LÓGICA DEL DASHBOARD DE USUARIO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // Elementos de la Interfaz
    const userNameElement = document.getElementById('user-name-display');
    const calendarContainer = document.getElementById('calendar-container');
    const btnAgenda = document.getElementById('btn-agenda');
    const btnLogout = document.getElementById('btn-logout');

    // Elementos del Modal de Perfil
    const profileTrigger = document.getElementById('user-profile-trigger');
    const profileModal = document.getElementById('profile-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalUsername = document.getElementById('modal-username');
    const modalEmail = document.getElementById('modal-email');
    const modalPassword = document.getElementById('modal-password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');

    // Cargar nombre guardado en LocalStorage
    const cachedUsername = localStorage.getItem('username');
    if (cachedUsername && userNameElement) {
        userNameElement.textContent = cachedUsername.toUpperCase();
    }

    // CONTROL DE SESIÓN EN TIEMPO REAL
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const currentName = cachedUsername || user.displayName || user.email.split('@')[0];
            if (userNameElement) {
                userNameElement.textContent = currentName.toUpperCase();
            }

            // Cargar datos en el modal
            if (modalUsername) modalUsername.value = currentName.toUpperCase();
            if (modalEmail) modalEmail.value = user.email || 'sin-correo@craftbarber.com';

            // Cargar citas desde Firestore
            await fetchUserAppointments(user.uid);
        } else {
            // Si no hay sesión, se devuelve al login
            window.location.href = 'index.html'; 
        }
    });

    // CONSULTAR CITAS EN FIRESTORE
    async function fetchUserAppointments(userId) {
        try {
            const citasRef = collection(db, 'citas');
            const q = query(citasRef, where('userId', '==', userId));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                renderEmptyState();
            } else {
                let htmlContent = '<ul class="appointments-list">';
                querySnapshot.forEach((doc) => {
                    const cita = doc.data();
                    htmlContent += `
                        <li class="appointment-item">
                            <span><strong>FECHA:</strong> ${cita.fecha || 'N/A'}</span><br>
                            <span><strong>HORA:</strong> ${cita.hora || 'N/A'}</span>
                        </li>
                    `;
                });
                htmlContent += '</ul>';
                calendarContainer.innerHTML = htmlContent;
            }
        } catch (error) {
            console.error('Error al consultar citas:', error);
            renderEmptyState();
        }
    }

    function renderEmptyState() {
        if (calendarContainer) {
            calendarContainer.innerHTML = `
                <p class="empty-message">
                    AÚN NO HAY CITAS AGENDADAS :(
                </p>
            `;
        }
    }

    // MODAL PERFIL - ABRIR/CERRAR
    if (profileTrigger && profileModal) {
        profileTrigger.addEventListener('click', () => {
            profileModal.style.display = 'flex';
        });
    }

    if (modalCloseBtn && profileModal) {
        modalCloseBtn.addEventListener('click', () => {
            profileModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            profileModal.style.display = 'none';
        }
    });

    // MOSTRAR / OCULTAR CONTRASEÑA EN MODAL
    if (togglePasswordBtn && modalPassword) {
        let isVisible = false;
        togglePasswordBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            modalPassword.type = isVisible ? 'text' : 'password';
            togglePasswordBtn.textContent = isVisible ? '🙈' : '👁️';
        });
    }

    // BOTÓN NAVEGAR A AGENDAR CITA
    if (btnAgenda) {
        btnAgenda.addEventListener('click', () => {
            setTimeout(() => {
                window.location.href = 'agenda.html'; 
            }, 100);
        });
    }

    // CERRAR SESIÓN
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await signOut(auth);
                localStorage.clear();
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        });
    }
});