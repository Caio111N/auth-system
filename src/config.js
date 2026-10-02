/**
 * ============================================================
 * ARQUIVO: config.js
 * FUNÇÃO: Carrega e valida a configuração da aplicação antes que os módulos de negócio iniciem.
 * USADO POR: servidor, aplicação Express, controllers e middlewares.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: carregador de ambiente e validação de endereços de proxy
// ------------------------------------------------------------
require('dotenv').config();
const net = require('net');

// ------------------------------------------------------------
// CONFIGURAÇÃO: lê valores do processo e define padrões seguros
// ------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const portValue = process.env.PORT || '3000';
const port = Number(portValue);
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const jwtSecret = process.env.JWT_SECRET;
const resetPasswordUrl =
    process.env.RESET_PASSWORD_URL ||
    (!isProduction ? `http://localhost:${port}/reset-password` : undefined);
const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : undefined;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM?.trim();
const refreshShortTtlDays = Number(
    process.env.REFRESH_TOKEN_SHORT_TTL_DAYS || 1
);
const refreshLongTtlDays = Number(
    process.env.REFRESH_TOKEN_LONG_TTL_DAYS || 30
);
const rateLimitWindowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000
);
const loginRateLimitMax = Number(process.env.LOGIN_RATE_LIMIT_MAX || 5);
const loginEmailRateLimitMax = Number(
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX || 5
);
const registerRateLimitMax = Number(process.env.REGISTER_RATE_LIMIT_MAX || 5);
const forgotPasswordRateLimitMax = Number(
    process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX || 3
);
const emailVerificationRateLimitMax = Number(
    process.env.EMAIL_VERIFICATION_RATE_LIMIT_MAX || 3
);
const resetPasswordRateLimitMax = Number(
    process.env.RESET_PASSWORD_RATE_LIMIT_MAX || 5
);
const refreshRateLimitMax = Number(process.env.REFRESH_RATE_LIMIT_MAX || 30);
const loginMaxFailedAttempts = Number(
    process.env.LOGIN_MAX_FAILED_ATTEMPTS || 5
);
const loginBlockDurationMinutes = Number(
    process.env.LOGIN_BLOCK_DURATION_MINUTES || 15
);
const trustProxyValue =
    process.env.TRUST_PROXY?.trim().toLowerCase() || 'false';
const emailVerificationValue =
    process.env.EMAIL_VERIFICATION_ENABLED?.trim().toLowerCase() || 'false';
const emailVerificationTtlHours = Number(
    process.env.EMAIL_VERIFICATION_TTL_HOURS || 24
);
const smtpSettings = [smtpHost, smtpPort, smtpUser, smtpPass, mailFrom];
const hasSmtpSettings = smtpSettings.every(
    (value) => value !== undefined && value !== ''
);
const hasPartialSmtpSettings = smtpSettings.some(
    (value) => value !== undefined && value !== ''
);

/**
 * Interromper inicialização com mensagem de configuração acionável.
 * Falha imediatamente para impedir que a aplicação rode com configuração parcial.
 * @param {string} message Explicação segura, sem valores de segredo.
 * @returns {never} Lança um erro de configuração.
 * @throws {Error} Sempre lança o erro com prefixo padronizado.
 */
const fail = (message) => {
    throw new Error(`Configuração inválida: ${message}`);
};

// ------------------------------------------------------------
// VALIDAÇÃO: verifica os campos obrigatórios e os limites numéricos
// ------------------------------------------------------------
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('PORT deve ser um número inteiro entre 1 e 65535.');
}

if (typeof mongoUri !== 'string' || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    fail('MONGODB_URI (ou MONGO_URI) deve conter uma URI válida do MongoDB.');
}

if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    fail('JWT_SECRET é obrigatório e deve ter pelo menos 32 caracteres.');
}

if (isProduction && !process.env.RESET_PASSWORD_URL) {
    fail('RESET_PASSWORD_URL é obrigatório em produção.');
}

if (isProduction && !hasSmtpSettings) {
    fail(
        'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e MAIL_FROM são obrigatórios em produção.'
    );
}

if (hasPartialSmtpSettings && !hasSmtpSettings) {
    fail(
        'Configure todas as variáveis SMTP ou deixe todas ausentes em desenvolvimento.'
    );
}

