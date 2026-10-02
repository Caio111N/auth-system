/**
 * ============================================================
 * ARQUIVO: validateBody.js
 * FUNÇÃO: Valida o corpo da requisição e substitui-o pelos dados normalizados.
 * USADO POR: rotas POST da API com schemas Zod.
 * ============================================================
 */

/**
 * Criar middleware que valida body e responde erros de forma uniforme.
 * @param {import('zod').ZodType} schema Schema do payload esperado.
 * @returns {import('express').RequestHandler} Middleware de validação.
 * @throws {Error} Encaminha falhas não relacionadas à validação ao Express.
 */
module.exports = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            error: 'Dados inválidos',
            details: result.error.issues.map((issue) => issue.message),
        });
    }

    req.body = result.data;
    return next();
};
