/**
 * ============================================================
 * ARQUIVO: server.js
 * FUNÇÃO: Conecta ao MongoDB, inicia HTTP e encerra os recursos ao receber sinal do sistema.
 * USADO POR: scripts start/dev; testes importam app.js sem disparar este ciclo.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: conexão Mongoose, configuração, app Express e logger
// ------------------------------------------------------------
const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');
const logger = require('./utils/logger');

// ------------------------------------------------------------
// INICIALIZAÇÃO: inicia HTTP e conexão direta com o MongoDB configurado
// ------------------------------------------------------------
/**
 * Iniciar servidor HTTP e tentar conectar ao MongoDB usando timeout limitado.
 * Mantém o serviço disponível para health/503 mesmo enquanto o banco está fora.
 * @returns {import('http').Server} Servidor HTTP ativo.
 */
const startServer = () => {
    /**
     * Registrar que o listener está pronto para receber requisições.
     * @returns {void}
     */
    const server = app.listen(config.port, () => {
        logger.info({ port: config.port }, 'Servidor HTTP iniciado.');
    });
    let isShuttingDown = false;

    mongoose
        .connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
        /**
         * Registrar sucesso sem imprimir a URI ou detalhes de autenticação.
         * @returns {void}
         */
        .then(() => {
            logger.info('Conexão com MongoDB estabelecida.');
        })
        /**
         * Explicar verificações de conectividade sem incluir erro que possa conter URI.
         * @returns {void}
         */
        .catch(() => {
            if (!isShuttingDown) {
                logger.error(
                    'MongoDB inacessível. Verifique se o serviço está rodando, a URI e as credenciais; no Atlas, confira Network Access e IPs liberados.'
                );
            }
        });

    /**
     * Parar o listener e desconectar Mongoose ao receber sinal de encerramento.
     * @param {'SIGINT'|'SIGTERM'} signal Sinal recebido do sistema.
     * @returns {void}
     */
    const shutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        logger.info({ signal }, 'Encerramento gracioso iniciado.');

        server.close(async (error) => {
            if (error) {
                logger.error(
                    'Não foi possível encerrar o servidor HTTP corretamente.'
                );
                process.exitCode = 1;
            }

            try {
                await mongoose.disconnect();
            } catch {
                logger.error(
                    'Não foi possível encerrar a conexão com o MongoDB corretamente.'
                );
                process.exitCode = 1;
            }
        });
    };

    // A execução de CLI instala handlers; importar o módulo em testes não os instala.
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    return server;
};

if (require.main === module) startServer();

module.exports = { startServer };
