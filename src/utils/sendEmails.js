module.exports = async (to, content) => {
    if (typeof to !== 'string' || typeof content !== 'string') {
        throw new TypeError('Destinatário e conteúdo do email são obrigatórios');
    }
    console.log(`Simulando envio de email para ${to}`);
};
