const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Incident = sequelize.define('Incident', {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'investigating' // 'investigating', 'identified', 'monitoring', 'resolved'
    },
    severity: {
        type: DataTypes.STRING,
        defaultValue: 'minor' // 'minor', 'major', 'critical'
    }
});

module.exports = Incident;