const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const token = authorization.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'auth-system',
            audience: 'auth-client',
        });
        if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};
