require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const authRoutes = require('./routes/authRoutes');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres');
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const isProduction = process.env.NODE_ENV === 'production';

const hasValidMongoUri = typeof mongoUri === 'string'
    && mongoUri.startsWith('mongodb')
    && !mongoUri.includes('<usuario>')
    && !mongoUri.includes('<senha>')
    && !mongoUri.includes('<cluster>');

console.log('Configuração carregada:', {
    PORT: port,
    MONGODB_URI: hasValidMongoUri ? 'configurada' : 'ausente ou inválida',
    JWT_SECRET: process.env.JWT_SECRET ? 'configurado' : 'ausente',
    RESET_PASSWORD_URL: process.env.RESET_PASSWORD_URL ? 'configurada' : 'padrão',
});

if (!hasValidMongoUri) {
    console.error('Erro de configuração: defina MONGODB_URI com uma URI real do MongoDB Atlas no arquivo .env.');
}

// Middleware para interpretar JSON
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? 'ok' : 'degraded',
        database: databaseReady ? 'connected' : 'disconnected',
    });
});

// Rotas
app.use('/api/auth', authRoutes);

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});

// A conexão com o banco não impede o endpoint HTTP de subir.
if (hasValidMongoUri) {
   mongoose.connect(mongoUri)
       .then(() => {
           console.log('Conectado ao MongoDB');
       })
       .catch((err) => {
           console.error('Erro ao conectar ao MongoDB:', err.message);
           if (!isProduction) console.error(err.stack);
       });
}
