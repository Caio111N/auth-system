/**
 * ============================================================
 * ARQUIVO: errorHandler.js
 * FUNÇÃO: Converte erros não tratados em respostas JSON sem detalhes internos.
 * USADO POR: final da cadeia de middleware Express.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: logger estruturado para registrar falhas sem expor mensagens internas
// ------------------------------------------------------------
const logger = require('../utils/logger');

/**
 * Responder com erro HTTP padronizado e registrar falhas de servidor.
 * @param {Error & {status?: number}} error Erro recebido da cadeia Express.
 * @param {import('express').Request} req Requisição associada à falha.
 * @param {import('express').Response} res Resposta JSON segura.
 * @param {import('express').NextFunction} next Encaminha erro se headers já foram enviados.
 * @returns {import('express').Response|void} Resposta padronizada ou delegação ao Express.
 */
module.exports = (error, req, res, next) => {
    if (res.headersSent) return next(error);

    const status = Number.isInteger(error.status) ? error.status : 500;
    const message =
        status === 413
            ? 'Corpo da requisição muito grande'
            : status === 400
              ? 'Requisição inválida'
              : status >= 500
                ? 'Erro interno do servidor'
                : 'Não foi possível processar a requisição';

    if (status >= 500) {
        logger.error(
            {
                status,
                method: req.method,
                path: req.path,
                requestId: req.id,
            },
            'Erro interno ao processar requisição.'
        );
    }
    return res.status(status).json({ error: message });
};
