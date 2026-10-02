/**
 * ============================================================
 * ARQUIVO: rateLimit.test.js
 * FUNÇÃO: Verifica chaves persistentes por escopo e respostas 429 do middleware.
 * USADO POR: `npm test` na validação isolada do rate limit.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: runner, modelo persistente e middleware de limite
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const RateLimitCounter = require('../src/models/RateLimitCounter');
const rateLimit = require('../src/middlewares/rateLimit');

/**
 * Executar middleware com requisição de login sintética.
 * @param {import('express').RequestHandler} middleware Limiter a exercitar.
 * @returns {Promise<object>} Indica avanço e resposta simulada.
 */
const runMiddleware = async (middleware) => {
    const response = {
        headers: {},
        statusCode: 200,
        body: undefined,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    let nextCalled = false;
    const request = {
        baseUrl: '/api/auth',
        path: '/login',
        ip: '203.0.113.5',
        body: { email: '  USER@example.test ' },
        socket: { remoteAddress: '127.0.0.1' },
    };

    await middleware(request, response, () => {
        nextCalled = true;
    });
    return { nextCalled, response };
};

// ------------------------------------------------------------
// CENÁRIOS: chaves separadas de IP/e-mail e limite Retry-After
// ------------------------------------------------------------
/**
 * Requisição abaixo dos limites incrementa contadores de IP e e-mail distintos.
 */
test('aplica limites persistentes separados por IP e e-mail', async () => {
    const originalFindOneAndUpdate = RateLimitCounter.findOneAndUpdate;
    const keys = [];
    RateLimitCounter.findOneAndUpdate = async (filter) => {
        keys.push(filter.keyHash);
        return { count: 1 };
    };

    try {
        const result = await runMiddleware(rateLimit({ max: 5, emailMax: 3 }));
        assert.equal(keys.length, 2);
        assert.notEqual(keys[0], keys[1]);
        assert.equal(result.nextCalled, true);
        assert.equal(result.response.statusCode, 200);
    } finally {
        RateLimitCounter.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

/**
 * Excesso de tentativas deve responder 429 com Retry-After numérico.
 */
test('responde 429 com Retry-After ao exceder o limite', async () => {
    const originalFindOneAndUpdate = RateLimitCounter.findOneAndUpdate;
    RateLimitCounter.findOneAndUpdate = async () => ({ count: 2 });

    try {
        const result = await runMiddleware(rateLimit({ max: 1 }));
        assert.equal(result.nextCalled, false);
        assert.equal(result.response.statusCode, 429);
        assert.match(result.response.headers['Retry-After'], /^\d+$/);
        assert.deepEqual(result.response.body, {
            error: 'Muitas tentativas. Tente novamente mais tarde.',
        });
    } finally {
        RateLimitCounter.findOneAndUpdate = originalFindOneAndUpdate;
    }
});
