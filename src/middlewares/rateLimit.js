/**
 * ============================================================
 * ARQUIVO: rateLimit.js
 * FUNÇÃO: Conta tentativas persistentes por IP e, quando habilitado, por e-mail.
 * USADO POR: rotas de autenticação configuradas com limites por operação.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: HMAC protege identificadores e MongoDB persiste os contadores
// ------------------------------------------------------------
const crypto = require('crypto');
const RateLimitCounter = require('../models/RateLimitCounter');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Criar identificador HMAC para um escopo e valor de rate limit.
 * Evita guardar IPs e e-mails em texto claro na coleção de contadores.
 * @param {string} scope Caminho da rota e tipo do identificador.
 * @param {string} value IP ou e-mail normalizado.
 * @returns {string} Hash hexadecimal determinístico para a janela.
 */
const createKeyHash = (scope, value) =>
    crypto
        .createHmac('sha256', config.jwtSecret)
        .update(`${scope}:${value}`)
        .digest('hex');

/**
 * Incrementar contador de forma atômica e recuperar colisão de criação concorrente.
 * @param {string} keyHash Hash do escopo e identificador.
 * @param {Date} windowStart Início da janela atual.
 * @param {Date} expiresAt Expiração TTL do contador.
 * @returns {Promise<object>} Contador atualizado.
 * @throws {Error} Propaga falhas de banco diferentes de índice duplicado.
 */
const incrementCounter = async (keyHash, windowStart, expiresAt) => {
    const filter = { keyHash, windowStart };
    try {
        return await RateLimitCounter.findOneAndUpdate(
            filter,
            {
                $inc: { count: 1 },
                $setOnInsert: { expiresAt },
            },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
        return RateLimitCounter.findOneAndUpdate(
            filter,
            { $inc: { count: 1 } },
            { returnDocument: 'after' }
        );
    }
};

/**
 * Criar middleware de limite persistente por IP e, opcionalmente, e-mail.
 * Devolve 429 com Retry-After quando qualquer contador ultrapassa o limite.
 * @param {{windowMs?: number, max?: number, emailMax?: number, tokenMax?: number}} [options] Limites da rota.
 * @returns {import('express').RequestHandler} Middleware de rate limit.
 */
module.exports =
    ({
        windowMs = config.rateLimitWindowMs,
        max = 5,
        emailMax,
        tokenMax,
    } = {}) =>
    async (req, res, next) => {
        const now = Date.now();
        const windowStartMs = Math.floor(now / windowMs) * windowMs;
        const windowStart = new Date(windowStartMs);
        const expiresAt = new Date(windowStartMs + windowMs * 2);
        const sources = [
            {
                scope: 'ip',
                value: req.ip || req.socket?.remoteAddress || 'unknown',
                max,
            },
        ];

        if (emailMax !== undefined && typeof req.body?.email === 'string') {
            const email = req.body.email.trim().toLowerCase().slice(0, 254);
            if (email)
                sources.push({ scope: 'email', value: email, max: emailMax });
        }
        if (tokenMax !== undefined && typeof req.body?.token === 'string') {
            sources.push({
                scope: 'token',
                value: req.body.token,
                max: tokenMax,
            });
        }

        try {
            const counters = await Promise.all(
                sources.map((source) =>
                    incrementCounter(
                        createKeyHash(
                            `${req.baseUrl}${req.path}:${source.scope}`,
                            source.value
                        ),
                        windowStart,
                        expiresAt
                    )
                )
            );
            const limitedCounter = counters
                .map((counter, index) => ({ counter, source: sources[index] }))
                .find(({ counter, source }) => counter.count > source.max);

            if (!limitedCounter) return next();

            logger.warn(
                { event: 'rate_limit_exceeded', requestId: req.id },
                'Limite de requisições excedido.'
            );
            const retryAfter = Math.max(
                1,
                Math.ceil((windowStartMs + windowMs - now) / 1000)
            );
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Muitas tentativas. Tente novamente mais tarde.',
            });
        } catch (error) {
            return next(error);
        }
    };

// ------------------------------------------------------------
// EXPORTS AUXILIARES: permite testes diretos da chave HMAC
// ------------------------------------------------------------
module.exports.createKeyHash = createKeyHash;
