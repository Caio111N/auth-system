const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');

test('configura email normalizado e campos de recuperação protegidos', () => {
    const email = User.schema.path('email');
    const resetHash = User.schema.path('resetTokenHash');
    assert.equal(email.options.unique, true);
    assert.equal(email.options.lowercase, true);
    assert.equal(resetHash.options.select, false);
});
