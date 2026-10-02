/**
 * ============================================================
 * ARQUIVO: authSchemas.js
 * FUNÇÃO: Define schemas Zod para validar e normalizar entradas de autenticação.
 * USADO POR: rotas da API por meio do middleware validateBody.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: biblioteca de validação declarativa
// ------------------------------------------------------------
const { z } = require('zod');

// ------------------------------------------------------------
// POLÍTICA DE SENHA: bloqueia exemplos frequentes além do limite mínimo
// ------------------------------------------------------------
const commonPasswords = new Set([
    '1234567890',
    '123456789',
    'password123',
    'password1234',
    'password12345',
    'qwerty12345',
    'letmein1234',
    'admin12345',
    'admin123456',
    'senha12345',
    'senha123456',
    'welcome1234',
    'welcome2024',
    'changeme123',
    'abc1234567',
    '0000000000',
    '1111111111',
    'brasil12345',
    'qwertyuiop',
    'passw0rd123',
    'iloveyou123',
]);

// ------------------------------------------------------------
// SCHEMAS BASE: normaliza e valida formatos compartilhados
// ------------------------------------------------------------
const passwordSchema = z
    .string()
    .min(10, 'A senha deve ter pelo menos 10 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.')
    .refine((password) => !commonPasswords.has(password.toLowerCase()), {
        message: 'Escolha uma senha que não seja comum ou previsível.',
    });

const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um e-mail válido.')
    .max(254, 'O e-mail deve ter no máximo 254 caracteres.');

const emptyBodySchema = z.preprocess(
    (body) => body ?? {},
    z.object({}).strict()
);

// ------------------------------------------------------------
// SCHEMAS DE REQUISIÇÃO: valida payloads de cada operação de autenticação
// ------------------------------------------------------------
module.exports = {
    emptyBody: emptyBodySchema,
    register: z
        .object({
            name: z
                .string()
                .trim()
                .min(2, 'O nome deve ter pelo menos 2 caracteres.')
                .max(100, 'O nome deve ter no máximo 100 caracteres.'),
            email: emailSchema,
            password: passwordSchema,
        })
        .strict(),
    login: z
        .object({
            email: emailSchema,
            password: z
                .string()
                .min(1, 'Informe sua senha.')
                .max(128, 'A senha deve ter no máximo 128 caracteres.'),
            rememberMe: z.boolean().optional().default(false),
        })
        .strict(),
    email: z.object({ email: emailSchema }).strict(),
    resetPassword: z
        .object({
            token: z
                .string()
                .regex(/^[a-f0-9]{64}$/, 'O token de redefinição é inválido.'),
            password: passwordSchema,
        })
        .strict(),
    verifyEmail: z
        .object({
            token: z
                .string()
                .regex(/^[a-f0-9]{64}$/, 'O token de verificação é inválido.'),
        })
        .strict(),
};
