/**
 * ============================================================
 * ARQUIVO: rejectUnsafeInput.js
 * FUNÇÃO: Rejeita operadores MongoDB, chaves com ponto e parâmetros HTTP repetidos.
 * USADO POR: app.js antes das rotas `/api`.
 * ============================================================
 */

// ------------------------------------------------------------
// HELPERS: procura nomes de chave não seguros em corpos e queries aninhadas
// ------------------------------------------------------------
/**
 * Detectar chaves incompatíveis com os formatos aceitos pela API.
 * @param {unknown} value Estrutura já decodificada pelo Express.
 * @returns {boolean} Indica operador MongoDB ou chave com ponto.
 */
const hasUnsafeKey = (value) => {
    if (Array.isArray(value)) return value.some(hasUnsafeKey);
    if (value === null || typeof value !== 'object') return false;
    return Object.entries(value).some(
        ([key, child]) =>
            key.includes('$') || key.includes('.') || hasUnsafeKey(child)
    );
};

// ------------------------------------------------------------
// MIDDLEWARE: rejeita payloads inseguros e HPP antes da validação de rota
// ------------------------------------------------------------
/**
 * Bloquear operadores MongoDB e valores duplicados em parâmetros de query.
 * Body arrays seguem permitidos, mas seus objetos também são inspecionados.
 * @param {import('express').Request} req Requisição API já parseada.
 * @param {import('express').Response} res Resposta 400 em entrada insegura.
 * @param {import('express').NextFunction} next Continua para CSRF e schemas.
 * @returns {import('express').Response|void} Erro genérico ou próximo middleware.
 */
module.exports = (req, res, next) => {
    if (hasUnsafeKey(req.body) || hasUnsafeKey(req.query)) {
        return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    if (Object.values(req.query).some(Array.isArray)) {
        return res
            .status(400)
            .json({ error: 'Parâmetros repetidos não são aceitos' });
    }
    return next();
};
