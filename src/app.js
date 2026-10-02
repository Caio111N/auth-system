/**
 * ============================================================
 * ARQUIVO: app.js
 * FUNÇÃO: Configura middleware global, segurança, arquivos públicos e rotas HTTP.
 * USADO POR: server.js em execução normal e Supertest durante integração.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: serviços Express, segurança, sessão e componentes da aplicação
// ------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./utils/logger');
const RefreshToken = require('./models/RefreshToken');
const csrfProtection = require('./middlewares/csrfProtection');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middlewares/errorHandler');
const rejectUnsafeInput = require('./middlewares/rejectUnsafeInput');

// ------------------------------------------------------------
// APLICAÇÃO: configuração de proxy, logging, headers, CORS e parsing
// ------------------------------------------------------------
const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(
    pinoHttp({
        logger,
        /**
         * Atribuir identificador imprevisível a cada requisição para correlação.
         * @param {import('http').IncomingMessage} req Requisição recebida.
         * @param {import('http').ServerResponse} res Resposta correspondente.
         * @returns {string} Identificador também publicado no header de resposta.
         */
        genReqId(req, res) {
            const requestId = crypto.randomUUID();
            res.setHeader('X-Request-Id', requestId);
            return requestId;
        },
        /**
         * Escolher severidade de log conforme o resultado da requisição.
         * @param {import('http').IncomingMessage} req Requisição recebida.
         * @param {import('http').ServerResponse} res Resposta concluída.
         * @param {Error|undefined} error Erro observado pelo logger HTTP.
         * @returns {'error'|'warn'|'info'} Nível estruturado de registro.
         */
        customLogLevel(req, res, error) {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
        },
        serializers: {
            /**
             * Reduzir dados da requisição registrada e omitir sua query string.
             * @param {object} req Dados da requisição do logger.
             * @returns {object} Campos mínimos de diagnóstico.
             */
            req(req) {
                return {
                    method: req.method,
                    url: req.url.split('?')[0],
                    remoteAddress: req.remoteAddress,
                };
            },
            /**
             * Registrar somente o status HTTP da resposta.
             * @param {object} res Dados da resposta do logger.
             * @returns {{statusCode: number}} Status final.
             */
            res(res) {
                return { statusCode: res.statusCode };
            },
        },
    })
);
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", 'https://fonts.googleapis.com'],
                upgradeInsecureRequests: config.isProduction ? [] : null,
            },
        },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        strictTransportSecurity: config.isProduction
            ? {
                  maxAge: 31536000,
                  includeSubDomains: true,
                  preload: true,
              }
            : false,
        xContentTypeOptions: true,
    })
);
app.use((req, res, next) => {
    res.setHeader(
        'Permissions-Policy',
        'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    next();
});
app.use(
    cors({
        origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
        credentials: true,
    })
);
app.use(express.json({ limit: '10kb' }));
app.use('/api', rejectUnsafeInput);
app.use(csrfProtection(config.isProduction));

// ------------------------------------------------------------
// ROTA DE DASHBOARD: só entrega conteúdo após validar access ou refresh
// ------------------------------------------------------------
/**
 * GET /dashboard.html — sessão válida; sem credencial válida redireciona ao login.
 * Não há corpo de requisição; erro de banco segue ao error handler global.
 * @param {import('express').Request} req Cookies de access e refresh.
 * @param {import('express').Response} res HTML do dashboard ou redirect.
 * @param {import('express').NextFunction} next Encaminha falha interna.
 * @returns {Promise<void>} Responde após a verificação do token/sessão.
 */
app.get('/dashboard.html', async (req, res, next) => {
    const accessToken = req.cookies.accessToken;
    if (accessToken) {
        try {
            const decoded = jwt.verify(accessToken, config.jwtSecret, {
                algorithms: ['HS256'],
                issuer: 'auth-system',
                audience: 'auth-client',
            });
            if (decoded.type === 'access' && typeof decoded.sub === 'string') {
                const hasActiveSession =
                    typeof decoded.sid !== 'string' ||
                    (await RefreshToken.exists({
                        userId: decoded.sub,
                        familyId: decoded.sid,
                        revokedAt: null,
                        expiresAt: { $gt: new Date() },
                    }));
                if (hasActiveSession)
                    return res.sendFile(
                        path.join(__dirname, '..', 'public', 'dashboard.html')
                    );
            }
        } catch {
            // Um access token expirado ainda pode ter uma sessão válida para renovação.
        }
    }

    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        try {
            const tokenHash = crypto
                .createHash('sha256')
                .update(refreshToken)
                .digest('hex');
            const session = await RefreshToken.findOne({
                currentTokenHash: tokenHash,
                revokedAt: null,
                expiresAt: { $gt: new Date() },
            });
            if (session)
                return res.sendFile(
                    path.join(__dirname, '..', 'public', 'dashboard.html')
                );
        } catch (error) {
            return next(error);
        }
    }
    return res.redirect('/login.html');
});

// ------------------------------------------------------------
// ARQUIVOS PÚBLICOS E HEALTH: conteúdo estático e estado do banco
// ------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * GET /health — público; informa se a conexão Mongoose está pronta.
 * Retorna 200/`ok` ou 503/`degraded` em JSON.
 * @param {import('express').Request} req Requisição de health check.
 * @param {import('express').Response} res Estado HTTP e JSON do banco.
 * @returns {import('express').Response} Resposta de disponibilidade.
 */
app.get('/health', (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? 'ok' : 'degraded',
        database: databaseReady ? 'connected' : 'disconnected',
    });
});

// ------------------------------------------------------------
// ROTAS API: bloqueio uniforme sem banco, endpoints e respostas de erro
// ------------------------------------------------------------
/**
 * Proteger todas as rotas `/api` quando o banco não está conectado.
 * @param {import('express').Request} req Requisição API.
 * @param {import('express').Response} res Responde 503 indisponível.
 * @param {import('express').NextFunction} next Continua quando Mongo está pronto.
 * @returns {void}
 */
app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState === 1) return next();
    return res
        .status(503)
        .json({ error: 'Serviço temporariamente indisponível' });
});
app.use('/api/auth', authRoutes);
/**
 * Responder JSON padronizado quando nenhum endpoint `/api` corresponde.
 * @param {import('express').Request} req Requisição sem rota correspondente.
 * @param {import('express').Response} res Resposta 404 JSON.
 * @returns {import('express').Response} Mensagem pública sem detalhes internos.
 */
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada' });
});
app.use(errorHandler);

// ------------------------------------------------------------
// EXPORTS: app sem listener para reutilização por servidor e testes
// ------------------------------------------------------------
module.exports = app;
