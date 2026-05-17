document.addEventListener("DOMContentLoaded", () => {
    
    // 1. CONTROL DEL BOTÓN HOME (Volver al Inicio)
    const homeBtn = document.getElementById("btn-home");
    if (homeBtn) {
        homeBtn.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "index.html"; // Cambia por tu archivo principal si se llama diferente
            }, 100);
        });
    }

    // 2. CONTROL DEL ENLACE PUENTE (Ir a Registro con retraso para la animación)
    const registerLink = document.getElementById('link-to-register');
    if (registerLink) {
        registerLink.addEventListener('click', function(e) {
            e.preventDefault();
            setTimeout(() => {
                window.location.href = this.getAttribute('href');
            }, 100);
        });
    }

    // 3. LOGICA DEL FORMULARIO (Tu código original de capturar datos)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Captura de datos
            const role = document.querySelector('input[name="role"]:checked').value;
            const user = document.getElementById('username').value;
            
            console.log(`Iniciando sesión como ${role}: ${user}`);
            alert(`¡Bienvenido, ${user}! Accediendo como ${role}...`);
        });
    }
});