/**
 * ============================================================
 * ARQUIVO: sendEmails.js
 * FUNÇÃO: Envia e-mails de redefinição e verificação, com alternativa manual em desenvolvimento.
 * USADO POR: controller de autenticação nos fluxos de recuperação e verificação.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS: SMTP e configuração validada
// ------------------------------------------------------------
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('./logger');

/**
 * Escapar conteúdo variável antes de inseri-lo em HTML.
 * Impede que caracteres do link sejam interpretados como markup.
 * @param {string} value Texto a ser codificado.
 * @returns {string} Texto HTML-safe.
 */
const escapeHtml = (value) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

/**
 * Montar assunto e versões texto/HTML para uma mensagem de conta.
 * @param {string} url Link único enviado ao destinatário.
 * @param {'reset'|'verification'} type Finalidade da mensagem.
 * @returns {{subject: string, text: string, html: string}} Conteúdo do e-mail.
 */
const createEmail = (url, type) => {
    const safeUrl = escapeHtml(url);
    const isVerification = type === 'verification';
    return {
        subject: isVerification
            ? 'Verifique seu e-mail — Auth System'
            : 'Redefinição de senha — Auth System',
        text: [
            isVerification
                ? 'Confirme o endereço de e-mail da sua conta Auth System.'
                : 'Recebemos uma solicitação para redefinir a senha da sua conta Auth System.',
            '',
            isVerification
                ? 'Use o link abaixo para confirmar seu e-mail. O link tem validade limitada e pode ser usado uma única vez:'
                : 'Use o link abaixo para escolher uma nova senha. O link expira em 15 minutos e pode ser usado uma única vez:',
            url,
            '',
            isVerification
                ? 'Se você não criou esta conta, ignore esta mensagem.'
                : 'Se você não solicitou a redefinição, ignore esta mensagem.',
        ].join('\n'),
        html: [
            '<!doctype html>',
            '<html lang="pt-BR"><body>',
            `<h1>${isVerification ? 'Verifique seu e-mail' : 'Redefinição de senha'}</h1>`,
            `<p>${
                isVerification
                    ? 'Confirme o endereço de e-mail da sua conta Auth System.'
                    : 'Recebemos uma solicitação para redefinir a senha da sua conta Auth System.'
            }</p>`,
            `<p><a href="${safeUrl}">${isVerification ? 'Confirmar e-mail' : 'Escolher nova senha'}</a></p>`,
            `<p>${
                isVerification
                    ? 'Este link tem validade limitada e pode ser usado uma única vez.'
                    : 'Este link expira em 15 minutos e pode ser usado uma única vez.'
            }</p>`,
            `<p>${
                isVerification
                    ? 'Se você não criou esta conta, ignore esta mensagem.'
                    : 'Se você não solicitou a redefinição, ignore esta mensagem.'
            }</p>`,
            '</body></html>',
        ].join(''),
    };
};

// Mantém um transporte SMTP para reutilizar conexões ao longo da vida do processo.
let transporter;

/**
 * Enviar a mensagem pelo SMTP ou registrar link manual apenas fora de produção.
 * @param {string} to Endereço de destino.
 * @param {string} url URL de uso único da operação.
 * @param {'reset'|'verification'} type Tipo do e-mail.
 * @returns {Promise<void>} Conclui o envio ou o fallback local.
 * @throws {TypeError|Error} Rejeita destinatário inválido ou falha de envio/configuração.
 */
const sendMessage = async (to, url, type) => {
    if (typeof to !== 'string' || typeof url !== 'string') {
        throw new TypeError('Destinatário e link de e-mail são obrigatórios.');
    }
    const message = createEmail(url, type);
    if (!config.smtp) {
        if (config.isProduction)
            throw new Error('O transporte SMTP não está configurado.');
        console.info(
            `SMTP não configurado; link de ${type === 'verification' ? 'verificação' : 'recuperação'} (uso único, apenas desenvolvimento): ${url}`
        );
        return;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465,
            auth: {
                user: config.smtp.user,
                pass: config.smtp.pass,
            },
        });
    }

    try {
        await transporter.sendMail({
            from: config.mailFrom,
            to,
            ...message,
        });
    } catch (error) {
        const errorCode =
            typeof error.code === 'string' &&
            /^[A-Z0-9_]{1,32}$/.test(error.code)
                ? error.code
                : 'UNKNOWN';
        const command =
            typeof error.command === 'string' &&
            /^[A-Z0-9_]{1,32}$/.test(error.command)
                ? error.command
                : 'UNKNOWN';
        const responseCode = Number.isInteger(error.responseCode)
            ? error.responseCode
            : undefined;
        const isAuthenticationFailure =
            errorCode === 'EAUTH' || responseCode === 535;
        const isConnectionFailure = [
            'ECONNECTION',
            'ETIMEDOUT',
            'ESOCKET',
            'EDNS',
        ].includes(errorCode);
        const diagnostic = isAuthenticationFailure
            ? 'Falha de autenticação SMTP. Confira SMTP_USER e SMTP_PASS; no Gmail, use uma senha de app.'
            : isConnectionFailure
              ? 'Falha de conexão SMTP. Confira SMTP_HOST, SMTP_PORT, TLS e o acesso de rede.'
              : `Falha na entrega SMTP durante ${command}. Confira SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.`;

        logger.error(
            {
                event: 'smtp_delivery_failed',
                host: config.smtp.host,
                port: config.smtp.port,
                errorCode,
                command,
                responseCode,
            },
            diagnostic
        );
        throw new Error('Não foi possível entregar o e-mail pelo SMTP.', {
            cause: error,
        });
    }
};

/**
 * Enviar mensagem de redefinição de senha.
 * @param {string} to E-mail da conta.
 * @param {string} url Link de redefinição.
 * @returns {Promise<void>} Resultado da entrega.
 * @throws {Error} Propaga indisponibilidade do SMTP.
 */
const sendPasswordResetEmail = (to, url) => sendMessage(to, url, 'reset');

/**
 * Enviar confirmação do endereço de e-mail.
 * @param {string} to E-mail da conta.
 * @param {string} url Link de verificação.
 * @returns {Promise<void>} Resultado da entrega.
 * @throws {Error} Propaga indisponibilidade do SMTP.
 */
sendPasswordResetEmail.sendVerificationEmail = (to, url) =>
    sendMessage(to, url, 'verification');

// ------------------------------------------------------------
// EXPORTS: funções de envio usadas pelo controller de autenticação
// ------------------------------------------------------------
module.exports = sendPasswordResetEmail;
