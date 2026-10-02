/**
 * ============================================================
 * ARQUIVO: logger.js
 * FUNÇÃO: Configura logger estruturado com nível por ambiente e redaction de segredos.
 * USADO POR: servidor, middleware HTTP, controllers e tratamento de erros.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: logger Pino
// ------------------------------------------------------------
const pino = require('pino');

// ------------------------------------------------------------
// CONFIGURAÇÃO: define nível de log e remove dados de autenticação
// ------------------------------------------------------------
module.exports = pino({
    level:
        process.env.LOG_LEVEL ||
        (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    redact: {
        paths: [
            'password',
            'token',
            'resetToken',
            'refreshToken',
            'authorization',
            'cookie',
            'set-cookie',
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.x-csrf-token',
            'res.headers.set-cookie',
        ],
        censor: '[REDACTED]',
    },
});
