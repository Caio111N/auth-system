/**
 * ============================================================
 * ARQUIVO: authController.js
 * FUNÇÃO: Implementa endpoints de conta, autenticação, sessões e recuperação de acesso.
 * USADO POR: rotas HTTP definidas em routes/authRoutes.js.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: modelos, criptografia, e-mail, configuração e cookies
// ------------------------------------------------------------
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmails');
const config = require('../config');
const RefreshToken = require('../models/RefreshToken');
const { cookieOptions } = require('../middlewares/csrfProtection');
const logger = require('../utils/logger');

/**
 * Registrar falha de controller sem anexar erro, segredo ou dado do usuário.
 * @param {string} operation Identificador seguro da operação.
 * @returns {void}
 */
const logControllerError = (operation) => {
    logger.error(
        { operation },
        'Erro interno ao processar solicitação de autenticação.'
    );
};

/**
 * Registrar evento de segurança sem incluir identificadores ou credenciais.
 * @param {import('express').Request} req Requisição que originou o evento.
 * @param {string} event Nome estático do evento auditável.
 * @returns {void}
 */
const logSecurityEvent = (req, event) => {
    logger.warn(
        { event, requestId: req.id },
        'Evento de segurança de autenticação.'
    );
};

// ------------------------------------------------------------
// CONSTANTES DE AUTENTICAÇÃO: opções de JWT e hash dummy anti-enumeração
// ------------------------------------------------------------
const ACCESS_TOKEN_OPTIONS = {
    expiresIn: '15m',
    algorithm: 'HS256',
    issuer: 'auth-system',
    audience: 'auth-client',
};

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
    crypto.randomBytes(32).toString('hex'),
    12
);

// ------------------------------------------------------------
// HELPERS DE TOKEN: assina access token e gera hashes de tokens opacos
// ------------------------------------------------------------
/**
 * Assinar access token associado à família da sessão do usuário.
 * @param {{_id: {toString(): string}}} user Usuário autenticado.
 * @param {string} familyId Identificador da família de refresh token.
 * @returns {string} JWT curto com issuer, audience e tipo definidos.
 */
const generateToken = (user, familyId) =>
    jwt.sign(
        { sub: user._id.toString(), type: 'access', sid: familyId },
        config.jwtSecret,
        ACCESS_TOKEN_OPTIONS
    );

/**
 * Calcular hash de refresh token para persistir sem guardar o valor original.
 * @param {string} token Refresh token aleatório.
 * @returns {string} Hash SHA-256 hexadecimal.
 */
const hashRefreshToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

/**
 * Gerar refresh token imprevisível em formato base64url.
 * @returns {string} Token aleatório para cookie do navegador.
 */
const createRefreshToken = () => crypto.randomBytes(48).toString('base64url');

/**
 * Calcular hash para tokens de redefinição/verificação de uso único.
 * @param {string} token Token opaco recebido do usuário.
 * @returns {string} Hash SHA-256 hexadecimal para armazenamento.
 */
const hashOneTimeToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

/**
 * Agendar envio de verificação sem bloquear a resposta do cadastro.
 * @param {string} email Destinatário da mensagem.
 * @param {string} token Token de verificação em texto puro, somente para o link.
 * @returns {void}
 */
const scheduleVerificationEmail = (email, token) => {
    const verifyUrl = new URL('/verify-email.html', config.resetPasswordUrl);
    verifyUrl.searchParams.set('token', token);
    setImmediate(() => {
        sendEmail
            .sendVerificationEmail(email, verifyUrl.toString())
            .catch(() => {
                logger.error(
                    {
                        event: 'verification_email_delivery_failed',
                    },
                    'Não foi possível entregar o e-mail de confirmação; consulte o diagnóstico SMTP registrado anteriormente.'
                );
            });
    });
};

/**
 * Definir cookies HttpOnly de access e refresh de acordo com a sessão.
 * @param {import('express').Response} res Resposta Express.
 * @param {string} accessToken JWT curto.
 * @param {string} refreshToken Token opaco atual.
 * @param {object} session Sessão com duração e preferência rememberMe.
 * @returns {void}
 */
