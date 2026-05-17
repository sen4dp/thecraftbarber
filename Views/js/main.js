document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("btn-login");
    const registerBtn = document.getElementById("btn-register");

    // Opcional: Audio de click estilo Minecraft
    // Puedes usar un archivo .mp3 corto de un click clásico.
    const clickSound = new Audio('click.mp3'); 
    clickSound.volume = 0.5;

    function playClick() {
        // Reinicia el audio si se presiona rápido
        clickSound.currentTime = 0;
        clickSound.play().catch(err => console.log("Audio esperando interacción."));
    }

    // Evento para Iniciar Sesión
    loginBtn.addEventListener("click", () => {
        playClick();
        // Agrega una pequeña pausa para que se aprecie la animación del botón antes de cambiar de página
        setTimeout(() => {
            window.location.href = "login.html"; // Cambia por tu ruta real
        }, 150);
    });

    // Evento para Registrarse
    registerBtn.addEventListener("click", () => {
        playClick();
        setTimeout(() => {
            window.location.href = "registro.html"; // Cambia por tu ruta real
        }, 150);
    });
});