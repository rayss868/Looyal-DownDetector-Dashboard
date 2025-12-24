const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Service = sequelize.define('Service', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false // e.g., 'API', 'Website', 'Database'
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'operational' // 'operational', 'degraded', 'outage'
    },
    lastChecked: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    checkInterval: {
        type: DataTypes.INTEGER,
        defaultValue: 60 // Default 60 seconds
    },
    isPaused: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
});

module.exports = Service;