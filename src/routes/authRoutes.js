const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const rateLimit = require('../middlewares/rateLimit');

router.post('/register', authController.register);
router.post('/login', rateLimit(), authController.login);
router.post('/forgot-password', rateLimit({ max: 3 }), authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Rota protegida de exemplo
router.get('/private', authMiddleware, (req, res) => {
    res.json({ message: 'Acesso autorizado à rota privada!' });
});
router.get('/profile', authMiddleware, authController.profile);

module.exports = router;
