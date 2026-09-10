const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmails');
const mongoose = require('mongoose');

const databaseUnavailable = (res) => {
    if (mongoose.connection.readyState === 1) return false;
    res.status(503).json({ error: 'Banco de dados indisponível. Verifique a configuração do MongoDB.' });
    return true;
};

const logControllerError = (operation, error) => {
    console.error(`[auth:${operation}] ${error.message}`);
    if (process.env.NODE_ENV !== 'production') console.error(error.stack);
};

const ACCESS_TOKEN_OPTIONS = {
    expiresIn: '15m',
    algorithm: 'HS256',
    issuer: 'auth-system',
    audience: 'auth-client',
};

const generateToken = (user) => jwt.sign(
    { sub: user._id.toString(), type: 'access' },
    process.env.JWT_SECRET,
    ACCESS_TOKEN_OPTIONS
);

const isValidEmail = (email) => typeof email === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && email.length <= 254;

const validateCredentials = ({ name, email, password }, includeName = false) => {
    if ((includeName && (typeof name !== 'string' || name.trim().length < 2))
        || !isValidEmail(email)
        || typeof password !== 'string'
        || password.length < 8
        || password.length > 128) {
        return 'Dados inválidos';
    }
    return null;
};

// Cadastro
exports.register = async (req, res) => {
    try {
        if (databaseUnavailable(res)) return;
        const { name, email, password } = req.body;
        const validationError = validateCredentials({ name, email, password }, true);
        if (validationError) return res.status(400).json({ error: validationError });
        const user = new User({ name: name.trim(), email: email.toLowerCase(), password });
        await user.save();
        res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (err) {
        logControllerError('register', err);
        if (err.code === 11000) return res.status(409).json({ error: 'Não foi possível concluir o cadastro' });
        res.status(500).json({
            error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : `Erro no cadastro: ${err.message}`,
        });
    }
};

// Login
exports.login = async (req, res) => {
    try {
        if (databaseUnavailable(res)) return;
        const { email, password } = req.body;
        if (!isValidEmail(email) || typeof password !== 'string') {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Credenciais inválidas' });

        const token = generateToken(user);
        res.json({ token });
    } catch (err) {
        logControllerError('login', err);
        res.status(500).json({
            error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : `Erro no login: ${err.message}`,
        });
    }
};

// Solicita recuperação sem revelar se a conta existe.
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (isValidEmail(email)) {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (user) {
                const resetToken = crypto.randomBytes(32).toString('hex');
                user.resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
                user.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
                await user.save();
                const resetBaseUrl = process.env.RESET_PASSWORD_URL || 'https://example.invalid/reset-password';
                await sendEmail(email, `${resetBaseUrl}?token=${resetToken}`);
            }
        }
        res.json({ message: 'Se o email existir, enviaremos instruções de recuperação' });
    } catch (err) {
        logControllerError('forgot-password', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (typeof token !== 'string' || token.length !== 64
            || typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetTokenHash: tokenHash,
            resetTokenExpiresAt: { $gt: new Date() },
        }).select('+resetTokenHash +resetTokenExpiresAt');
        if (!user) return res.status(400).json({ error: 'Token inválido ou expirado' });
        user.password = password;
        user.resetTokenHash = undefined;
        user.resetTokenExpiresAt = undefined;
        await user.save();
        res.json({ message: 'Senha redefinida com sucesso' });
    } catch (err) {
        logControllerError('reset-password', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

exports.profile = async (req, res) => {
    try {
        const user = await User.findById(req.user.sub).select('name email createdAt');
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json({ user });
    } catch (err) {
        logControllerError('profile', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
