const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests-123';
const authMiddleware = require('../src/middlewares/authMiddleware');

const runMiddleware = (token) => new Promise((resolve) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
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
    authMiddleware(req, response, () => resolve({ statusCode: 200, user: req.user }));
});

test('aceita somente access tokens válidos', async () => {
    const token = jwt.sign(
        { sub: 'user-id', type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', algorithm: 'HS256', issuer: 'auth-system', audience: 'auth-client' }
    );
    const result = await runMiddleware(token);
    assert.equal(result.statusCode, 200);
    assert.equal(result.user.sub, 'user-id');
});

test('rejeita tokens de recuperação ou sem Bearer', async () => {
    const resetToken = jwt.sign(
        { sub: 'user-id', type: 'reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', algorithm: 'HS256', issuer: 'auth-system', audience: 'auth-client' }
    );
    assert.equal((await runMiddleware(resetToken)).statusCode, 401);
    assert.equal((await runMiddleware()).statusCode, 401);
});
