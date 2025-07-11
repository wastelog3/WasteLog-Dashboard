document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginMessage = document.getElementById('loginMessage');
    const NODE_RED_URL = 'https://wastelognodered-services-production.up.railway.app';
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginMessage.textContent = '';
        const username = e.target.username.value;
        const password = e.target.password.value;
        try {
            const response = await fetch(`${NODE_RED_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const result = await response.json();
            if (result.success) {
                localStorage.setItem('isLoggedIn', 'true');
                window.location.href = 'dashboard.html';
            } else {
                loginMessage.textContent = result.message || 'Login gagal.';
            }
        } catch (error) {
            console.error('Error saat login:', error);
            loginMessage.textContent = 'Tidak dapat terhubung ke server.';
        }
    });
});