const setSessionCookies = (res, accessToken, refreshToken, session) => {
    const options = cookieOptions(config.isProduction);
    res.cookie('accessToken', accessToken, {
        ...options,
        httpOnly: true,
        path: '/api',
        maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
        ...options,
        httpOnly: true,
        path: '/',
        ...(session.rememberMe
            ? { maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()) }
            : {}),
    });
};

/**
 * Remover cookies de autenticação preservando Path e atributos originais.
 * @param {import('express').Response} res Resposta Express.
 * @returns {void}
 */
const clearSessionCookies = (res) => {
    res.clearCookie('accessToken', {
        ...cookieOptions(config.isProduction),
        httpOnly: true,
        path: '/api',
    });
    res.clearCookie('refreshToken', {
        ...cookieOptions(config.isProduction),
        httpOnly: true,
        path: '/',
    });
};

/**
 * Responder 401 e limpar cookies de sessão inválidos.
 * @param {import('express').Response} res Resposta Express.
 * @returns {import('express').Response} JSON com erro de sessão.
 */
const unauthorized = (res) => {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
};

// ------------------------------------------------------------
// CADASTRO E LOGIN: cria contas, valida credenciais e inicia sessões
// ------------------------------------------------------------
/**
 * Cadastrar uma conta e, se habilitado, agendar confirmação de e-mail.
 * POST /api/auth/register; pública + CSRF.
 * Exemplo: { "name": "Ana Exemplo", "email": "ana@example.test", "password": "Senha segura 2026!" }
 * @param {import('express').Request} req Body previamente validado por Zod.
 * @param {import('express').Response} res Retorna 202 e mensagem neutra; 500 em falha interna.
 * @returns {Promise<void>} Resposta JSON sem diferenciar e-mail já cadastrado.
 */
