# Auth System

Sistema de autenticação full-stack desenvolvido para demonstrar um fluxo seguro e profissional de cadastro, login, recuperação de senha e acesso a uma área protegida.

O projeto combina uma API Node.js organizada com um frontend vanilla responsivo, apresentando visualmente as decisões de segurança que protegem cada etapa da autenticação.

## Funcionalidades

- Cadastro de usuários com nome, e-mail e senha
- Login com emissão de token JWT
- Dashboard protegido por autenticação
- Logout no frontend
- Recuperação de senha com token opaco de uso único
- Redefinição de senha com expiração
- Validação de dados no backend e frontend
- Feedback de carregamento, sucesso e erro na interface
- Endpoint de saúde da aplicação em `/health`
- Interface responsiva com identidade visual técnica de “blueprint de segurança”

## Stack

- **Node.js** — runtime JavaScript
- **Express** — API HTTP e servidor de arquivos estáticos
- **MongoDB Atlas** — persistência de usuários
- **Mongoose** — modelagem e acesso ao MongoDB
- **JWT** — tokens de acesso com expiração
- **bcrypt** — hash seguro de senhas
- **HTML, CSS e JavaScript vanilla** — frontend sem frameworks
- **Node Test Runner** — testes automatizados básicos

## Segurança implementada

- Senhas armazenadas somente como hashes bcrypt
- Custo bcrypt configurado em 12
- Access tokens JWT com expiração curta de 15 minutos
- Validação de `issuer`, `audience` e algoritmo do JWT
- Separação entre access tokens e tokens de recuperação
- Tokens de recuperação aleatórios, armazenados somente como hash
- Tokens de recuperação com expiração e uso único
- Rate limiting para login e recuperação de senha
- Respostas neutras para reduzir enumeração de contas
- Campos sensíveis ocultos por padrão nas consultas do Mongoose
- Validação de e-mail, senha, nome e tamanho do corpo JSON
- Segredos mantidos em variáveis de ambiente

## Estrutura principal

```text
.
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── forgot-password.html
│   ├── reset-password.html
│   ├── dashboard.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── server.js
├── test/
├── .env.example
└── package.json
```

## Como executar localmente

### Pré-requisitos

- Node.js 18 ou superior
- Uma instância do MongoDB Atlas
- npm

### 1. Clone o projeto

```bash
git clone https://github.com/SEU_USUARIO/auth-system.git
cd auth-system
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo de exemplo:

```bash
copy .env.example .env
```

No macOS/Linux:

```bash
cp .env.example .env
```

Preencha o `.env`:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/auth-system?retryWrites=true&w=majority
JWT_SECRET=um-segredo-aleatorio-com-pelo-menos-32-caracteres
RESET_PASSWORD_URL=http://localhost:3000/reset-password
PORT=3000
```

Nunca publique o `.env` ou credenciais reais.

### 4. Inicie o servidor

```bash
npm start
```

Para desenvolvimento com reinicialização automática:

```bash
npm run dev
```

Abra no navegador:

```text
http://localhost:3000
```

Valide o estado do servidor e do banco:

```text
http://localhost:3000/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Testes

Execute:

```bash
npm test
```

Os testes atuais cobrem o middleware de autenticação e configurações importantes do model de usuário.


## Rotas principais

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Verifica servidor e conexão com o banco |
| `POST` | `/api/auth/register` | Cria uma conta |
| `POST` | `/api/auth/login` | Autentica o usuário |
| `POST` | `/api/auth/forgot-password` | Solicita recuperação |
| `POST` | `/api/auth/reset-password` | Redefine a senha |
| `GET` | `/api/auth/profile` | Retorna o perfil autenticado |

## Possíveis melhorias futuras

- Integrar um provedor real de e-mail transacional
- Implementar refresh tokens rotativos e revogáveis
- Migrar o rate limiting para Redis em ambientes com múltiplas instâncias
- Adicionar testes de integração para todas as rotas
- Adicionar testes end-to-end do fluxo completo no navegador
- Criar pipeline de CI com testes, lint e verificação de segredos
- Adicionar observabilidade estruturada e métricas
- Adicionar gerenciamento de sessões e revogação por dispositivo

## Licença

Projeto demonstrativo para fins de portfólio e estudo.
