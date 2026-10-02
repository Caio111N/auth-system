/**
 * ============================================================
 * ARQUIVO: authRoutes.js
 * FUNÇÃO: Liga endpoints de autenticação a validação, limites e controllers.
 * USADO POR: app.js no prefixo `/api/auth`.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: controllers e middleware usados pelas rotas
// ------------------------------------------------------------
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const rateLimit = require('../middlewares/rateLimit');
const config = require('../config');
const validateBody = require('../middlewares/validateBody');
const schemas = require('../validation/authSchemas');

// ------------------------------------------------------------
// ROTAS PÚBLICAS: cadastro, login e operações de conta com CSRF
// ------------------------------------------------------------
/**
 * POST /api/auth/register — pública + CSRF.
 * Body fictício: { "name": "Ana Exemplo", "email": "ana@example.test", "password": "Senha segura 2026!" }.
 * Retorna 202 com mensagem neutra; validação responde 400.
 */
router.post(
    '/register',
    rateLimit({
        max: config.registerRateLimitMax,
        emailMax: config.registerRateLimitMax,
    }),
    validateBody(schemas.register),
    authController.register
);

/**
 * POST /api/auth/login — pública + CSRF.
 * Body fictício: { "email": "ana@example.test", "password": "Senha segura 2026!", "rememberMe": false }.
 * Retorna 200 e cookies; credenciais inválidas retornam 401 e excesso retorna 429.
 */
router.post(
    '/login',
    rateLimit({
        max: config.loginRateLimitMax,
        emailMax: config.loginEmailRateLimitMax,
    }),
    validateBody(schemas.login),
    authController.login
);

/**
 * POST /api/auth/refresh — refresh cookie + CSRF, sem exigir access token.
 * Body: {}. Retorna sessão renovada ou 401/429.
 */
router.post(
    '/refresh',
    rateLimit({ max: config.refreshRateLimitMax }),
    validateBody(schemas.emptyBody),
    authController.refresh
);

/**
 * POST /api/auth/logout — pública + CSRF, revoga refresh cookie se presente.
 * Body: {}. Retorna confirmação e limpa cookies.
 */
router.post('/logout', validateBody(schemas.emptyBody), authController.logout);

/**
 * POST /api/auth/logout-all — exige access token válido + CSRF.
 * Body: {}. Retorna confirmação após revogar as sessões.
 */
router.post(
    '/logout-all',
    validateBody(schemas.emptyBody),
    authMiddleware,
    authController.logoutAll
);

/**
 * POST /api/auth/forgot-password — pública + CSRF.
 * Body fictício: { "email": "ana@example.test" }. Retorna mensagem neutra.
 */
router.post(
    '/forgot-password',
    rateLimit({
        max: config.forgotPasswordRateLimitMax,
        emailMax: config.forgotPasswordRateLimitMax,
    }),
    validateBody(schemas.email),
    authController.forgotPassword
);

/**
 * POST /api/auth/resend-verification — pública + CSRF.
 * Body fictício: { "email": "ana@example.test" }. Retorna mensagem neutra.
 */
router.post(
    '/resend-verification',
    rateLimit({
        max: config.emailVerificationRateLimitMax,
        emailMax: config.emailVerificationRateLimitMax,
    }),
    validateBody(schemas.email),
    authController.resendVerification
);

/**
 * POST /api/auth/verify-email — pública + CSRF.
 * Body: { "token": "<TOKEN_HEXADECIMAL_DE_64_CARACTERES>" }. Retorna confirmação ou token inválido.
 */
router.post(
    '/verify-email',
    rateLimit({ max: config.resetPasswordRateLimitMax }),
    validateBody(schemas.verifyEmail),
    authController.verifyEmail
);

/**
 * POST /api/auth/reset-password — pública + CSRF.
 * Body: { "token": "<TOKEN_HEXADECIMAL_DE_64_CARACTERES>", "password": "Nova senha segura 2026!" }.
 * Retorna confirmação ou token inválido/expirado.
 */
router.post(
    '/reset-password',
    rateLimit({
        max: config.resetPasswordRateLimitMax,
        tokenMax: config.resetPasswordRateLimitMax,
    }),
    validateBody(schemas.resetPassword),
    authController.resetPassword
);

// ------------------------------------------------------------
// ROTAS PROTEGIDAS: endpoints que exigem access token e sessão ativa
// ------------------------------------------------------------
/**
 * GET /api/auth/private — exige access token válido.
 * Retorna uma confirmação de acesso autorizado.
 */
router.get('/private', authMiddleware, (req, res) => {
    res.json({ message: 'Acesso autorizado à rota privada!' });
});

/**
 * GET /api/auth/profile — exige access token válido.
 * Retorna somente nome, e-mail e data de criação.
 */
router.get('/profile', authMiddleware, authController.profile);

// ------------------------------------------------------------
// EXPORTS: router montado pela aplicação Express
// ------------------------------------------------------------
module.exports = router;
