const Setting = require('../models/Setting');

exports.getSettings = async (req, res) => {
    try {
        const settings = await Setting.findAll();
        // Convert array of objects to a single object: { key: value }
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        
        // Provide defaults if missing
        const defaults = {
            siteName: 'Looyal Status',
            logoUrl: 'https://www.looyal.id/assets/compro/img/108%20-%20looyal-logo.png',
            publicStatusPage: 'true'
        };

        res.json({ ...defaults, ...settingsMap });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const { siteName, logoUrl, publicStatusPage } = req.body;
        
        // Upsert each setting
        await Setting.upsert({ key: 'siteName', value: siteName });
        await Setting.upsert({ key: 'logoUrl', value: logoUrl });
        await Setting.upsert({ key: 'publicStatusPage', value: String(publicStatusPage) });

        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};