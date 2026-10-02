/**
 * ============================================================
 * ARQUIVO: csrfProtection.js
 * FUNÇÃO: Emite cookie CSRF e valida double-submit nas requisições de escrita da API.
 * USADO POR: aplicação Express e controllers que compartilham opções de cookie.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS E CONSTANTES: define métodos seguros e o nome do cookie CSRF
// ------------------------------------------------------------
const crypto = require('crypto');

const CSRF_COOKIE = 'csrfToken';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Interpretar pares do header Cookie sem depender de middleware externo.
 * @param {string} [header] Conteúdo do header Cookie.
 * @returns {Record<string, string>} Cookies decodificados em pares nome/valor.
 */
const parseCookies = (header = '') =>
    Object.fromEntries(
        header
            .split(';')
            .map((part) => {
                const separator = part.indexOf('=');
                if (separator < 0) return ['', ''];
                return [
                    part.slice(0, separator).trim(),
                    part.slice(separator + 1).trim(),
                ];
            })
            .filter(([name]) => name)
    );

/**
 * Construir atributos comuns do cookie CSRF e de sessão.
 * @param {boolean} isProduction Ativa o atributo Secure em produção.
 * @returns {import('express').CookieOptions} Opções comuns do cookie.
 */
const cookieOptions = (isProduction) => ({
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
});

/**
 * Criar o middleware double-submit de CSRF.
 * Rejeita escritas na API quando o header customizado não coincide com o cookie.
 * @param {boolean} isProduction Define atributos de cookie adequados ao ambiente.
 * @returns {import('express').RequestHandler} Middleware que emite/valida CSRF.
 */
module.exports = (isProduction) => (req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);

    if (!req.cookies[CSRF_COOKIE]) {
        const token = crypto.randomBytes(32).toString('hex');
        req.cookies[CSRF_COOKIE] = token;
        res.cookie(CSRF_COOKIE, token, {
            ...cookieOptions(isProduction),
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
    }

    if (!req.path.startsWith('/api/') || SAFE_METHODS.has(req.method))
        return next();

    const cookieToken = req.cookies[CSRF_COOKIE];
    const headerToken = req.get('X-CSRF-Token');
    if (typeof headerToken !== 'string' || typeof cookieToken !== 'string') {
        return res.status(403).json({ error: 'Validação CSRF inválida' });
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    if (
        cookieBuffer.length !== headerBuffer.length ||
        !crypto.timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
        return res.status(403).json({ error: 'Validação CSRF inválida' });
    }

    return next();
};

// ------------------------------------------------------------
// EXPORTS AUXILIARES: parsing e atributos compartilhados de cookie
// ------------------------------------------------------------
module.exports.parseCookies = parseCookies;
module.exports.cookieOptions = cookieOptions;
