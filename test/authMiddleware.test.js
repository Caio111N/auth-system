/**
 * ============================================================
 * ARQUIVO: authMiddleware.test.js
 * FUNÇÃO: Verifica aceitação de access JWT e rejeição de tokens de outro propósito.
 * USADO POR: `npm test` na validação isolada do middleware de autenticação.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS E AMBIENTE: runner, assertions, JWT e middleware testado
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests-123';
process.env.MONGODB_URI =
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auth-system-test';
const authMiddleware = require('../src/middlewares/authMiddleware');

/**
 * Executar middleware com requisição/resposta mínima e capturar resultado.
 * @param {string} [token] JWT no formato Authorization Bearer.
 * @returns {Promise<object>} Status e claims do usuário quando aceito.
 */
const runMiddleware = (token) =>
    new Promise((resolve) => {
        const req = {
            headers: token ? { authorization: `Bearer ${token}` } : {},
        };
        const response = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ statusCode: this.statusCode, body });
            },
        };
        authMiddleware(req, response, () =>
            resolve({ statusCode: 200, user: req.user })
        );
    });

// ------------------------------------------------------------
// CENÁRIOS: token de acesso válido e tokens ausentes/de outro tipo
// ------------------------------------------------------------
/**
 * O middleware deve continuar a cadeia com claims de access válidas.
 */
test('aceita somente access tokens válidos', async () => {
    const token = jwt.sign(
        { sub: 'user-id', type: 'access' },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h',
            algorithm: 'HS256',
            issuer: 'auth-system',
            audience: 'auth-client',
        }
    );
    const result = await runMiddleware(token);
    assert.equal(result.statusCode, 200);
    assert.equal(result.user.sub, 'user-id');
});

/**
 * Tokens de recuperação e credenciais sem prefixo Bearer devem retornar 401.
 */
test('rejeita tokens de recuperação ou sem Bearer', async () => {
    const resetToken = jwt.sign(
        { sub: 'user-id', type: 'reset' },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h',
            algorithm: 'HS256',
            issuer: 'auth-system',
            audience: 'auth-client',
        }
    );
    assert.equal((await runMiddleware(resetToken)).statusCode, 401);
    assert.equal((await runMiddleware()).statusCode, 401);
});
