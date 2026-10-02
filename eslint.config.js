// ------------------------------------------------------------
// IMPORTS: regras recomendadas e globais dos runtimes suportados
// ------------------------------------------------------------
const js = require('@eslint/js');
const globals = require('globals');

// ------------------------------------------------------------
// CONFIGURAÇÃO: separa as regras dos módulos Node e scripts do navegador
// ------------------------------------------------------------
module.exports = [
    {
        ignores: ['node_modules/**', 'coverage/**'],
    },
    js.configs.recommended,
    {
        files: [
            'src/**/*.js',
            'test/**/*.js',
            'scripts/**/*.js',
            'eslint.config.js',
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: globals.browser,
        },
    },
];
