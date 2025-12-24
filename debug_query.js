const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'database.sqlite'),
    logging: console.log // Enable logging to see SQL
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
        
        const start = new Date('2025-12-23T00:00:00.000Z');
        const end = new Date('2025-12-23T23:59:59.999Z');

        console.log('--- Query with Date objects ---');
        const logsDate = await ServiceLog.findAll({
            where: {
                timestamp: {
                    [Op.gte]: start,
                    [Op.lte]: end
                }
            }
        });
        console.log(`Found: ${logsDate.length}`);

        console.log('--- Query with String (Space +00:00) ---');
        // Mimic DB format: 2025-12-23 00:00:00.000 +00:00
        const startStr = '2025-12-23 00:00:00.000 +00:00';
        const endStr = '2025-12-23 23:59:59.999 +00:00';
        
        const logsStr = await ServiceLog.findAll({
            where: {
                timestamp: {
                    [Op.gte]: startStr,
                    [Op.lte]: endStr
                }
            }
        });
        console.log(`Found: ${logsStr.length}`);

    } catch (error) {
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

check();