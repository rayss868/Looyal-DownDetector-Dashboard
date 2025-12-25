const sequelize = require('../config/database');

exports.syncDatabase = async (req, res) => {
    try {
        console.log('[System] Starting manual database synchronization...');
        await sequelize.sync({ alter: true });
        console.log('[System] Database synchronized successfully.');
        res.json({ message: 'Database synchronized successfully.' });
    } catch (error) {
        console.error('[System] Database sync error:', error);
        res.status(500).json({ message: 'Failed to synchronize database.', error: error.message });
    }
};