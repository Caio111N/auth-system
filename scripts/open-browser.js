/**
 * ============================================================
 * ARQUIVO: open-browser.js
 * FUNÇÃO: Aguarda o health check saudável e abre o projeto no navegador.
 * USADO POR: `npm run dev:chrome` em conjunto com o servidor de desenvolvimento.
 * ============================================================
 */

// ------------------------------------------------------------
// IMPORTS E CONFIGURAÇÃO: usa apenas módulos nativos e lê a porta local
// ------------------------------------------------------------
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
require('dotenv').config();

const port = Number(process.env.PORT || 3000);
const healthUrl = `http://127.0.0.1:${port}/health`;
const pageUrl = `http://localhost:${port}`;
const startupTimeoutMs = 30000;

/**
 * Aguardar o endpoint /health retornar estado saudável.
 * @returns {Promise<void>} Resolve quando MongoDB está conectado.
 * @throws {Error} Se o serviço não ficar saudável em até 30 segundos.
 */
const waitForHealth = async () => {
    const deadline = Date.now() + startupTimeoutMs;
    let lastStatus;

    while (Date.now() < deadline) {
        const result = await new Promise((resolve) => {
            const request = http.get(healthUrl, (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve({ status: response.statusCode, body });
                });
            });
            request.setTimeout(1500, () => request.destroy());
            request.on('error', () => resolve({ status: undefined }));
        });

        lastStatus = result.status;
        if (result.status === 200) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (lastStatus === 503) {
        throw new Error(
            'O servidor respondeu, mas o MongoDB continua indisponível. Verifique se o serviço está ativo, a URI, as credenciais e, no Atlas, os IPs liberados.'
        );
    }
    throw new Error(
        'O servidor não respondeu ao /health em 30 segundos. Verifique se a porta está livre e se a aplicação iniciou.'
    );
};

/**
 * Iniciar comando de navegador sem manter o script preso ao processo gráfico.
 * @param {string} command Executável do sistema.
 * @param {string[]} args Argumentos do executável.
 * @returns {Promise<void>} Resolve quando o comando é iniciado.
 */
const runCommand = (command, args) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.once('error', reject);
        child.once('spawn', () => {
            child.unref();
            resolve();
        });
    });

/**
 * Abrir Chrome conforme o sistema operacional, com fallback ao navegador padrão.
 * @returns {Promise<void>} Conclui a tentativa de abertura.
 */
const openBrowser = async () => {
    if (process.platform === 'win32') {
        const chromeCandidates = [
            process.env.PROGRAMFILES &&
                path.join(
                    process.env.PROGRAMFILES,
                    'Google',
                    'Chrome',
                    'Application',
                    'chrome.exe'
                ),
            process.env['PROGRAMFILES(X86)'] &&
                path.join(
                    process.env['PROGRAMFILES(X86)'],
                    'Google',
                    'Chrome',
                    'Application',
                    'chrome.exe'
                ),
            process.env.LOCALAPPDATA &&
                path.join(
                    process.env.LOCALAPPDATA,
                    'Google',
                    'Chrome',
                    'Application',
                    'chrome.exe'
                ),
        ].filter(Boolean);
        const chromePath = chromeCandidates.find((candidate) =>
            fs.existsSync(candidate)
        );
        const chromeOnPath =
            !chromePath &&
            spawnSync('where.exe', ['chrome'], { windowsHide: true }).status ===
                0;
        try {
            if (chromePath) {
                await runCommand('cmd.exe', [
                    '/c',
                    `start "" "${chromePath}" "${pageUrl}"`,
                ]);
                return;
            }
            if (chromeOnPath) {
                await runCommand('cmd.exe', [
                    '/c',
                    `start "" chrome "${pageUrl}"`,
                ]);
                return;
            }
        } catch {
            // Se o comando do Chrome não estiver disponível, usa o navegador padrão.
        }
        await runCommand('cmd.exe', ['/c', `start "" "${pageUrl}"`]);
        return;
    }

    if (process.platform === 'darwin') {
        const chromeAppCandidates = [
            '/Applications/Google Chrome.app',
            path.join(
                process.env.HOME || '',
                'Applications',
                'Google Chrome.app'
            ),
        ];
        const chromeInstalled = chromeAppCandidates.some((candidate) =>
            fs.existsSync(candidate)
        );
        try {
            if (!chromeInstalled)
                throw new Error('Google Chrome não encontrado.');
            await runCommand('open', ['-a', 'Google Chrome', pageUrl]);
            return;
        } catch {
            await runCommand('open', [pageUrl]);
            return;
        }
    }

    const chromeInstalled =
        spawnSync('which', ['google-chrome'], { stdio: 'ignore' }).status === 0;
    try {
        if (!chromeInstalled) throw new Error('Google Chrome não encontrado.');
        await runCommand('google-chrome', [pageUrl]);
    } catch {
        await runCommand('xdg-open', [pageUrl]);
    }
};

// ------------------------------------------------------------
// INICIALIZAÇÃO: valida porta, aguarda banco e inicia navegador
// ------------------------------------------------------------
/**
 * Executar o fluxo de espera e abertura, exibindo mensagens sem dados sensíveis.
 * @returns {Promise<void>} Define código de saída diferente de zero se não abrir.
 */
const main = async () => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT deve ser um número entre 1 e 65535.');
    }

    console.info(`Aguardando o servidor e o MongoDB em ${healthUrl}...`);
    await waitForHealth();
    console.info(`Aplicação saudável. Abrindo ${pageUrl} no navegador...`);
    await openBrowser();
    console.info('Comando de abertura do navegador concluído.');
};

main().catch((error) => {
    console.error(`Não foi possível abrir o projeto: ${error.message}`);
    process.exitCode = 1;
});
