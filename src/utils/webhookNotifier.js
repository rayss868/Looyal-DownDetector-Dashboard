const axios = require('axios');
const Webhook = require('../models/Webhook');

const sendNotification = async (title, message, color = 3066993) => {
    try {
        const webhooks = await Webhook.findAll({ where: { active: true } });
        
        for (const webhook of webhooks) {
            try {
                if (webhook.type === 'discord') {
                    await axios.post(webhook.url, {
                        embeds: [{
                            title: title,
                            description: message,
                            color: color,
                            timestamp: new Date().toISOString()
                        }]
                    });
                } else if (webhook.type === 'slack') {
                    await axios.post(webhook.url, {
                        text: `*${title}*\n${message}`
                    });
                } else {
                    // Custom/Generic webhook
                    await axios.post(webhook.url, {
                        event: title,
                        message: message,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err) {
                console.error(`[WebhookNotifier] Failed to send to ${webhook.name}: ${err.message}`);
            }
        }
    } catch (error) {
        console.error(`[WebhookNotifier] Error fetching webhooks: ${error.message}`);
    }
};

module.exports = { sendNotification };