/**
 * ============================================================
 * ARQUIVO: auth.integration.test.js
 * FUNÇÃO: Exercita endpoints HTTP reais contra MongoDB isolado em memória.
 * USADO POR: `npm test`; prepara MongoDB Memory Server, app Express e cliente Supertest.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: runner, assertions, client HTTP e banco isolado de integração
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'integration-test-secret-with-more-than-32-characters';
process.env.RESET_PASSWORD_URL = 'http://localhost:3000/reset-password';
process.env.EMAIL_VERIFICATION_ENABLED = 'false';
process.env.TRUST_PROXY = 'true';
process.env.CORS_ORIGINS = 'http://frontend.test';
process.env.REGISTER_RATE_LIMIT_MAX = '2';
process.env.LOGIN_RATE_LIMIT_MAX = '100';
process.env.LOGIN_EMAIL_RATE_LIMIT_MAX = '100';
process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX = '100';
process.env.RESET_PASSWORD_RATE_LIMIT_MAX = '100';
process.env.REFRESH_RATE_LIMIT_MAX = '100';
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '3';

// ------------------------------------------------------------
// AMBIENTE E FIXTURES: configura valores de teste sem depender de segredos locais
// ------------------------------------------------------------
const testPassword = 'Uma senha segura 2026!';
const { before, after, beforeEach } = test;
let mongoServer;
let app;
let User;
let RefreshToken;
let RateLimitCounter;
let nextClientId = 1;

/**
 * Subir MongoDB isolado e conectar os modelos antes dos cenários HTTP.
 * @returns {Promise<void>} Resolve depois que índices e conexão estão prontos.
 */
before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    app = require('../src/app');
    User = require('../src/models/User');
    RefreshToken = require('../src/models/RefreshToken');
    RateLimitCounter = require('../src/models/RateLimitCounter');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    await Promise.all([
        User.init(),
        RefreshToken.init(),
        RateLimitCounter.init(),
    ]);
});

/**
 * Fechar conexão e processo MongoDB ao terminar o arquivo de integração.
 * @returns {Promise<void>} Libera os recursos do teste.
 */
after(async () => {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
});

/**
 * Isolar cada cenário removendo usuários, sessões e contadores anteriores.
 * @returns {Promise<void>} Resolve quando as coleções estão limpas.
 */
beforeEach(async () => {
    await Promise.all([
        User.deleteMany({}),
        RefreshToken.deleteMany({}),
        RateLimitCounter.deleteMany({}),
    ]);
});

/**
 * Gerar IP de documentação distinto para evitar compartilhar limites entre clientes.
 * @returns {string} Endereço IPv4 reservado para exemplos e testes.
 */
const nextIp = () => `198.51.100.${(nextClientId++ % 250) + 1}`;

/**
 * Criar cliente persistente com cookie CSRF obtido por navegação inicial.
 * @param {string} [ip] IP usado nas chamadas e limites do cliente.
 * @returns {Promise<{agent: import('supertest').Agent, csrfToken: string, ip: string}>} Cliente configurado.
 * @throws {AssertionError} Se a aplicação não emitir o cookie CSRF esperado.
 */
const createClient = async (ip = nextIp()) => {
    const agent = supertest.agent(app);
    const page = await agent.get('/login.html').set('X-Forwarded-For', ip);
    const csrfCookie = page.headers['set-cookie'].find((cookie) =>
        cookie.startsWith('csrfToken=')
    );
    assert.ok(csrfCookie, 'A aplicação deve inicializar o cookie CSRF.');
    return {
        agent,
        csrfToken: csrfCookie.split(';', 1)[0].slice('csrfToken='.length),
        ip,
    };
};

/**
 * Enviar POST de autenticação com CSRF e IP do cliente.
 * @param {object} client Cliente criado por createClient.
 * @param {string} route Segmento da rota de autenticação.
 * @param {object} [body] Corpo JSON de teste.
 * @returns {import('supertest').Test} Requisição Supertest encadeável.
 */
const post = (client, route, body = {}) =>
    client.agent
        .post(`/api/auth/${route}`)
        .set('X-Forwarded-For', client.ip)
        .set('X-CSRF-Token', client.csrfToken)
        .send(body);

