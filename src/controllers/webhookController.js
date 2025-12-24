const Webhook = require('../models/Webhook');

exports.getAllWebhooks = async (req, res) => {
    try {
        const webhooks = await Webhook.findAll();
        res.json(webhooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createWebhook = async (req, res) => {
    try {
        const webhook = await Webhook.create(req.body);
        res.status(201).json(webhook);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateWebhook = async (req, res) => {
    try {
        const webhook = await Webhook.findByPk(req.params.id);
        if (!webhook) return res.status(404).json({ message: 'Webhook not found' });
        await webhook.update(req.body);
        res.json(webhook);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteWebhook = async (req, res) => {
    try {
        const webhook = await Webhook.findByPk(req.params.id);
        if (!webhook) return res.status(404).json({ message: 'Webhook not found' });
        await webhook.destroy();
        res.json({ message: 'Webhook deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};