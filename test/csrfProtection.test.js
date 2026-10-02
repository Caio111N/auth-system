/**
 * ============================================================
 * ARQUIVO: csrfProtection.test.js
 * FUNÇÃO: Testa o middleware double-submit sem iniciar o servidor HTTP.
 * USADO POR: `npm test` na validação CSRF unitária.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: runner, assertions e middleware CSRF sob teste
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const csrfProtection = require('../src/middlewares/csrfProtection');

/**
 * Montar resposta HTTP mínima e executar middleware para um caso CSRF.
 * @param {object} [options] Método, caminho, cookie e header de teste.
 * @returns {object} Resultado, corpo e status observados.
 */
const runMiddleware = ({
    method = 'POST',
    path = '/api/auth/logout',
    cookie,
    header,
} = {}) => {
    let statusCode = 200;
    let responseBody;
    let nextCalled = false;
    const response = {
        cookieName: undefined,
        cookieValue: undefined,
        cookie(name, value) {
            this.cookieName = name;
            this.cookieValue = value;
            return this;
        },
        status(code) {
            statusCode = code;
            return this;
        },
        json(body) {
            responseBody = body;
            return this;
        },
    };
    const request = {
        method,
        path,
        headers: { cookie },
        get(name) {
            return name === 'X-CSRF-Token' ? header : undefined;
        },
    };

    csrfProtection(false)(request, response, () => {
        nextCalled = true;
    });
    return { nextCalled, response, responseBody, statusCode };
};

// ------------------------------------------------------------
// CENÁRIOS: escrita sem token, token correspondente e cookie inicial
// ------------------------------------------------------------
/**
 * Escrita sem double-submit correspondente deve receber 403.
 */
test('bloqueia requisições de escrita sem double-submit token', () => {
    const result = runMiddleware();
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.responseBody, { error: 'Validação CSRF inválida' });
    assert.equal(result.nextCalled, false);
});

/**
 * Cookie e header CSRF iguais devem continuar para a rota.
 */
test('aceita requisição de escrita com cookie e header CSRF correspondentes', () => {
    const token = 'a'.repeat(64);
    const result = runMiddleware({
        cookie: `csrfToken=${token}`,
        header: token,
    });
    assert.equal(result.nextCalled, true);
});

/**
 * Navegação segura deve inicializar cookie CSRF para os próximos envios.
 */
test('cria cookie CSRF em navegação segura', () => {
    const result = runMiddleware({ method: 'GET', path: '/' });
    assert.equal(result.nextCalled, true);
    assert.equal(result.response.cookieName, 'csrfToken');
    assert.match(result.response.cookieValue, /^[a-f0-9]{64}$/);
});