/**
 * Cadastrar fixture de usuário por meio da API, sem bypassar validações.
 * @param {object} client Cliente HTTP com CSRF.
 * @param {string} email E-mail fictício exclusivo do caso.
 * @param {string} [password] Senha fictícia válida.
 * @returns {import('supertest').Test} Requisição de cadastro.
 */
const registerUser = async (client, email, password = testPassword) =>
    post(client, 'register', {
        name: 'Pessoa de Teste',
        email,
        password,
    });

/**
 * Autenticar fixture usando endpoint e cookies emitidos pela aplicação.
 * @param {object} client Cliente HTTP com CSRF.
 * @param {string} email E-mail da conta de teste.
 * @param {string} [password] Senha da conta.
 * @param {boolean} [rememberMe] Preferência de duração da sessão.
 * @returns {import('supertest').Test} Requisição de login.
 */
const loginUser = (
    client,
    email,
    password = testPassword,
    rememberMe = false
) =>
    post(client, 'login', {
        email,
        password,
        rememberMe,
    });

/**
 * Criar conta e abrir sessão, verificando os status de ambas as etapas.
 * @param {object} client Cliente HTTP com CSRF.
 * @param {string} email E-mail exclusivo do cenário.
 * @param {boolean} [rememberMe] Preferência de sessão persistente.
 * @returns {Promise<object>} Resposta de login com cabeçalhos de cookie.
 */
const registerAndLogin = async (client, email, rememberMe = false) => {
    const registration = await registerUser(client, email);
    assert.equal(registration.status, 202);
    const login = await loginUser(client, email, testPassword, rememberMe);
    assert.equal(login.status, 200);
    return login;
};

/**
 * Extrair o valor de um cookie Set-Cookie de resposta HTTP.
 * @param {Record<string, string[]>} headers Cabeçalhos de resposta.
 * @param {string} name Nome do cookie solicitado.
 * @returns {string|undefined} Valor do cookie ou undefined quando ausente.
 */
const readCookie = (headers, name) => {
    const cookie = headers['set-cookie']?.find((value) =>
        value.startsWith(`${name}=`)
    );
    return cookie?.split(';', 1)[0].slice(name.length + 1);
};

// ------------------------------------------------------------
// CENÁRIOS DE INTEGRAÇÃO: respostas, sessão, recuperação e segurança
// ------------------------------------------------------------
/**
 * Confirmar health, headers, allowlist CORS, 404 e erros de body padronizados.
 * @returns {Promise<void>} Falha se status, header ou formato JSON diferirem do contrato.
 */