if (
    hasSmtpSettings &&
    (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
) {
    fail('SMTP_PORT deve ser um número inteiro entre 1 e 65535.');
}

if (
    !Number.isInteger(refreshShortTtlDays) ||
    refreshShortTtlDays < 1 ||
    refreshShortTtlDays > 365
) {
    fail(
        'REFRESH_TOKEN_SHORT_TTL_DAYS deve ser um número inteiro entre 1 e 365.'
    );
}

if (
    !Number.isInteger(refreshLongTtlDays) ||
    refreshLongTtlDays < 1 ||
    refreshLongTtlDays > 365
) {
    fail(
        'REFRESH_TOKEN_LONG_TTL_DAYS deve ser um número inteiro entre 1 e 365.'
    );
}

const positiveIntegerSettings = [
    ['RATE_LIMIT_WINDOW_MS', rateLimitWindowMs, 1000, 24 * 60 * 60 * 1000],
    ['LOGIN_RATE_LIMIT_MAX', loginRateLimitMax, 1, 10000],
    ['LOGIN_EMAIL_RATE_LIMIT_MAX', loginEmailRateLimitMax, 1, 10000],
    ['REGISTER_RATE_LIMIT_MAX', registerRateLimitMax, 1, 10000],
    ['FORGOT_PASSWORD_RATE_LIMIT_MAX', forgotPasswordRateLimitMax, 1, 10000],
    [
        'EMAIL_VERIFICATION_RATE_LIMIT_MAX',
        emailVerificationRateLimitMax,
        1,
        10000,
    ],
    ['RESET_PASSWORD_RATE_LIMIT_MAX', resetPasswordRateLimitMax, 1, 10000],
    ['REFRESH_RATE_LIMIT_MAX', refreshRateLimitMax, 1, 10000],
    ['LOGIN_MAX_FAILED_ATTEMPTS', loginMaxFailedAttempts, 1, 100],
    ['LOGIN_BLOCK_DURATION_MINUTES', loginBlockDurationMinutes, 1, 1440],
];

// ------------------------------------------------------------
// VALIDAÇÃO: verifica proxy, URLs e origens aceitas pelo CORS
// ------------------------------------------------------------
for (const [name, value, minimum, maximum] of positiveIntegerSettings) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        fail(
            `${name} deve ser um número inteiro entre ${minimum} e ${maximum}.`
        );
    }
}

if (emailVerificationValue !== 'true' && emailVerificationValue !== 'false') {
    fail('EMAIL_VERIFICATION_ENABLED deve ser true ou false.');
}

if (
    !Number.isInteger(emailVerificationTtlHours) ||
    emailVerificationTtlHours < 1 ||
    emailVerificationTtlHours > 168
) {
    fail(
        'EMAIL_VERIFICATION_TTL_HOURS deve ser um número inteiro entre 1 e 168.'
    );
}

let trustProxy;
if (trustProxyValue === 'true') {
    trustProxy = true;
} else if (trustProxyValue === 'false') {
    trustProxy = false;
} else if (/^\d+$/.test(trustProxyValue)) {
    trustProxy = Number(trustProxyValue);
    if (!Number.isSafeInteger(trustProxy) || trustProxy > 255) {
        fail('TRUST_PROXY em número de saltos deve estar entre 0 e 255.');
    }
} else {
    const proxyAddresses = trustProxyValue
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean);
    const hasInvalidAddress = proxyAddresses.some((address) => {
        const [ip, prefix, ...extra] = address.split('/');
        const ipVersion = net.isIP(ip);
        if (ipVersion === 0 || extra.length > 0) return true;
        if (prefix === undefined) return false;
        const prefixLength = Number(prefix);
        const maximumPrefix = ipVersion === 4 ? 32 : 128;
        return !/^\d+$/.test(prefix) || prefixLength > maximumPrefix;
    });
    if (proxyAddresses.length === 0 || hasInvalidAddress) {
        fail(
            'TRUST_PROXY deve ser true, false, um número de saltos ou uma lista de IPs/CIDRs confiáveis.'
        );
    }
    trustProxy = proxyAddresses;
}

if (typeof resetPasswordUrl !== 'string') {
    fail('RESET_PASSWORD_URL deve ser uma URL HTTP(S) válida.');
}

try {
    const parsedResetUrl = new URL(resetPasswordUrl);
    if (!['http:', 'https:'].includes(parsedResetUrl.protocol)) {
        fail('RESET_PASSWORD_URL deve usar HTTP ou HTTPS.');
    }
} catch (error) {
    if (error.message.startsWith('Configuração inválida:')) throw error;
    fail('RESET_PASSWORD_URL deve ser uma URL HTTP(S) válida.');
}

const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

for (const origin of corsOrigins) {
    if (origin === '*')
        fail(
            'CORS_ORIGINS não pode conter "*" quando credenciais estão habilitadas.'
        );
    try {
        const parsedOrigin = new URL(origin);
        if (
            !['http:', 'https:'].includes(parsedOrigin.protocol) ||
            parsedOrigin.origin !== origin
        ) {
            fail(
                'Cada entrada de CORS_ORIGINS deve ser uma origem HTTP(S) válida, sem caminho.'
            );
        }
    } catch (error) {
        if (error.message.startsWith('Configuração inválida:')) throw error;
        fail(
            'Cada entrada de CORS_ORIGINS deve ser uma origem HTTP(S) válida, sem caminho.'
        );
    }
}

// ------------------------------------------------------------
// EXPORTS: disponibiliza configuração já validada aos módulos da aplicação
// ------------------------------------------------------------
module.exports = {
    corsOrigins,
    isProduction,
    jwtSecret,
    mailFrom,
    mongoUri,
    port,
    refreshLongTtlDays,
    refreshShortTtlDays,
    rateLimitWindowMs,
    loginRateLimitMax,
    loginEmailRateLimitMax,
    registerRateLimitMax,
    forgotPasswordRateLimitMax,
    emailVerificationRateLimitMax,
    resetPasswordRateLimitMax,
    refreshRateLimitMax,
    loginMaxFailedAttempts,
    loginBlockDurationMinutes,
    emailVerificationEnabled: emailVerificationValue === 'true',
    emailVerificationTtlHours,
    trustProxy,
    resetPasswordUrl,
    smtp: hasSmtpSettings
        ? {
              host: smtpHost,
              port: smtpPort,
              user: smtpUser,
              pass: smtpPass,
          }
        : undefined,
};
