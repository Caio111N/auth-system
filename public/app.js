/**
 * ============================================================
 * ARQUIVO: app.js
 * FUNÇÃO: Controla formulários, feedback de interface e chamadas same-origin à API.
 * USADO POR: páginas HTML públicas, página de verificação e dashboard.
 * ============================================================
 */

// ------------------------------------------------------------
// CONFIGURAÇÃO: prefixo da API para as operações de autenticação
// ------------------------------------------------------------
const API = '/api/auth';

// ------------------------------------------------------------
// HELPERS DE FORMULÁRIO: CSRF, mensagens, estado de carregamento e POST
// ------------------------------------------------------------
/**
 * Ler o token double-submit do cookie acessível ao frontend.
 * @returns {string} Token para o header X-CSRF-Token ou string vazia.
 */
const getCsrfToken = () => {
    const csrfCookie = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('csrfToken='));
    return csrfCookie ? csrfCookie.slice('csrfToken='.length) : '';
};

/**
 * Traduzir status HTTP frequentes em mensagens adequadas à interface.
 * @param {number} status Código HTTP recebido.
 * @param {string} fallback Mensagem segura fornecida pelo servidor ou chamada.
 * @returns {string} Mensagem apresentada ao usuário.
 */
const friendlyError = (status, fallback) => {
    if (status === 401) return 'E-mail ou senha inválidos.';
    if (status === 409)
        return 'Não foi possível concluir a operação com esses dados.';
    if (status === 429)
        return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (status === 400) return 'Confira os dados informados e tente novamente.';
    return fallback;
};

/**
 * Atualizar mensagem de feedback do formulário.
 * @param {HTMLFormElement} form Formulário relacionado.
 * @param {string} message Texto visível e acessível.
 * @param {'success'|'error'} type Estado visual da mensagem.
 * @returns {void}
 */
const setMessage = (form, message, type) => {
    const element = form.querySelector('.form-message');
    element.textContent = message;
    element.className = `form-message show ${type}`;
};

/**
 * Desabilitar botão durante envio e restaurar seu conteúdo ao concluir.
 * @param {HTMLButtonElement} button Botão de envio.
 * @param {boolean} loading Indica se a requisição está em andamento.
 * @returns {void}
 */
const setLoading = (button, loading) => {
    button.classList.toggle('loading', loading);
    button.disabled = loading;
    if (loading) button.dataset.originalText = button.innerHTML;
    button.innerHTML = loading
        ? '<span class="spinner">◌</span> Processando...'
        : button.dataset.originalText;
};

/**
 * Enviar formulário JSON com cookies same-origin e proteção CSRF.
 * @param {HTMLFormElement} form Formulário que recebe feedback.
 * @param {string} endpoint Segmento do endpoint sob `/api/auth`.
 * @param {object} payload Corpo JSON a enviar.
 * @param {string} successMessage Mensagem após resposta bem-sucedida.
 * @param {(data: object) => void} [onSuccess] Ação opcional após sucesso.
 * @returns {Promise<void>} Atualiza feedback e chama a ação de sucesso.
 */
