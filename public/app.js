const API = '/api/auth';

const friendlyError = (status, fallback) => {
    if (status === 401) return 'E-mail ou senha inválidos.';
    if (status === 409) return 'Este e-mail já está cadastrado.';
    if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (status === 400) return 'Confira os dados informados e tente novamente.';
    return fallback;
};

const setMessage = (form, message, type) => {
    const element = form.querySelector('.form-message');
    element.textContent = message;
    element.className = `form-message show ${type}`;
};

const setLoading = (button, loading) => {
    button.classList.toggle('loading', loading);
    button.disabled = loading;
    if (loading) button.dataset.originalText = button.innerHTML;
    button.innerHTML = loading ? '<span class="spinner">◌</span> Processando...' : button.dataset.originalText;
};

const submitForm = async (form, endpoint, payload, successMessage, onSuccess) => {
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
        const response = await fetch(`${API}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(friendlyError(response.status, data.error || 'Não foi possível concluir a operação.'));
        setMessage(form, successMessage, 'success');
        if (onSuccess) onSuccess(data);
    } catch (error) {
        setMessage(form, error.message || 'Não foi possível conectar ao servidor.', 'error');
    } finally {
        setLoading(button, false);
    }
};

const loginForm = document.querySelector('[data-form="login"]');
if (loginForm) loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    submitForm(loginForm, 'login', { email: data.get('email'), password: data.get('password') }, 'Login realizado. Redirecionando...', (result) => {
        localStorage.setItem('authToken', result.token);
        setTimeout(() => { window.location.href = '/dashboard.html'; }, 450);
    });
});

const registerForm = document.querySelector('[data-form="register"]');
if (registerForm) registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    if (data.get('password') !== data.get('confirmPassword')) {
        setMessage(registerForm, 'As senhas não coincidem.', 'error');
        return;
    }
    submitForm(registerForm, 'register', { name: data.get('name'), email: data.get('email'), password: data.get('password') }, 'Conta criada! Redirecionando para o login...', () => {
        setTimeout(() => { window.location.href = '/login.html'; }, 800);
    });
});

const forgotForm = document.querySelector('[data-form="forgot"]');
if (forgotForm) forgotForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(forgotForm);
    submitForm(forgotForm, 'forgot-password', { email: data.get('email') }, 'Se o e-mail existir, você receberá as instruções em breve.');
});

const resetForm = document.querySelector('[data-form="reset"]');
if (resetForm) resetForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(resetForm);
    if (data.get('password') !== data.get('confirmPassword')) {
        setMessage(resetForm, 'As senhas não coincidem.', 'error');
        return;
    }
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
        setMessage(resetForm, 'Link de recuperação inválido ou incompleto.', 'error');
        return;
    }
    submitForm(resetForm, 'reset-password', { token, password: data.get('password') }, 'Senha redefinida. Você já pode fazer login.', () => {
        setTimeout(() => { window.location.href = '/login.html'; }, 900);
    });
});

const dashboard = document.querySelector('[data-user-name]');
if (dashboard) {
    const token = localStorage.getItem('authToken');
    if (!token) window.location.href = '/login.html';
    else fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => {
            if (!response.ok) throw new Error('Sessão expirada');
            return response.json();
        })
        .then(({ user }) => {
            document.querySelectorAll('[data-user-name]').forEach((element) => { element.textContent = user.name; });
            document.querySelector('[data-user-email]').textContent = user.email;
            document.querySelector('[data-user-initials]').textContent = user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
        })
        .catch(() => {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        });
}

document.querySelector('[data-logout]')?.addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = '/';
});
