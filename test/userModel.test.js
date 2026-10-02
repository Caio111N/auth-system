/**
 * ============================================================
 * ARQUIVO: userModel.test.js
 * FUNÇÃO: Inspeciona constraints e campos sensíveis dos modelos Mongoose.
 * USADO POR: `npm test` nos contratos de persistência.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: runner, assertions e modelos inspecionados
// ------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const RefreshToken = require('../src/models/RefreshToken');

// ------------------------------------------------------------
// CENÁRIOS: índices únicos/TTL e exclusão de campos secretos por padrão
// ------------------------------------------------------------
/**
 * Campos de e-mail e recuperação devem respeitar normalização e select:false.
 */
test('configura email normalizado e campos de recuperação protegidos', () => {
    const email = User.schema.path('email');
    const password = User.schema.path('password');
    const resetHash = User.schema.path('resetTokenHash');
    const resetExpiry = User.schema.path('resetTokenExpiresAt');
    assert.equal(email.options.unique, true);
    assert.equal(email.options.lowercase, true);
    assert.equal(password.options.select, false);
    assert.equal(resetHash.options.select, false);
    assert.equal(resetExpiry.options.select, false);
    assert.equal(
        User.schema.path('emailVerificationTokenHash').options.select,
        false
    );
    assert.equal(
        User.schema.path('emailVerificationTokenExpiresAt').options.select,
        false
    );
    assert.equal(User.schema.path('emailVerified').options.default, false);
});

/**
 * Refresh token atual/usado deve ficar oculto e expirar por TTL.
 */
test('armazena refresh tokens como hash e usa expiração TTL', () => {
    const tokenHash = RefreshToken.schema.path('currentTokenHash');
    const usedTokenHashes = RefreshToken.schema.path('usedTokenHashes');
    const expiresAt = RefreshToken.schema.path('expiresAt');
    assert.equal(tokenHash.options.select, false);
    assert.equal(tokenHash.options.unique, true);
    assert.equal(usedTokenHashes.options.select, false);
    assert.equal(expiresAt.options.expires, 0);
});

/**
 * Estado do bloqueio da conta deve permanecer oculto nas consultas padrão.
 */
test('oculta contador de falhas e data do bloqueio da conta', () => {
    assert.equal(User.schema.path('loginFailedAttempts').options.select, false);
    assert.equal(User.schema.path('loginBlockedUntil').options.select, false);
});

/**
 * Contadores persistentes devem ter chave composta única e índice TTL.
 */
test('configura contador persistente com chave composta única e índice TTL', () => {
    const RateLimitCounter = require('../src/models/RateLimitCounter');
    const indexes = RateLimitCounter.schema.indexes();
    assert.ok(
        indexes.some(
            ([fields, options]) =>
                fields.keyHash === 1 &&
                fields.windowStart === 1 &&
                options.unique === true
        )
    );
    assert.ok(
        indexes.some(
            ([fields, options]) =>
                fields.expiresAt === 1 && options.expireAfterSeconds === 0
        )
    );
});
