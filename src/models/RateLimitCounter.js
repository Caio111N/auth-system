/**
 * ============================================================
 * ARQUIVO: RateLimitCounter.js
 * FUNÇÃO: Armazena contadores de rate limit por hash e janela de tempo.
 * USADO POR: middleware persistente de limitação de requisições.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: schema e índices MongoDB
// ------------------------------------------------------------
const mongoose = require('mongoose');

// ------------------------------------------------------------
// SCHEMA: contador de tentativas com remoção TTL
// ------------------------------------------------------------
const rateLimitCounterSchema = new mongoose.Schema(
    {
        keyHash: { type: String, required: true },
        windowStart: { type: Date, required: true },
        count: { type: Number, required: true, default: 0 },
        expiresAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false }
);

// Unicidade da combinação coordena incrementos concorrentes no mesmo intervalo.
rateLimitCounterSchema.index({ keyHash: 1, windowStart: 1 }, { unique: true });

// ------------------------------------------------------------
// EXPORTS: modelo consumido pelo middleware de rate limit
// ------------------------------------------------------------
module.exports = mongoose.model('RateLimitCounter', rateLimitCounterSchema);
