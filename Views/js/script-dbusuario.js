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

    // Elementos del Hero
    const heroGreeting = document.getElementById('hero-greeting');
    const heroUsername = document.getElementById('hero-username');
    const heroDate = document.getElementById('hero-date');
    const statTotal = document.getElementById('stat-total');
    const statNext = document.getElementById('stat-next');
    const historyCount = document.getElementById('history-count');
    const nextAppointmentContent = document.getElementById('next-appointment-content');

    // Elementos del Modal de Perfil
    const profileTrigger = document.getElementById('user-profile-trigger');
    const profileModal = document.getElementById('profile-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalUsername = document.getElementById('modal-username');
    const modalEmail = document.getElementById('modal-email');
    const modalPassword = document.getElementById('modal-password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');

    // Avatares (iniciales)
    const navbarAvatarInitial = document.getElementById('navbar-avatar-initial');
    const modalAvatarInitial = document.getElementById('modal-avatar-initial');

    // ------------------------------------------
    // Helpers de presentación
    // ------------------------------------------
    function getGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'BUENOS DÍAS';
        if (h < 19) return 'BUENAS TARDES';
        return 'BUENAS NOCHES';
    }

    function getHeroDateText() {
        const texto = new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        return texto.toUpperCase();
    }

    function setAvatarInitial(name) {
        const initial = name ? name.trim().charAt(0).toUpperCase() : '?';
        if (navbarAvatarInitial) navbarAvatarInitial.textContent = initial;
        if (modalAvatarInitial) modalAvatarInitial.textContent = initial;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));
    }

    // Intenta interpretar la fecha/hora guardada en Firestore (ISO "YYYY-MM-DD"
    // o "DD/MM/YYYY"), sin asumir un formato estricto.
    function parseCitaDate(cita) {
        if (!cita || !cita.fecha) return null;
        const fechaStr = String(cita.fecha).trim();
        const horaStr = String(cita.hora || '00:00').trim();

        let d = new Date(`${fechaStr}T${horaStr}`);
        if (!isNaN(d.getTime())) return d;

        const match = fechaStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (match) {
            const [, dd, mm, yyyy] = match;
            const [hh, min] = horaStr.split(':').map(Number);
            d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh || 0, min || 0);
            if (!isNaN(d.getTime())) return d;
        }
        return null;
    }

    function formatDayNumber(d) {
        return String(d.getDate()).padStart(2, '0');
    }

    function formatMonthShort(d) {
        return d.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
    }

    function formatShortDate(d) {
        return `${formatDayNumber(d)} ${formatMonthShort(d)}`;
    }

    // Cargar nombre guardado en LocalStorage
    const cachedUsername = localStorage.getItem('username');
    if (cachedUsername && userNameElement) {
        userNameElement.textContent = cachedUsername.toUpperCase();
    }
    if (heroGreeting) heroGreeting.textContent = getGreeting();
    if (heroDate) heroDate.textContent = getHeroDateText();

    // CONTROL DE SESIÓN EN TIEMPO REAL
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const currentName = cachedUsername || user.displayName || user.email.split('@')[0];
            if (userNameElement) {
                userNameElement.textContent = currentName.toUpperCase();
            }
            if (heroUsername) {
                heroUsername.textContent = currentName.toUpperCase();
            }
            setAvatarInitial(currentName);

            // Cargar datos en el modal
            if (modalUsername) modalUsername.value = currentName.toUpperCase();
            if (modalEmail) modalEmail.value = user.email || 'sin-correo@craftbarber.com';

            // Cargar citas desde Firestore
            await fetchUserAppointments(user.uid);
        } else {
            // Si no hay sesión, se devuelve al login
            window.location.href = 'home.html';
        }
    });

    // CONSULTAR CITAS EN FIRESTORE
    async function fetchUserAppointments(userId) {
        try {
            const citasRef = collection(db, 'citas');
            const q = query(citasRef, where('userId', '==', userId));
            const querySnapshot = await getDocs(q);

            const citas = [];
            querySnapshot.forEach((doc) => {
                citas.push({ id: doc.id, ...doc.data() });
            });

            renderAppointments(citas);
        } catch (error) {
            console.error('Error al consultar citas:', error);
            renderAppointments([]);
        }
    }

    // RENDERIZAR CITA DESTACADA + HISTORIAL, A PARTIR DE LOS MISMOS DATOS
    function renderAppointments(citas) {
        const withDates = citas.map((cita) => ({ ...cita, _date: parseCitaDate(cita) }));

        withDates.sort((a, b) => {
            if (a._date && b._date) return a._date - b._date;
            if (a._date) return -1;
            if (b._date) return 1;
            return 0;
        });

        const now = new Date();
        const total = withDates.length;
        const next = withDates.find((c) => c._date && c._date >= now) || null;

        if (statTotal) statTotal.textContent = String(total);
        if (statNext) statNext.textContent = next ? formatShortDate(next._date) : '—';
        if (historyCount) historyCount.textContent = String(total);

        renderNextAppointment(next);

        if (total === 0) {
            renderEmptyState();
            return;
        }

        let html = '';
        withDates.forEach((cita) => {
            const isPast = cita._date ? cita._date < now : false;
            const isNext = next && cita === next;
            let badge = '';
            if (isNext) badge = '<span class="badge badge-next">PRÓXIMA</span>';
            else if (isPast) badge = '<span class="badge badge-past">COMPLETADA</span>';

            html += `
                <div class="appointment-item ${isPast ? 'is-past' : ''}">
                    ${badge}
                    <div class="appointment-row">
                        <span class="appointment-label">FECHA</span>
                        <span class="appointment-value">${escapeHtml(cita.fecha || 'N/A')}</span>
                    </div>
                    <div class="appointment-row">
                        <span class="appointment-label">HORA</span>
                        <span class="appointment-value">${escapeHtml(cita.hora || 'N/A')}</span>
                    </div>
                    ${cita.servicio ? `
                    <div class="appointment-row">
                        <span class="appointment-label">SERVICIO</span>
                        <span class="appointment-value">${escapeHtml(cita.servicio)}</span>
                    </div>` : ''}
                    ${cita.barbero ? `
                    <div class="appointment-row">
                        <span class="appointment-label">BARBERO</span>
                        <span class="appointment-value">${escapeHtml(cita.barbero)}</span>
                    </div>` : ''}
                </div>
            `;
        });
        calendarContainer.innerHTML = html;
    }

    function renderNextAppointment(next) {
        if (!nextAppointmentContent) return;
        if (!next) {
            nextAppointmentContent.innerHTML = `<p class="empty-message">AÚN NO HAY CITAS AGENDADAS :(</p>`;
            return;
        }
        nextAppointmentContent.innerHTML = `
            <div class="next-appointment-details">
                <div class="next-appointment-date">
                    <span class="next-day">${formatDayNumber(next._date)}</span>
                    <span class="next-month">${formatMonthShort(next._date)}</span>
                </div>
                <div class="next-appointment-info">
                    <p class="next-info-row"><strong>HORA:</strong> ${escapeHtml(next.hora || 'N/A')}</p>
                    ${next.servicio ? `<p class="next-info-row"><strong>SERVICIO:</strong> ${escapeHtml(next.servicio)}</p>` : ''}
                    ${next.barbero ? `<p class="next-info-row"><strong>BARBERO:</strong> ${escapeHtml(next.barbero)}</p>` : ''}
                </div>
            </div>
        `;
    }

    function renderEmptyState() {
        if (calendarContainer) {
            calendarContainer.innerHTML = `
                <p class="empty-message" id="empty-message">
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
                window.location.href = 'home.html';
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        });
    }

    // SLIDER DE PROMOCIONES
    const promoSlides = document.querySelectorAll('.promo-slide');
    const promoDots = document.querySelectorAll('.promo-dot');
    let currentSlide = 0;

    function showSlide(idx) {
        promoSlides.forEach((s, i) => s.classList.toggle('active', i === idx));
        promoDots.forEach((d, i) => d.classList.toggle('active', i === idx));
        currentSlide = idx;
    }

    promoDots.forEach((dot, i) => {
        dot.addEventListener('click', () => showSlide(i));
    });

    if (promoSlides.length > 1) {
        setInterval(() => {
            showSlide((currentSlide + 1) % promoSlides.length);
        }, 6000);
    }
});