exports.register = async (req, res) => {
    const registrationMessage =
        'Solicitação processada. Tente entrar; se ainda não tiver acesso, use a recuperação da conta.';
    try {
        const { name, email, password } = req.body;
        const user = new User({
            name,
            email,
            password,
            emailVerified: !config.emailVerificationEnabled,
        });
        let verificationToken;
        if (config.emailVerificationEnabled) {
            verificationToken = crypto.randomBytes(32).toString('hex');
            user.emailVerificationTokenHash =
                hashOneTimeToken(verificationToken);
            user.emailVerificationTokenExpiresAt = new Date(
                Date.now() + config.emailVerificationTtlHours * 60 * 60 * 1000
            );
        }
        await user.save();
        if (verificationToken)
            scheduleVerificationEmail(email, verificationToken);
        return res.status(202).json({ message: registrationMessage });
    } catch (err) {
        if (err.code === 11000)
            return res.status(202).json({ message: registrationMessage });
        logControllerError('register', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Validar credenciais e criar sessão com cookies HttpOnly.
 * POST /api/auth/login; pública + CSRF.
 * Exemplo: { "email": "ana@example.test", "password": "Senha segura 2026!", "rememberMe": false }
 * @param {import('express').Request} req Body validado com e-mail/senha e rememberMe opcional.
 * @param {import('express').Response} res Retorna confirmação ou 401 genérico; 500 em falha interna.
 * @returns {Promise<void>} Resposta JSON e cookies da sessão.
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select(
            '+password +loginFailedAttempts +loginBlockedUntil'
        );
        /**
         * Unificar erros para não revelar existência ou bloqueio da conta.
         * @returns {import('express').Response} Resposta HTTP 401.
         */
        const invalidCredentials = () => {
            logSecurityEvent(req, 'login_failed');
            return res.status(401).json({ error: 'Credenciais inválidas' });
        };
        if (user?.loginBlockedUntil && user.loginBlockedUntil > new Date()) {
            await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
            return invalidCredentials();
        }

        if (user?.loginBlockedUntil) {
            await User.updateOne(
                { _id: user._id, loginBlockedUntil: { $lte: new Date() } },
                {
                    $set: { loginFailedAttempts: 0 },
                    $unset: { loginBlockedUntil: 1 },
                }
            );
            user.loginFailedAttempts = 0;
            user.loginBlockedUntil = undefined;
        }

        const isMatch = await bcrypt.compare(
            password,
            user?.password || DUMMY_PASSWORD_HASH
        );
        if (!user || !isMatch) {
            if (user) {
                const updatedUser = await User.findByIdAndUpdate(
                    user._id,
                    { $inc: { loginFailedAttempts: 1 } },
                    { returnDocument: 'after' }
                ).select('+loginFailedAttempts');
                if (
                    updatedUser &&
                    updatedUser.loginFailedAttempts >=
                        config.loginMaxFailedAttempts
                ) {
                    await User.updateOne(
                        { _id: user._id },
                        {
                            $set: {
                                loginBlockedUntil: new Date(
                                    Date.now() +
                                        config.loginBlockDurationMinutes *
                                            60 *
                                            1000
                                ),
                            },
                        }
                    );
                    logSecurityEvent(req, 'account_temporarily_blocked');
                }
            }
            return invalidCredentials();
        }

        await User.updateOne(
            { _id: user._id },
            {
                $set: { loginFailedAttempts: 0 },
                $unset: { loginBlockedUntil: 1 },
            }
        );
        if (config.emailVerificationEnabled && user.emailVerified === false)
            return invalidCredentials();

        const rememberMe = req.body.rememberMe === true;
        const expiresAt = new Date(
            Date.now() +
                (rememberMe
                    ? config.refreshLongTtlDays
                    : config.refreshShortTtlDays) *
                    24 *
                    60 *
                    60 *
                    1000
        );
        const refreshToken = createRefreshToken();
        const session = await RefreshToken.create({
            currentTokenHash: hashRefreshToken(refreshToken),
            userId: user._id,
            familyId: crypto.randomUUID(),
            expiresAt,
            rememberMe,
            userAgent: req.get('User-Agent')?.slice(0, 512),
            ip: req.ip?.slice(0, 64),
        });
        setSessionCookies(
            res,
            generateToken(user, session.familyId),
            refreshToken,
            session
        );
        res.json({ message: 'Login realizado com sucesso' });
    } catch (err) {
        logControllerError('login', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// ------------------------------------------------------------
// SESSÕES: rotação de refresh tokens e revogação no servidor
// ------------------------------------------------------------
/**
 * Rotacionar refresh token e revogar a família em caso de replay.
 * POST /api/auth/refresh; refresh cookie + CSRF.
 * Exemplo: {} (o refresh token é enviado somente no cookie HttpOnly).
 * @param {import('express').Request} req Cookie de refresh previamente carregado.
 * @param {import('express').Response} res Retorna renovação ou 401/500 em erro.
 * @returns {Promise<import('express').Response>} Resposta JSON e cookies rotacionados.
 */
exports.refresh = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return unauthorized(res);

    try {
        const tokenHash = hashRefreshToken(refreshToken);
        const now = new Date();
        const rotatedRefreshToken = createRefreshToken();
        const storedToken = await RefreshToken.findOneAndUpdate(
            {
                currentTokenHash: tokenHash,
                revokedAt: null,
                expiresAt: { $gt: now },
            },
            {
                $set: {
                    currentTokenHash: hashRefreshToken(rotatedRefreshToken),
                },
                $addToSet: { usedTokenHashes: tokenHash },
            },
            { returnDocument: 'before' }
        );

        if (!storedToken) {
            const reusedSession = await RefreshToken.findOne({
                usedTokenHashes: tokenHash,
            });
            if (reusedSession) {
                await RefreshToken.updateMany(
                    {
                        userId: reusedSession.userId,
                        familyId: reusedSession.familyId,
                        revokedAt: null,
                    },
                    { $set: { revokedAt: new Date() } }
                );
                logSecurityEvent(req, 'refresh_token_reuse_detected');
            }
            return unauthorized(res);
        }

        setSessionCookies(
            res,
            generateToken({ _id: storedToken.userId }, storedToken.familyId),
            rotatedRefreshToken,
            storedToken
        );
        return res.json({ message: 'Sessão renovada' });
    } catch {
        logControllerError('refresh');
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Revogar a sessão atual e limpar cookies do navegador.
 * POST /api/auth/logout; refresh cookie opcional + CSRF.
 * Exemplo: {}.
 * @param {import('express').Request} req Contém cookie refresh opcional.
 * @param {import('express').Response} res Retorna confirmação ou erro 500.
 * @returns {Promise<import('express').Response>} Resposta JSON de logout.
 */
exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await RefreshToken.updateOne(
                {
                    currentTokenHash: hashRefreshToken(refreshToken),
                    revokedAt: null,
                },
                { $set: { revokedAt: new Date() } }
            );
        }
        clearSessionCookies(res);
        return res.json({ message: 'Sessão encerrada' });
    } catch {
        logControllerError('logout');
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Revogar todas as sessões da conta autenticada.
 * POST /api/auth/logout-all; exige sessão + CSRF.
 * Exemplo: {}.
 * @param {import('express').Request} req Claims autenticadas em `req.user`.
 * @param {import('express').Response} res Retorna confirmação ou erro 500.
 * @returns {Promise<import('express').Response>} Resposta JSON após revogação.
 */
exports.logoutAll = async (req, res) => {
    try {
        await RefreshToken.updateMany(
            { userId: req.user.sub, revokedAt: null },
            { $set: { revokedAt: new Date() } }
        );
        clearSessionCookies(res);
        return res.json({ message: 'Todas as sessões foram encerradas' });
    } catch {
        logControllerError('logout-all');
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// ------------------------------------------------------------
// RECUPERAÇÃO E VERIFICAÇÃO: fluxos por token de uso único
// ------------------------------------------------------------
/**
 * Solicitar redefinição sem revelar se o endereço está cadastrado.
 * POST /api/auth/forgot-password; pública + CSRF.
 * Exemplo: { "email": "ana@example.test" }.
 * @param {import('express').Request} req E-mail validado.
 * @param {import('express').Response} res Sempre retorna a mesma mensagem pública.
 * @returns {Promise<import('express').Response>} JSON neutro após tempo mínimo.
 */
exports.forgotPassword = async (req, res) => {
    const startedAt = Date.now();
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            user.resetTokenHash = hashOneTimeToken(resetToken);
            user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
            await user.save();
            const resetUrl = new URL(config.resetPasswordUrl);
            resetUrl.searchParams.set('token', resetToken);
            setImmediate(() => {
                sendEmail(email, resetUrl.toString()).catch(() =>
                    logControllerError('forgot-password-email')
                );
            });
        }
    } catch {
        logControllerError('forgot-password');
    }
    const minimumResponseTimeMs = 350;
    const remainingDelay = minimumResponseTimeMs - (Date.now() - startedAt);
    if (remainingDelay > 0)
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    return res.json({
        message: 'Se o email existir, enviaremos instruções de recuperação',
    });
};

/**
 * Solicitar reenvio neutro de verificação de e-mail quando o recurso está habilitado.
 * POST /api/auth/resend-verification; pública + CSRF.
 * Exemplo: { "email": "ana@example.test" }.
 * @param {import('express').Request} req E-mail validado.
 * @param {import('express').Response} res Resposta neutra sem enumeração.
 * @returns {Promise<import('express').Response>} Sempre retorna a mesma resposta JSON.
 */
exports.resendVerification = async (req, res) => {
    const startedAt = Date.now();
    try {
        if (config.emailVerificationEnabled) {
            const user = await User.findOne({ email: req.body.email });
            if (user && user.emailVerified !== true) {
                const token = crypto.randomBytes(32).toString('hex');
                user.emailVerificationTokenHash = hashOneTimeToken(token);
                user.emailVerificationTokenExpiresAt = new Date(
                    Date.now() +
                        config.emailVerificationTtlHours * 60 * 60 * 1000
                );
                await user.save();
                scheduleVerificationEmail(user.email, token);
            }
        }
    } catch {
        logControllerError('resend-verification');
    }

    const remainingDelay = 350 - (Date.now() - startedAt);
    if (remainingDelay > 0)
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    return res.json({
        message:
            'Se a conta precisar de verificação, enviaremos instruções para o e-mail informado.',
    });
};

/**
 * Consumir token único para marcar o e-mail como verificado.
 * POST /api/auth/verify-email; pública + CSRF.
 * Exemplo: { "token": "<TOKEN_HEXADECIMAL_DE_64_CARACTERES>" }.
 * @param {import('express').Request} req Token de verificação validado.
 * @param {import('express').Response} res Retorna sucesso, token inválido ou 404 desabilitado.
 * @returns {Promise<import('express').Response>} Resposta JSON de verificação.
 */
exports.verifyEmail = async (req, res) => {
    try {
        if (!config.emailVerificationEnabled) {
            return res
                .status(404)
                .json({ error: 'Verificação de e-mail não está habilitada' });
        }
        const tokenHash = hashOneTimeToken(req.body.token);
        const user = await User.findOneAndUpdate(
            {
                emailVerificationTokenHash: tokenHash,
                emailVerificationTokenExpiresAt: { $gt: new Date() },
            },
            {
                $set: { emailVerified: true },
                $unset: {
                    emailVerificationTokenHash: 1,
                    emailVerificationTokenExpiresAt: 1,
                },
            },
            { returnDocument: 'before' }
        ).select('_id');
        if (!user)
            return res
                .status(400)
                .json({ error: 'Token inválido ou expirado' });

        return res.json({
            message: 'E-mail verificado com sucesso. Você já pode entrar.',
        });
    } catch {
        logControllerError('verify-email');
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Redefinir senha consumindo token de uso único e revogando sessões existentes.
 * POST /api/auth/reset-password; pública + CSRF.
 * Exemplo: { "token": "<TOKEN_HEXADECIMAL_DE_64_CARACTERES>", "password": "Nova senha segura 2026!" }.
 * @param {import('express').Request} req Token e senha validados.
 * @param {import('express').Response} res Retorna sucesso, token inválido ou 500.
 * @returns {Promise<void>} Resposta JSON sem retornar campos sensíveis.
 */
exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (
            typeof token !== 'string' ||
            token.length !== 64 ||
            typeof password !== 'string' ||
            password.length < 10 ||
            password.length > 128
        ) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const tokenHash = hashOneTimeToken(token);
        const user = await User.findOneAndUpdate(
            {
                resetTokenHash: tokenHash,
                resetTokenExpiresAt: { $gt: new Date() },
            },
            {
                $set: { password: await bcrypt.hash(password, 12) },
                $unset: {
                    resetTokenHash: 1,
                    resetTokenExpiresAt: 1,
                },
            },
            { returnDocument: 'before' }
        ).select('_id');
        if (!user)
            return res
                .status(400)
                .json({ error: 'Token inválido ou expirado' });
        await RefreshToken.updateMany(
            { userId: user._id, revokedAt: null },
            { $set: { revokedAt: new Date() } }
        );
        logSecurityEvent(req, 'password_reset_completed');
        res.json({ message: 'Senha redefinida com sucesso' });
    } catch (err) {
        logControllerError('reset-password', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// ------------------------------------------------------------
// PERFIL: expõe somente os dados públicos do usuário autenticado
// ------------------------------------------------------------
/**
 * Retornar o perfil público associado às claims autenticadas.
 * GET /api/auth/profile; exige sessão.
 * @param {import('express').Request} req Claims do access token validado.
 * @param {import('express').Response} res Retorna perfil, 404 se removido ou 500.
 * @returns {Promise<void>} JSON contendo nome, e-mail e data de criação.
 */
exports.profile = async (req, res) => {
    try {
        const user = await User.findById(req.user.sub).select(
            'name email createdAt'
        );
        if (!user)
            return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ user });
    } catch (err) {
        logControllerError('profile', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
