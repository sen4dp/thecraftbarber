document.getElementById('register-form').addEventListener('submit', function(e) {
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