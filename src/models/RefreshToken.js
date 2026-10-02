/**
 * ============================================================
 * ARQUIVO: RefreshToken.js
 * FUNÇÃO: Modela sessões de refresh com hash, família e expiração TTL.
 * USADO POR: controllers e middlewares de autenticação.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: tipos e schema do MongoDB
// ------------------------------------------------------------
const mongoose = require('mongoose');

// ------------------------------------------------------------
// SCHEMA: sessão, rotação de tokens e metadados opcionais
// ------------------------------------------------------------
const refreshTokenSchema = new mongoose.Schema(
    {
        currentTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        usedTokenHashes: { type: [String], default: [], select: false },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        familyId: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true, expires: 0 },
        rememberMe: { type: Boolean, required: true, default: false },
        userAgent: { type: String, maxlength: 512 },
        ip: { type: String, maxlength: 64 },
        createdAt: { type: Date, default: Date.now, immutable: true },
        revokedAt: { type: Date, default: null },
    },
    { versionKey: false }
);

// ------------------------------------------------------------
// EXPORTS: modelo de sessões persistentes
// ------------------------------------------------------------
module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
