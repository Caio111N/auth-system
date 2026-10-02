/**
 * ============================================================
 * ARQUIVO: dev-chrome.js
 * FUNÇÃO: Inicia nodemon e o abridor de navegador em paralelo.
 * USADO POR: script `dev:chrome` do package.json.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS E CAMINHOS: executa os processos Node locais sem dependências extras
// ------------------------------------------------------------
const { spawn } = require('child_process');
const path = require('path');

const node = process.execPath;
const nodemon = path.join(
    __dirname,
    '..',
    'node_modules',
    'nodemon',
    'bin',
    'nodemon.js'
);
const server = spawn(node, [nodemon, 'src/server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
});
const browser = spawn(node, [path.join(__dirname, 'open-browser.js')], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
});

// ------------------------------------------------------------
// ENCERRAMENTO: encaminha sinais ao servidor e ao processo de espera
// ------------------------------------------------------------
/**
 * Encerrar processos filhos ao receber sinal do terminal.
 * @param {'SIGINT'|'SIGTERM'} signal Sinal recebido.
 * @returns {void}
 */
const stopChildren = (signal) => {
    for (const child of [server, browser]) {
        if (child.exitCode === null && child.signalCode === null)
            child.kill(signal);
    }
};

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

server.once('error', (error) => {
    console.error(
        `Não foi possível iniciar o servidor de desenvolvimento: ${error.message}`
    );
    process.exitCode = 1;
    stopChildren('SIGTERM');
});

browser.once('error', (error) => {
    console.error(
        `Não foi possível iniciar o abridor do navegador: ${error.message}`
    );
    process.exitCode = 1;
});

server.once('close', (code) => {
    if (code && code !== 0) process.exitCode = code;
});

browser.once('close', (code) => {
    if (code && code !== 0) process.exitCode = code;
});
