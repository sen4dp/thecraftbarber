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
// 2. LOGICA DEL DASHBOARD
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const userNameElement = document.getElementById('user-name-display');
    const calendarContainer = document.getElementById('calendar-container');
    const btnAgenda = document.getElementById('btn-agenda');
    const btnLogout = document.getElementById('btn-logout');

    // Cargar nombre temporal desde localStorage si existe
    const cachedUsername = localStorage.getItem('username');
    if (cachedUsername && userNameElement) {
        userNameElement.textContent = cachedUsername.toUpperCase();
    }

    // VERIFICACIÓN DE SESIÓN EN TIEMPO REAL
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Usuario autenticado
            if (userNameElement && !cachedUsername) {
                userNameElement.textContent = (user.displayName || user.email.split('@')[0]).toUpperCase();
            }

            // Cargar las citas del usuario desde Firestore
            await fetchUserAppointments(user.uid);
        } else {
            // Si no hay sesión activa, redirige al login
            window.location.href = 'index.html'; 
        }
    });

    // FUNCIÓN PARA OBTENER CITAS DESDE FIRESTORE
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
                            <span><strong>Día:</strong> ${cita.fecha}</span> - 
                            <span><strong>Hora:</strong> ${cita.hora}</span>
                        </li>
                    `;
                });
                htmlContent += '</ul>';
                calendarContainer.innerHTML = htmlContent;
            }
        } catch (error) {
            console.error('Error al consultar citas en Firestore:', error);
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

    // EVENTOS DE BOTONES
    if (btnAgenda) {
        btnAgenda.addEventListener('click', () => {
            setTimeout(() => {
                // Redirección al formulario de agendamiento
                window.location.href = 'agenda.html'; 
            }, 100);
        });
    }

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