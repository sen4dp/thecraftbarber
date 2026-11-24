document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("btn-login");
    const registerBtn = document.getElementById("btn-register");

    function playClick() {}   // sin sonido (click.mp3 no existe)

    // Evento para Iniciar Sesión
    loginBtn.addEventListener("click", () => {
        playClick();
        // Agrega una pequeña pausa para que se aprecie la animación del botón antes de cambiar de página
        setTimeout(() => {
            window.location.href = "/Views/login.html"; // Cambia por tu ruta real
        }, 150);
    });

    // Evento para Registrarse
    registerBtn.addEventListener("click", () => {
        playClick();
        setTimeout(() => {
            window.location.href = "/Views/register.html"; // Cambia por tu ruta real
        }, 150);
    });
});