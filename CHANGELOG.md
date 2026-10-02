# Changelog

## Unreleased

### Corrigido

- Reenvio de confirmação agora usa limite dedicado, invalida o token anterior e registra falhas SMTP com diagnóstico sanitizado.
- Links de confirmação são mostrados no console somente em desenvolvimento quando SMTP não está configurado.

### Adicionado

- Validação central de configuração, headers CSP/CORS, limites de body, erros JSON e encerramento gracioso.
- E-mail de recuperação via SMTP com tokens de uso único e resposta anti-enumeração.
- Sessões com cookies HttpOnly, CSRF, rotação/revogação de refresh e dashboard protegido.
- Rate limiting persistente, bloqueio temporário e validação Zod com verificação opcional de e-mail.
- Testes de integração HTTP com Supertest e MongoDB Memory Server, cobrindo autenticação, sessões, recuperação, CSRF, rate limit, headers e indisponibilidade do banco.
- Relatório de cobertura nativo via `npm run test:coverage`.
- Logging Pino/Pino HTTP com request ID, remoção de query strings do log de requisição e redaction de campos sensíveis.
- ESLint, Prettier e GitHub Actions para Node 20/22.
- Documentação de segurança e decisões/limitações do projeto.
- Configuração de e-mail de confirmação para Mailtrap e Gmail, instruções para gerar `JWT_SECRET`, LICENSE e regras comuns de editor/fim de linha.

### Alterado

- Separada a criação do app Express da inicialização do servidor para permitir testes de integração sem abrir uma porta HTTP de produção.
- Atualizados README, scripts de qualidade e instruções de desenvolvimento.
