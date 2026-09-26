import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDc1Oha-1Es-7vS9jZe5DkXXuI17OYVzKY', authDomain: 'the-craftbarber.firebaseapp.com', projectId: 'the-craftbarber',
  storageBucket: 'the-craftbarber.firebasestorage.app', messagingSenderId: '1064165237871', appId: '1:1064165237871:web:3aae757a6f5a30bfb3d99a', measurementId: 'G-HCPNHKKS7C'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// DASHBOARD DE BARBERO - THE CRAFT BARBER
// ==========================================
// Este archivo trae la interfaz completa y funcionando con datos de
// ejemplo/vacíos. Los puntos donde debes conectar Firebase están
// marcados con "// TODO:". Las funciones renderAgenda(), renderNotas()
// y el estado de la galería ya están listos para recibir datos reales:
// solo llama a esas funciones con lo que traigas de Firestore/Storage.

document.addEventListener('DOMContentLoaded', () => {

    // ------------------------------------------
    // Elementos de la interfaz
    // ------------------------------------------
    const userNameElement = document.getElementById('user-name-display');
    const heroGreeting = document.getElementById('hero-greeting');
    const heroUsername = document.getElementById('hero-username');
    const heroDate = document.getElementById('hero-date');

    const statToday = document.getElementById('stat-today');
    const statNext = document.getElementById('stat-next');
    const statGallery = document.getElementById('stat-gallery');

    const agendaGrid = document.getElementById('agenda-grid');
    const agendaCount = document.getElementById('agenda-count');

    const galleryGrid = document.getElementById('gallery-grid');
    const galleryInput = document.getElementById('gallery-input');
    const galleryBadge = document.getElementById('gallery-badge');
    const galleryHint = document.getElementById('gallery-hint');

    const notesList = document.getElementById('notes-list');
    const notesCount = document.getElementById('notes-count');

    // Modal de perfil
    const profileTrigger = document.getElementById('user-profile-trigger');
    const profileModal = document.getElementById('profile-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalUsername = document.getElementById('modal-username');
    const modalEmail = document.getElementById('modal-email');
    const modalPassword = document.getElementById('modal-password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const btnLogout = document.getElementById('btn-logout');
    const navbarAvatarInitial = document.getElementById('navbar-avatar-initial');
    const modalAvatarInitial = document.getElementById('modal-avatar-initial');

    const MAX_FOTOS = 5;

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
        return new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).toUpperCase();
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

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    }

    // Intenta interpretar fecha/hora guardadas como "YYYY-MM-DD" o "DD/MM/YYYY"
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

    function formatShortDate(d) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
        return `${day} ${month}`;
    }

    let currentUser = null;
    let notesUnsubscribe = null;

    if (heroGreeting) heroGreeting.textContent = getGreeting();
    if (heroDate) heroDate.textContent = getHeroDateText();

    async function loadBarberAppointments(barberId) {
        try {
            const ref = collection(db, 'citas');
            const q = query(ref, where('barberoId', '==', barberId));
            const snap = await getDocs(q);
            renderAgenda(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error('Error cargando agenda:', error);
            renderAgenda([]);
        }
    }

    function subscribeNotes(barberId) {
        if (notesUnsubscribe) notesUnsubscribe();
        const q = query(collection(db, 'notas'), where('barberoId', '==', barberId));
        notesUnsubscribe = onSnapshot(q, snap => {
            const notas = snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
            renderNotas(notas);
        });
    }

    async function setPresence(user, online) {
        try {
            await setDoc(doc(db, 'presence', user.uid), {
                online,
                username: user.displayName || user.email?.split('@')[0] || 'BARBERO',
                lastSeen: serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error('Error de presencia:', e); }
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = 'login.html'; return; }
        try {
            const profileSnap = await getDoc(doc(db, 'users', user.uid));
            const profile = profileSnap.exists() ? profileSnap.data() : {};
            if (profile.role !== 'barbero' || profile.status !== 'approved') {
                alert('Tu cuenta de barbero no está aprobada.');
                await signOut(auth);
                window.location.href = 'home.html';
                return;
            }
            currentUser = user;
            const currentName = profile.username || user.displayName || user.email?.split('@')[0] || 'BARBERO';
            if (userNameElement) userNameElement.textContent = currentName.toUpperCase();
            if (heroUsername) heroUsername.textContent = currentName.toUpperCase();
            setAvatarInitial(currentName);
            if (modalUsername) modalUsername.value = currentName.toUpperCase();
            if (modalEmail) modalEmail.value = user.email || '';
            await setPresence(user, true);
            setInterval(() => setPresence(user, true), 30000);
            await loadBarberAppointments(user.uid);
            subscribeNotes(user.uid);
        } catch (error) {
            console.error('Error inicializando dashboard:', error);
            alert('No se pudo cargar tu perfil de barbero.');
        }
    });

    // ==========================================
    // AGENDA DE TRABAJO
    // ==========================================
    // TODO: reemplazar por tu propia carga desde Firestore, por ejemplo:
    // const citasRef = collection(db, 'citas');
    // const q = query(citasRef, where('barberoId', '==', barberoId));
    // const snapshot = await getDocs(q);
    // const citas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // renderAgenda(citas);
    function renderAgenda(citas) {
        const withDates = citas.map((cita) => ({ ...cita, _date: parseCitaDate(cita) }));
        withDates.sort((a, b) => {
            if (a._date && b._date) return a._date - b._date;
            if (a._date) return -1;
            if (b._date) return 1;
            return 0;
        });

        const now = new Date();
        const total = withDates.length;
        const todayCount = withDates.filter((c) => c._date && isSameDay(c._date, now)).length;
        const next = withDates.find((c) => c._date && c._date >= now) || null;

        if (agendaCount) agendaCount.textContent = String(total);
        if (statToday) statToday.textContent = String(todayCount);
        if (statNext) statNext.textContent = next ? formatShortDate(next._date) : '—';

        if (total === 0) {
            agendaGrid.innerHTML = `<p class="empty-message" id="agenda-empty">AÚN NO TIENES CITAS ASIGNADAS</p>`;
            return;
        }

        let html = '';
        withDates.forEach((cita) => {
            const isToday = cita._date ? isSameDay(cita._date, now) : false;
            const isPast = cita._date ? cita._date < now && !isToday : false;
            const isNext = next && cita === next;

            let badge = '';
            if (isToday) badge = '<span class="badge badge-today">HOY</span>';
            else if (isNext) badge = '<span class="badge badge-next">PRÓXIMA</span>';
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
                    ${cita.cliente ? `
                    <div class="appointment-row">
                        <span class="appointment-label">CLIENTE</span>
                        <span class="appointment-value">${escapeHtml(cita.cliente)}</span>
                    </div>` : ''}
                    ${cita.servicio ? `
                    <div class="appointment-row">
                        <span class="appointment-label">SERVICIO</span>
                        <span class="appointment-value">${escapeHtml(cita.servicio)}</span>
                    </div>` : ''}
                </div>
            `;
        });
        agendaGrid.innerHTML = html;
    }

    // La agenda se carga después de validar la sesión.

    // ==========================================
    // GALERÍA DE TRABAJOS (máx. 5 fotos)
    // ==========================================
    // Estado local de la galería: cada elemento es { file, url } mientras
    // no esté conectada a Storage, o { url, path } cuando ya vengan de
    // Firebase (en ese caso "file" no es necesario).
    // TODO: al conectar Firebase, carga las fotos existentes del barbero
    // en este arreglo (ej. desde un campo "fotos" del documento del barbero)
    // y llama a renderGallery() una vez cargadas.
    let fotos = [];

    function renderGallery() {
        let html = '';

        fotos.forEach((foto, index) => {
            html += `
                <div class="gallery-slot">
                    <img src="${foto.url}" alt="Foto de trabajo ${index + 1}">
                    <button type="button" class="gallery-remove" data-index="${index}" title="Eliminar foto">&times;</button>
                </div>
            `;
        });

        const espaciosLibres = MAX_FOTOS - fotos.length;
        for (let i = 0; i < espaciosLibres; i++) {
            html += `
                <div class="gallery-slot gallery-slot-empty" data-add-slot>
                    <span class="plus-icon">+</span>
                </div>
            `;
        }

        galleryGrid.innerHTML = html;

        if (galleryBadge) galleryBadge.textContent = `${fotos.length}/${MAX_FOTOS}`;
        if (statGallery) statGallery.textContent = `${fotos.length}/${MAX_FOTOS}`;

        if (galleryHint) {
            galleryHint.textContent = fotos.length >= MAX_FOTOS
                ? 'Alcanzaste el máximo de 5 fotos. Elimina una para subir otra.'
                : 'Toca un espacio vacío para subir una foto (JPG o PNG).';
        }

        // Abrir el selector de archivos al tocar un espacio vacío
        galleryGrid.querySelectorAll('[data-add-slot]').forEach((slot) => {
            slot.addEventListener('click', () => {
                if (fotos.length >= MAX_FOTOS) return;
                galleryInput.click();
            });
        });

        // Quitar una foto
        galleryGrid.querySelectorAll('.gallery-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = Number(btn.dataset.index);
                // TODO: si la foto ya está en Firebase Storage, borra también
                // el archivo remoto (deleteObject) usando fotos[index].path
                fotos.splice(index, 1);
                renderGallery();
            });
        });
    }

    if (galleryInput) {
        galleryInput.addEventListener('change', (e) => {
            const archivos = Array.from(e.target.files || []);
            const espaciosLibres = MAX_FOTOS - fotos.length;

            archivos.slice(0, espaciosLibres).forEach((file) => {
                const url = URL.createObjectURL(file);
                fotos.push({ file, url });
                // TODO: subir "file" a Firebase Storage aquí y, cuando tengas
                // la URL definitiva, reemplázala en este mismo objeto.
            });

            renderGallery();
            galleryInput.value = '';
        });
    }

    renderGallery();

    // ==========================================
    // NOTAS DEL JEFE
    // ==========================================
    // TODO: reemplazar por tu carga desde Firestore, por ejemplo una
    // colección "notas" filtrada por barberoId, ordenada por fecha.
    // Cada nota puede tener { fecha, texto, nueva }.
    function renderNotas(notas) {
        if (notesCount) notesCount.textContent = String(notas.length);

        if (notas.length === 0) {
            notesList.innerHTML = `<p class="empty-message" id="notes-empty">NO TIENES NOTAS NUEVAS</p>`;
            return;
        }

        let html = '';
        notas.forEach((nota) => {
            html += `
                <div class="note-item">
                    ${nota.nueva ? '<span class="badge badge-new">NUEVA</span>' : ''}
                    <span class="note-date">${escapeHtml(nota.fecha || (nota.createdAt?.toDate ? nota.createdAt.toDate().toLocaleDateString('es-CO') : ''))}</span>
                    <p class="note-text">${escapeHtml(nota.texto || '')}</p>
                </div>
            `;
        });
        notesList.innerHTML = html;
    }

    // Las notas se cargan en tiempo real después de validar la sesión.

    // ==========================================
    // MODAL DE PERFIL
    // ==========================================
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

    if (togglePasswordBtn && modalPassword) {
        let isVisible = false;
        togglePasswordBtn.addEventListener('click', () => {
            isVisible = !isVisible;
            modalPassword.type = isVisible ? 'text' : 'password';
            togglePasswordBtn.textContent = isVisible ? '🙈' : '👁️';
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                if (currentUser) await setPresence(currentUser, false);
                await signOut(auth);
                localStorage.clear();
                window.location.href = 'home.html';
            } catch (error) { console.error(error); }
        });
    }

    // ==========================================
    // TODO: CONEXIÓN CON FIREBASE (a cargo del usuario)
    // ==========================================
    // Aquí es donde normalmente irían:
    //   1. La inicialización de Firebase (initializeApp, getAuth, getFirestore, getStorage)
    //   2. onAuthStateChanged para llenar userNameElement, heroUsername,
    //      modalUsername, modalEmail y setAvatarInitial(nombre)
    //   3. La carga real de citas -> renderAgenda(citas)
    //   4. La carga real de notas -> renderNotas(notas)
    //   5. La carga de fotos ya guardadas en Storage -> fotos = [...]; renderGallery();
});
