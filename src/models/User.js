/**
 * ============================================================
 * ARQUIVO: User.js
 * FUNÇÃO: Define o modelo do usuário, seus campos privados e a etapa de hash de senha.
 * USADO POR: controllers de autenticação e testes do modelo.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: persistência MongoDB e hash de senha
// ------------------------------------------------------------
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// ------------------------------------------------------------
// SCHEMA: perfil, credenciais ocultas e estado de segurança da conta
// ------------------------------------------------------------
const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        password: { type: String, required: true, select: false },
        resetTokenHash: { type: String, select: false },
        resetTokenExpiresAt: { type: Date, select: false },
        emailVerified: { type: Boolean, required: true, default: false },
        emailVerificationTokenHash: { type: String, select: false },
        emailVerificationTokenExpiresAt: { type: Date, select: false },
        loginFailedAttempts: { type: Number, default: 0, select: false },
        loginBlockedUntil: { type: Date, select: false },
    },
    { timestamps: true }
);

/**
 * Gerar hash bcrypt quando a senha do documento for alterada.
 * Evita persistir a senha original e não refaz o hash em salvamentos sem mudança.
 * @returns {Promise<void>} Conclui antes da gravação do documento.
 * @throws {Error} Propaga falhas de hashing para cancelar a gravação.
 */
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// ------------------------------------------------------------
// EXPORTS: modelo Mongoose usado na persistência de contas
// ------------------------------------------------------------
module.exports = mongoose.model('User', userSchema);
