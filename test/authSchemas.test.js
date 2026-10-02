/**
 * ============================================================
 * ARQUIVO: authSchemas.test.js
 * FUNÇÃO: Verifica normalização de payloads e política de validação Zod.
 * USADO POR: `npm test` nos schemas e middleware de body.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: schemas, middleware e ferramentas do Node Test Runner
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../src/validation/authSchemas');
const validateBody = require('../src/middlewares/validateBody');

// ------------------------------------------------------------
// CENÁRIOS: normalização, senha, strict mode e body sanitizado
// ------------------------------------------------------------
/**
 * Cadastro deve remover espaços do nome e normalizar e-mail.
 */
test('normaliza nome e e-mail no cadastro', () => {
    const result = schemas.register.safeParse({
        name: '  Ana Silva  ',
        email: '  ANA@Example.test ',
        password: 'Uma senha segura 2026',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.name, 'Ana Silva');
    assert.equal(result.data.email, 'ana@example.test');
});

/**
 * Senhas curtas ou comuns devem falhar no cadastro e na redefinição.
 */
test('rejeita senhas curtas ou comuns no cadastro e redefinição', () => {
    const registration = schemas.register.safeParse({
        name: 'Ana',
        email: 'ana@example.test',
        password: 'password123',
    });
    const reset = schemas.resetPassword.safeParse({
        token: 'a'.repeat(64),
        password: 'senha123456',
    });

    assert.equal(registration.success, false);
    assert.equal(reset.success, false);
});

/**
 * Login aplica rememberMe padrão e recusa propriedades extras.
 */
test('aplica defaults de login e rejeita propriedades inesperadas', () => {
    const validLogin = schemas.login.safeParse({
        email: 'ana@example.test',
        password: 'senha existente',
    });
    const invalidLogin = schemas.login.safeParse({
        email: 'ana@example.test',
        password: 'senha existente',
        admin: true,
    });

    assert.equal(validLogin.success, true);
    assert.equal(validLogin.data.rememberMe, false);
    assert.equal(invalidLogin.success, false);
});

/**
 * Middleware deve retornar mensagens em português e substituir o body normalizado.
 */
test('middleware retorna erros de validação em português e substitui body normalizado', () => {
    let nextCalled = false;
    const request = {
        body: { email: '  USER@Example.test ' },
    };
    const response = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };

    validateBody(schemas.email)(request, response, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.deepEqual(request.body, { email: 'user@example.test' });

    validateBody(schemas.email)(
        { body: { email: 'inválido', extra: true } },
        response,
        () => {
            nextCalled = true;
        }
    );
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Dados inválidos');
    assert.ok(
        response.body.details.every((message) => typeof message === 'string')
    );
});
