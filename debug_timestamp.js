const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'database.sqlite'),
    logging: false
});

const ServiceLog = sequelize.define('ServiceLog', {
    status: { type: DataTypes.STRING },
    responseTime: { type: DataTypes.INTEGER },
    timestamp: { type: DataTypes.DATE },
    serviceId: { type: DataTypes.INTEGER }
});

async function check() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const count = await ServiceLog.count();
        console.log(`Total ServiceLogs: ${count}`);

        const logs = await ServiceLog.findAll({
            limit: 5,
            order: [['timestamp', 'DESC']]
        });

        console.log('Last 5 logs:');
        logs.forEach(log => {
            console.log(`ID: ${log.id}, ServiceID: ${log.serviceId}, Timestamp: ${log.timestamp}, Type: ${typeof log.timestamp}`);
            // Check raw value if possible, but Sequelize returns Date object
        });

        // Check raw query to see stored format
        const [results] = await sequelize.query("SELECT * FROM ServiceLogs LIMIT 5");
        console.log('Raw SQL results (first 5):');
        results.forEach(r => {
            console.log(`ID: ${r.id}, ServiceID: ${r.serviceId}, Timestamp: ${r.timestamp} (Raw Type: ${typeof r.timestamp})`);
        });

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

check();