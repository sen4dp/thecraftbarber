document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Captura de datos
    const role = document.querySelector('input[name="role"]:checked').value;
    const user = document.getElementById('username').value;
    
    console.log(`Iniciando sesión como ${role}: ${user}`);
    
    // Aquí puedes añadir tu lógica de Firebase o API
    alert(`¡Bienvenido, ${user}! Accediendo como ${role}...`);
});

