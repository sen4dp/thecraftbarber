document.addEventListener("DOMContentLoaded", () => {
    
    // 1. CONTROL DEL BOTÓN HOME (Volver al Inicio)
    const homeBtn = document.getElementById("btn-home");
    if (homeBtn) {
        homeBtn.addEventListener("click", () => {
            setTimeout(() => {
                window.location.href = "home.html"; 
            }, 100);
        });
    }

    // 2. CONTROL DEL ENLACE PUENTE (Ir a Login con retraso para la animación)
    const loginLink = document.getElementById('link-to-login');
    if (loginLink) {
        loginLink.addEventListener('click', function(e) {
            e.preventDefault();
            setTimeout(() => {
                window.location.href = this.getAttribute('href');
            }, 100);
        });
    }

    // 3. LOGICA DEL FORMULARIO (Tu código original de validar contraseñas)
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const pass = document.getElementById('reg-password').value;
            const confirmPass = document.getElementById('reg-confirm-password').value;
            
            if (pass !== confirmPass) {
                alert('¡Las contraseñas no coinciden!');
                return;
            }
            
            const role = document.querySelector('input[name="role"]:checked').value;
            const user = document.getElementById('reg-username').value;
            
            console.log(`Registrando a ${user} como ${role}`);
            alert(`Cuenta creada para ${user} como ${role}. ¡Bienvenido!`);
        });
    }
});