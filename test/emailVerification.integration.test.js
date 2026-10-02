/**
 * ============================================================
 * ARQUIVO: emailVerification.integration.test.js
 * FUNÇÃO: Verifica reenvio, substituição de token, resposta neutra e limite de tentativas.
 * USADO POR: `npm test` com MongoDB Memory Server e SMTP desativado.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS E CONFIGURAÇÃO: força verificação ativa e evita envio externo durante os testes
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'email-test-secret-with-more-than-32-characters';
process.env.RESET_PASSWORD_URL = 'http://localhost:3000/reset-password';
process.env.EMAIL_VERIFICATION_ENABLED = 'true';
process.env.EMAIL_VERIFICATION_RATE_LIMIT_MAX = '2';
process.env.TRUST_PROXY = 'false';
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.MAIL_FROM = '';

const { before, after, beforeEach } = test;
let mongoServer;
let app;
let User;
let RateLimitCounter;

/**
 * Criar MongoDB em memória e importar a aplicação com verificação habilitada.
 * @returns {Promise<void>} Resolve após conexão e índices prontos.
 */
before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    app = require('../src/app');
    User = require('../src/models/User');
    RateLimitCounter = require('../src/models/RateLimitCounter');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    await Promise.all([User.init(), RateLimitCounter.init()]);
});

/**
 * Encerrar banco e instância MongoDB após os cenários.
 * @returns {Promise<void>} Libera recursos de integração.
 */
after(async () => {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    await mongoServer?.stop();
});

/**
 * Limpar usuários e contadores para cada cenário independente.
 * @returns {Promise<void>} Resolve após esvaziar as coleções usadas.
 */
beforeEach(async () => {
    await Promise.all([User.deleteMany({}), RateLimitCounter.deleteMany({})]);
});

/**
 * Preparar cliente Supertest e token CSRF emitido pela página pública.
 * @returns {Promise<{agent: import('supertest').Agent, csrfToken: string}>} Cliente de sessão HTTP.
 */
const createClient = async () => {
    const agent = supertest.agent(app);
    const page = await agent.get('/login.html');
    const cookie = page.headers['set-cookie'].find((value) =>
        value.startsWith('csrfToken=')
    );
    assert.ok(cookie);
    return {
        agent,
        csrfToken: cookie.split(';', 1)[0].slice('csrfToken='.length),
    };
};

/**
 * Enviar POST autenticado por CSRF à API de autenticação.
 * @param {object} client Cliente retornado por createClient.
 * @param {string} route Caminho relativo ao prefixo `/api/auth`.
 * @param {object} body Corpo JSON.
 * @returns {import('supertest').Test} Requisição encadeável.
 */
const post = (client, route, body) =>
    client.agent
        .post(`/api/auth/${route}`)
        .set('X-CSRF-Token', client.csrfToken)
        .send(body);

/**
 * Capturar links gerados pelo fallback local sem imprimir tokens no output de teste.
 * @param {() => Promise<void>} operation Ação que agenda e emite o e-mail local.
 * @returns {Promise<string[]>} Tokens encontrados nos links capturados em memória.
 */
const captureVerificationTokens = async (operation) => {
    const originalInfo = console.info;
    const output = [];
    console.info = (...values) => output.push(values.join(' '));
    try {
        await operation();
        await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
        console.info = originalInfo;
    }
    return [...output.join('\n').matchAll(/[?&]token=([a-f0-9]{64})/g)].map(
        (match) => match[1]
    );
};

// ------------------------------------------------------------
// CENÁRIOS: substituição do token, neutralidade contra enumeração e rate limit
// ------------------------------------------------------------
/**
 * Novo reenvio invalida o token anterior, guarda apenas hash e mantém resposta neutra.
 */
test('reenvio substitui token anterior e não enumera contas', async () => {
    const client = await createClient();
    const firstTokenOutput = await captureVerificationTokens(async () => {
        const registration = await post(client, 'register', {
            name: 'Conta de Teste',
            email: 'verify@example.test',
            password: 'Uma senha forte de teste 2026!',
        });
        assert.equal(registration.status, 202);
    });
    const firstToken = firstTokenOutput[0];
    assert.ok(firstToken);

    let existingResponse;
    const resendTokens = await captureVerificationTokens(async () => {
        existingResponse = await post(client, 'resend-verification', {
            email: 'verify@example.test',
        });
        assert.equal(existingResponse.status, 200);
    });
    const newestToken = resendTokens[0];
    assert.ok(newestToken);
    assert.notEqual(newestToken, firstToken);

    const user = await User.findOne({ email: 'verify@example.test' }).select(
        '+emailVerificationTokenHash'
    );
    const newestHash = crypto
        .createHash('sha256')
        .update(newestToken)
        .digest('hex');
    assert.equal(user.emailVerificationTokenHash, newestHash);
    assert.notEqual(user.emailVerificationTokenHash, newestToken);

    const expiredLink = await post(client, 'verify-email', {
        token: firstToken,
    });
    assert.equal(expiredLink.status, 400);
    const currentLink = await post(client, 'verify-email', {
        token: newestToken,
    });
    assert.equal(currentLink.status, 200);

    const unknownClient = await createClient();
    const unknown = await post(unknownClient, 'resend-verification', {
        email: 'absent@example.test',
    });
    assert.equal(unknown.status, existingResponse.status);
    assert.deepEqual(unknown.body, existingResponse.body);
});

/**
 * Reenvios acima do limite configurado retornam 429 com Retry-After.
 */
test('limita tentativas de reenvio por IP e e-mail', async () => {
    const client = await createClient();
    await captureVerificationTokens(async () => {
        const registration = await post(client, 'register', {
            name: 'Conta de Limite',
            email: 'limited@example.test',
            password: 'Outra senha forte de teste 2026!',
        });
        assert.equal(registration.status, 202);
    });

    let first;
    let second;
    let third;
    await captureVerificationTokens(async () => {
        first = await post(client, 'resend-verification', {
            email: 'limited@example.test',
        });
        second = await post(client, 'resend-verification', {
            email: 'limited@example.test',
        });
        third = await post(client, 'resend-verification', {
            email: 'limited@example.test',
        });
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.match(third.headers['retry-after'], /^\d+$/);
});