const submitForm = async (
    form,
    endpoint,
    payload,
    successMessage,
    onSuccess
) => {
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
        const response = await fetch(`${API}/${endpoint}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken(),
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw new Error(
                friendlyError(
                    response.status,
                    data.error || 'Não foi possível concluir a operação.'
                )
            );
        setMessage(form, successMessage, 'success');
        if (onSuccess) onSuccess(data);
    } catch (error) {
        setMessage(
            form,
            error.message || 'Não foi possível conectar ao servidor.',
            'error'
        );
    } finally {
        setLoading(button, false);
    }
};

// ------------------------------------------------------------
// CADASTRO E LOGIN: envia credenciais e redireciona após sucesso
// ------------------------------------------------------------
const loginForm = document.querySelector('[data-form="login"]');
if (loginForm)
    /**
     * Submeter credenciais de login com a preferência de duração da sessão.
     * @param {SubmitEvent} event Evento de envio do formulário.
     * @returns {void}
     */
    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(loginForm);
        submitForm(
            loginForm,
            'login',
            {
                email: data.get('email'),
                password: data.get('password'),
                rememberMe: loginForm.querySelector('input[type="checkbox"]')
                    .checked,
            },
            'Login realizado. Redirecionando...',
            () => {
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 450);
            }
        );
    });

const registerForm = document.querySelector('[data-form="register"]');
if (registerForm)
    /**
     * Validar confirmação local e enviar dados de cadastro à API.
     * @param {SubmitEvent} event Evento de envio do formulário.
     * @returns {void}
     */
    registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(registerForm);
        if (data.get('password') !== data.get('confirmPassword')) {
            setMessage(registerForm, 'As senhas não coincidem.', 'error');
            return;
        }
        submitForm(
            registerForm,
            'register',
            {
                name: data.get('name'),
                email: data.get('email'),
                password: data.get('password'),
            },
            'Solicitação processada. Redirecionando para o login...',
            /**
             * Navegar para login após a resposta neutra de cadastro.
             * @returns {void}
             */
            () => {
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 800);
            }
        );
    });

const resendVerificationButton = document.querySelector(
    '[data-resend-verification]'
);
if (resendVerificationButton)
    /**
     * Solicitar reenvio de verificação usando o e-mail digitado no login.
     * @returns {Promise<void>} Atualiza o feedback com resposta neutra.
     */
    resendVerificationButton.addEventListener('click', async () => {
        const form = document.querySelector('[data-form="login"]');
        const email = form.querySelector('[name="email"]').value;
        if (!email) {
            setMessage(
                form,
                'Informe seu e-mail para solicitar a verificação.',
                'error'
            );
            return;
        }
        try {
            const response = await fetch(`${API}/resend-verification`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(friendlyError(response.status, data.error));
            setMessage(form, data.message, 'success');
        } catch (error) {
            setMessage(
                form,
                error.message || 'Não foi possível solicitar a verificação.',
                'error'
            );
        }
    });

const forgotForm = document.querySelector('[data-form="forgot"]');
if (forgotForm)
    /**
     * Enviar solicitação de recuperação e apresentar resultado neutro.
     * @param {SubmitEvent} event Evento de envio do formulário.
     * @returns {void}
     */
    forgotForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(forgotForm);
        submitForm(
            forgotForm,
            'forgot-password',
            { email: data.get('email') },
            'Se o e-mail existir, você receberá as instruções em breve.'
        );
    });

const resetForm = document.querySelector('[data-form="reset"]');
if (resetForm)
    /**
     * Enviar senha nova junto ao token recebido por query string.
     * @param {SubmitEvent} event Evento de envio do formulário.
     * @returns {void}
     */
    resetForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(resetForm);
        if (data.get('password') !== data.get('confirmPassword')) {
            setMessage(resetForm, 'As senhas não coincidem.', 'error');
            return;
        }
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) {
            setMessage(
                resetForm,
                'Link de recuperação inválido ou incompleto.',
                'error'
            );
            return;
        }
        submitForm(
            resetForm,
            'reset-password',
            { token, password: data.get('password') },
            'Senha redefinida. Você já pode fazer login.',
            () => {
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 900);
            }
        );
    });

const verifyEmailForm = document.querySelector('[data-form="verify-email"]');
if (verifyEmailForm) {
    /**
     * Consumir o token de confirmação recebido no link de e-mail.
     * @param {SubmitEvent} event Evento de envio do formulário.
     * @returns {void}
     */
    verifyEmailForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) {
            setMessage(
                verifyEmailForm,
                'Link de verificação inválido ou incompleto.',
                'error'
            );
            return;
        }
        submitForm(
            verifyEmailForm,
            'verify-email',
            { token },
            'E-mail verificado. Redirecionando para o login...',
            () => {
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 900);
            }
        );
    });
}

// ------------------------------------------------------------
// DASHBOARD: carrega perfil, renova access uma vez e encerra sessão
// ------------------------------------------------------------
const dashboard = document.querySelector('[data-user-name]');
if (dashboard) {
    /**
     * Buscar perfil usando cookies same-origin.
     * @returns {Promise<Response>} Resposta do endpoint autenticado.
     */
    const loadProfile = () =>
        fetch(`${API}/profile`, { credentials: 'same-origin' });
    loadProfile()
        .then(async (response) => {
            if (response.status === 401) {
                const refreshResponse = await fetch(`${API}/refresh`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'X-CSRF-Token': getCsrfToken() },
                });
                if (!refreshResponse.ok) throw new Error('Sessão expirada');
                const retriedResponse = await loadProfile();
                if (!retriedResponse.ok) throw new Error('Sessão expirada');
                return retriedResponse.json();
            }
            if (!response.ok)
                throw new Error('Não foi possível carregar o perfil');
            return response.json();
        })
        .then(({ user }) => {
            document.querySelectorAll('[data-user-name]').forEach((element) => {
                element.textContent = user.name;
            });
            document.querySelector('[data-user-email]').textContent =
                user.email;
            document.querySelector('[data-user-initials]').textContent =
                user.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
        })
        .catch(() => {
            window.location.href = '/login.html';
        });
}

/**
 * Revogar sessão atual e retornar à página pública ao clicar em sair.
 * @returns {Promise<void>} Encerra sessão e navega para a raiz mesmo em erro.
 */
document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
        await fetch(`${API}/logout`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrfToken() },
        });
    } finally {
        window.location.href = '/';
    }
});