test('health, headers de segurança, CORS e 404 da API', async () => {
    const health = await supertest(app).get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok', database: 'connected' });
    assert.match(health.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    assert.match(
        health.headers['content-security-policy'],
        /script-src 'self'/
    );
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(
        health.headers['referrer-policy'],
        'strict-origin-when-cross-origin'
    );
    assert.equal(health.headers['cross-origin-opener-policy'], 'same-origin');
    assert.match(health.headers['permissions-policy'], /camera=\(\)/);
    assert.equal(health.headers['x-powered-by'], undefined);

    const corsResponse = await supertest(app)
        .options('/api/auth/login')
        .set('Origin', 'http://frontend.test')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
    assert.equal(
        corsResponse.headers['access-control-allow-origin'],
        'http://frontend.test'
    );
    assert.equal(
        corsResponse.headers['access-control-allow-credentials'],
        'true'
    );

    const notFound = await supertest(app).get('/api/not-a-route');
    assert.equal(notFound.status, 404);
    assert.deepEqual(notFound.body, { error: 'Rota da API não encontrada' });

    const malformedJson = await supertest(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"email":');
    assert.equal(malformedJson.status, 400);
    assert.deepEqual(malformedJson.body, { error: 'Requisição inválida' });

    const oversizedBody = await supertest(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send(`{"data":"${'x'.repeat(11 * 1024)}"}`);
    assert.equal(oversizedBody.status, 413);
    assert.deepEqual(oversizedBody.body, {
        error: 'Corpo da requisição muito grande',
    });

    const unsafeBody = await supertest(app)
        .post('/api/auth/login')
        .set('X-CSRF-Token', 'irrelevante')
        .send({
            email: { $ne: null },
            password: 'Senha segura 2026!',
        });
    assert.equal(unsafeBody.status, 400);
    assert.deepEqual(unsafeBody.body, { error: 'Parâmetros inválidos' });

    const repeatedQuery = await supertest(app).get(
        '/api/not-a-route?modo=um&modo=dois'
    );
    assert.equal(repeatedQuery.status, 400);
    assert.deepEqual(repeatedQuery.body, {
        error: 'Parâmetros repetidos não são aceitos',
    });

    const unsafeQuery = await supertest(app).get('/api/not-a-route?%24ne=null');
    assert.equal(unsafeQuery.status, 400);
    assert.deepEqual(unsafeQuery.body, { error: 'Parâmetros inválidos' });
});

/**
 * Confirmar normalização de e-mail, cadastro idempotente e validação de entrada.
 * @returns {Promise<void>} Confirma respostas neutras para duplicidade e 400 para dados inválidos.
 */
test('cadastro normaliza e-mail, evita duplicidade enumerável e valida entrada', async () => {
    const firstClient = await createClient();
    const first = await registerUser(firstClient, '  Pessoa@Example.Test  ');
    const duplicateClient = await createClient();
    const duplicate = await registerUser(
        duplicateClient,
        'pessoa@example.test'
    );
    assert.equal(first.status, 202);
    assert.deepEqual(duplicate.body, first.body);
    assert.equal(await User.countDocuments({}), 1);
    assert.equal(
        (await User.findOne({ email: 'pessoa@example.test' })).email,
        'pessoa@example.test'
    );

    const emailLimitedClient = await createClient();
    const emailLimited = await registerUser(
        emailLimitedClient,
        'pessoa@example.test'
    );
    assert.equal(emailLimited.status, 429);
    assert.match(emailLimited.headers['retry-after'], /^\d+$/);

    const invalidClient = await createClient();
    const invalid = await registerUser(
        invalidClient,
        'email-invalido',
        'senha12345'
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'Dados inválidos');
});

/**
 * Confirmar cookies HttpOnly, leitura do perfil e proteção do dashboard.
 * @returns {Promise<void>} Confirma acesso com sessão e rejeição/redirecionamento sem sessão.
 */
test('login emite cookies HttpOnly, carrega perfil e protege o dashboard', async () => {
    const client = await createClient();
    const login = await registerAndLogin(client, 'profile@example.test', true);

    const accessCookie = login.headers['set-cookie'].find((cookie) =>
        cookie.startsWith('accessToken=')
    );
    const refreshCookie = login.headers['set-cookie'].find((cookie) =>
        cookie.startsWith('refreshToken=')
    );
    assert.match(accessCookie, /HttpOnly/i);
    assert.match(accessCookie, /SameSite=Lax/i);
    assert.match(refreshCookie, /HttpOnly/i);

    const profile = await client.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', client.ip);
    assert.equal(profile.status, 200);
    assert.deepEqual(profile.body.user, {
        _id: profile.body.user._id,
        name: 'Pessoa de Teste',
        email: 'profile@example.test',
        createdAt: profile.body.user.createdAt,
    });
    const serializedProfile = JSON.stringify(profile.body);
    for (const sensitiveField of [
        'password',
        'resetTokenHash',
        'resetTokenExpiresAt',
        'emailVerificationTokenHash',
        'emailVerificationTokenExpiresAt',
        'loginFailedAttempts',
        'loginBlockedUntil',
    ]) {
        assert.equal(
            serializedProfile.includes(sensitiveField),
            false,
            `A resposta não deve conter ${sensitiveField}.`
        );
    }
    assert.equal(JSON.stringify(login.body).includes('token'), false);

    const dashboard = await client.agent
        .get('/dashboard.html')
        .set('X-Forwarded-For', client.ip);
    assert.equal(dashboard.status, 200);

    const anonymous = await createClient();
    const noProfile = await anonymous.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', anonymous.ip);
    assert.equal(noProfile.status, 401);
    const protectedDashboard = await anonymous.agent
        .get('/dashboard.html')
        .set('X-Forwarded-For', anonymous.ip);
    assert.equal(protectedDashboard.status, 302);
    assert.equal(protectedDashboard.headers.location, '/login.html');
});

/**
 * Confirmar mensagens genéricas e bloqueio após falhas consecutivas.
 * @returns {Promise<void>} Confirma que usuário ausente e senha incorreta não se distinguem.
 */
test('login rejeita senha errada e usuário inexistente com resposta genérica e bloqueia tentativas', async () => {
    const client = await createClient();
    await registerUser(client, 'locked@example.test');

    const wrongPassword = await loginUser(
        client,
        'locked@example.test',
        'Senha incorreta'
    );
    const unknownUser = await loginUser(
        client,
        'missing@example.test',
        'Senha incorreta'
    );
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(unknownUser.body, wrongPassword.body);

    await loginUser(client, 'locked@example.test', 'Senha incorreta');
    const thirdFailure = await loginUser(
        client,
        'locked@example.test',
        'Senha incorreta'
    );
    const blockedCorrectPassword = await loginUser(
        client,
        'locked@example.test'
    );
    assert.equal(thirdFailure.status, 401);
    assert.deepEqual(blockedCorrectPassword.body, thirdFailure.body);
});

/**
 * Confirmar rotação do refresh token e revogação após reutilizar valor antigo.
 * @returns {Promise<void>} Confirma mudança do cookie e invalidade posterior da sessão.
 */
test('refresh rotaciona o token e reutilização revoga a família de sessão', async () => {
    const client = await createClient();
    const login = await registerAndLogin(client, 'rotation@example.test');
    const oldRefreshToken = readCookie(login.headers, 'refreshToken');
    assert.ok(oldRefreshToken);

    const refreshed = await post(client, 'refresh');
    assert.equal(refreshed.status, 200);
    const rotatedToken = readCookie(refreshed.headers, 'refreshToken');
    assert.ok(rotatedToken);
    assert.notEqual(rotatedToken, oldRefreshToken);

    const replay = await supertest(app)
        .post('/api/auth/refresh')
        .set('X-Forwarded-For', client.ip)
        .set(
            'Cookie',
            `csrfToken=${client.csrfToken}; refreshToken=${oldRefreshToken}`
        )
        .set('X-CSRF-Token', client.csrfToken)
        .send({});
    assert.equal(replay.status, 401);

    const profileAfterReplay = await client.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', client.ip);
    assert.equal(profileAfterReplay.status, 401);
});

/**
 * Confirmar revogação da sessão atual e de todas as sessões do usuário.
 * @returns {Promise<void>} Confirma quais clientes mantêm acesso após cada logout.
 */
test('logout e logout-all revogam sessões no servidor', async () => {
    const firstClient = await createClient();
    await registerAndLogin(firstClient, 'logout@example.test');
    const secondClient = await createClient();
    await loginUser(secondClient, 'logout@example.test');

    const loggedOut = await post(firstClient, 'logout');
    assert.equal(loggedOut.status, 200);
    const firstProfile = await firstClient.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', firstClient.ip);
    const secondProfile = await secondClient.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', secondClient.ip);
    assert.equal(firstProfile.status, 401);
    assert.equal(secondProfile.status, 200);

    await loginUser(firstClient, 'logout@example.test');
    const logoutAll = await post(firstClient, 'logout-all');
    assert.equal(logoutAll.status, 200);
    const otherProfile = await secondClient.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', secondClient.ip);
    assert.equal(otherProfile.status, 401);
    const currentProfile = await firstClient.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', firstClient.ip);
    assert.equal(currentProfile.status, 401);
});

/**
 * Confirmar resposta anti-enumeração, token único/expirado e invalidação de sessões.
 * @returns {Promise<void>} Confirma redefinição válida e rejeita token inválido, vencido ou reutilizado.
 */
test('recuperação não enumera contas e redefinição consome token e revoga sessões', async () => {
    const client = await createClient();
    await registerAndLogin(client, 'reset@example.test');

    const originalInfo = console.info;
    const emitted = [];
    console.info = (...values) => emitted.push(values.join(' '));
    let knownAccount;
    let knownResponseDuration;
    try {
        const knownStartedAt = Date.now();
        knownAccount = await post(client, 'forgot-password', {
            email: 'reset@example.test',
        });
        knownResponseDuration = Date.now() - knownStartedAt;
        await new Promise((resolve) => setImmediate(resolve));
    } finally {
        console.info = originalInfo;
    }

    const unknownClient = await createClient();
    const unknownStartedAt = Date.now();
    const unknownAccount = await post(unknownClient, 'forgot-password', {
        email: 'absent@example.test',
    });
    const unknownResponseDuration = Date.now() - unknownStartedAt;
    assert.equal(knownAccount.status, 200);
    assert.deepEqual(knownAccount.body, unknownAccount.body);
    assert.ok(knownResponseDuration >= 340);
    assert.ok(unknownResponseDuration >= 340);
    const resetToken = emitted
        .join('\n')
        .match(/[?&]token=([a-f0-9]{64})/)?.[1];
    assert.ok(
        resetToken,
        'O fluxo de desenvolvimento deve produzir um link de redefinição capturável.'
    );

    const reset = await post(client, 'reset-password', {
        token: resetToken,
        password: 'Nova senha segura 2026!',
    });
    assert.equal(reset.status, 200);
    const invalid = await post(client, 'reset-password', {
        token: 'f'.repeat(64),
        password: 'Outra senha segura 2026!',
    });
    assert.equal(invalid.status, 400);
    const reused = await post(client, 'reset-password', {
        token: resetToken,
        password: 'Outra senha segura 2026!',
    });
    assert.equal(reused.status, 400);
    const oldSession = await client.agent
        .get('/api/auth/profile')
        .set('X-Forwarded-For', client.ip);
    assert.equal(oldSession.status, 401);

    const expiredToken = 'a'.repeat(64);
    const user = await User.findOne({ email: 'reset@example.test' });
    await User.updateOne(
        { _id: user._id },
        {
            $set: {
                resetTokenHash: crypto
                    .createHash('sha256')
                    .update(expiredToken)
                    .digest('hex'),
                resetTokenExpiresAt: new Date(Date.now() - 1000),
            },
        }
    );
    const expired = await post(client, 'reset-password', {
        token: expiredToken,
        password: 'Senha nova e válida 2026!',
    });
    assert.equal(expired.status, 400);
});

/**
 * Confirmar rejeição CSRF e 429 com Retry-After em limite persistente.
 * @returns {Promise<void>} Confirma bloqueio das requisições fora da política.
 */
test('CSRF rejeita POST sem cabeçalho e limitador persistente retorna 429 com Retry-After', async () => {
    const client = await createClient('198.51.100.240');
    const csrfRejected = await client.agent
        .post('/api/auth/register')
        .set('X-Forwarded-For', client.ip)
        .send({});
    assert.equal(csrfRejected.status, 403);

    const sameIp = await createClient('198.51.100.241');
    await post(sameIp, 'register', {});
    await post(sameIp, 'register', {});
    const limited = await post(sameIp, 'register', {});
    assert.equal(limited.status, 429);
    assert.match(limited.headers['retry-after'], /^\d+$/);
});

/**
 * Confirmar status degradado da API e health quando a conexão é interrompida.
 * @returns {Promise<void>} Reconecta o banco de teste ao final para limpeza correta.
 */
test('rotas da API informam 503 e health degradado sem conexão MongoDB', async () => {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    const unavailable = await supertest(app).get('/api/auth/profile');
    assert.equal(unavailable.status, 503);
    assert.deepEqual(unavailable.body, {
        error: 'Serviço temporariamente indisponível',
    });
    const degraded = await supertest(app).get('/health');
    assert.equal(degraded.status, 503);
    assert.deepEqual(degraded.body, {
        status: 'degraded',
        database: 'disconnected',
    });
    await mongoose.connect(process.env.MONGODB_URI);
});
