// Desactivar funcionalidad de login
document.addEventListener('DOMContentLoaded', function() {
    const loginButtons = document.querySelectorAll('.user-accounts-link');
    loginButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Prevenir la redirección
            console.log('Login temporalmente deshabilitado');
            return false;
        });
    });
});