const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Service = require('./Service');

const ServiceLog = sequelize.define('ServiceLog', {
    status: {
        type: DataTypes.STRING,
        allowNull: false // 'operational', 'degraded', 'outage'
    },
    responseTime: {
        type: DataTypes.INTEGER, // in ms
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    serviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Service,
            key: 'id'
        }
    }
});

// Define Association
Service.hasMany(ServiceLog, { foreignKey: 'serviceId' });
ServiceLog.belongsTo(Service, { foreignKey: 'serviceId' });

module.exports = ServiceLog;