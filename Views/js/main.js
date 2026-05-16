document.addEventListener("DOMContentLoaded", () => {
    
    // --- LÓGICA DEL FORMULARIO 1: LOGIN ---
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const selectedRole = document.getElementById("role").value;
            const username = document.getElementById("username").value;
            
            // Guardamos temporalmente los datos en la sesión del navegador
            sessionStorage.setItem("userRole", selectedRole);
            sessionStorage.setItem("userName", username);
            
            // Redirección inmediata al Dashboard
            window.location.href = "dashboard.html";
        });
    }

    // --- LÓGICA DEL DASHBOARD (MENÚ DINÁMICO Y VISTAS) ---
    const welcomeMessage = document.getElementById("welcomeMessage");
    if (welcomeMessage) {
        const role = sessionStorage.getItem("userRole") || "cliente";
        const name = sessionStorage.getItem("userName") || "Invitado";
        
        welcomeMessage.innerText = `⚔️ Bienvenido, ${name} [Rol: ${role.toUpperCase()}] ⚔️`;
        
        // Mostrar la sección correspondiente al actor asignado
        const targetSection = document.getElementById(`section-${role}`);
        if (targetSection) {
            targetSection.classList.remove("hidden");
        }

        // Construir el menú dinámico requerido por la guía del SENA
        const dynamicNav = document.getElementById("dynamicNav");
        if (role === "cliente") {
            dynamicNav.innerHTML = `
                <a href="home.html">Inicio</a>
                <a href="#" class="active">Agendar Cita</a>
                <a href="#">Ver Catálogo</a>
                <a href="home.html">Cerrar Sesión</a>
            `;
        } else if (role === "barbero") {
            dynamicNav.innerHTML = `
                <a href="home.html">Inicio</a>
                <a href="#" class="active">Consola de Agenda</a>
                <a href="#">Reportes del Día</a>
                <a href="home.html">Cerrar Sesión</a>
            `;
        } else if (role === "vendedor") {
            dynamicNav.innerHTML = `
                <a href="home.html">Inicio</a>
                <a href="#" class="active">Control de Stock</a>
                <a href="#">Pedidos Pendientes</a>
                <a href="home.html">Cerrar Sesión</a>
            `;
        }
    }

    // --- LÓGICA DEL FORMULARIO 2: AGENDAMIENTO ---
    const appointmentForm = document.getElementById("appointmentForm");
    if (appointmentForm) {
        appointmentForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const date = document.getElementById("date").value;
            const time = document.getElementById("time").value;
            const service = document.getElementById("service").value;
            
            alert(`¡Cita guardada en el Servidor!\nFecha: ${date}\nHora: ${time}\nServicio: ${service.toUpperCase()}`);
            appointmentForm.reset();
        });
    }
});