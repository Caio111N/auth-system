/**
 * ============================================================
 * ARQUIVO: authMiddleware.js
 * FUNÇÃO: Valida o access JWT e confirma que a sessão associada segue ativa.
 * USADO POR: rotas que exigem usuário autenticado.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: validação JWT, configuração, sessões e leitura de cookies
// ------------------------------------------------------------
const jwt = require('jsonwebtoken');
const config = require('../config');
const RefreshToken = require('../models/RefreshToken');
const { parseCookies } = require('./csrfProtection');

/**
 * Autenticar a requisição usando access JWT do header ou cookie.
 * Consulta a sessão no banco para que revogações tenham efeito imediato.
 * @param {import('express').Request} req Requisição HTTP.
 * @param {import('express').Response} res Resposta HTTP 401 em caso de falha.
 * @param {import('express').NextFunction} next Continua a rota ou encaminha erro interno.
 * @returns {Promise<void>} Acrescenta claims validadas em `req.user`.
 * @throws {Error} Encaminha erros de persistência ao middleware global.
 */
module.exports = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token =
        authorization && authorization.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : parseCookies(req.headers.cookie).accessToken;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    try {
        const decoded = jwt.verify(token, config.jwtSecret, {
            algorithms: ['HS256'],
            issuer: 'auth-system',
            audience: 'auth-client',
        });
        if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
            return res
                .status(401)
                .json({ error: 'Token inválido ou expirado' });
        }
        if (typeof decoded.sid === 'string') {
            const activeSession = await RefreshToken.exists({
                userId: decoded.sub,
                familyId: decoded.sid,
                revokedAt: null,
                expiresAt: { $gt: new Date() },
            });
            if (!activeSession) {
                return res
                    .status(401)
                    .json({ error: 'Sessão inválida ou expirada' });
            }
        }
        req.user = decoded;
        next();
    } catch (err) {
        if (
            err.name !== 'JsonWebTokenError' &&
            err.name !== 'TokenExpiredError' &&
            err.name !== 'NotBeforeError'
        )
            return next(err);
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};
