const attempts = new Map();

module.exports = ({ windowMs = 15 * 60 * 1000, max = 5 } = {}) => (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return next();
    }
    if (current.count >= max) {
        res.set('Retry-After', Math.ceil((current.resetAt - now) / 1000));
        return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
    }
    current.count += 1;
    return next();
};
