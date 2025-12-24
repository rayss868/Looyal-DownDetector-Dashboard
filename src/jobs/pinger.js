const axios = require('axios');
const Service = require('../models/Service');
const Incident = require('../models/Incident');
const ServiceLog = require('../models/ServiceLog');
const { Op } = require('sequelize');

const checkService = async (service) => {
    try {
        const start = Date.now();
        await axios.get(service.url, { timeout: 5000 });
        const duration = Date.now() - start;

        // Check if status changed
        if (service.status !== 'operational') {
            // Log success only if status changed
            await ServiceLog.create({
                serviceId: service.id,
                status: 'operational',
                responseTime: duration
            });
        }

        // Update service status to operational
        await service.update({
            status: 'operational',
            lastChecked: new Date()
        });

        console.log(`[Pinger] ${service.name} is UP (${duration}ms)`);
    } catch (error) {
        console.error(`[Pinger] ${service.name} is DOWN: ${error.message}`);
        
        // Check if status changed
        if (service.status !== 'outage') {
            // Log failure only if status changed
            await ServiceLog.create({
                serviceId: service.id,
                status: 'outage',
                responseTime: null
            });
        }

        // Update service status to outage
        await service.update({
            status: 'outage',
            lastChecked: new Date()
        });

        // Create an incident if one doesn't exist recently (simple logic)
        const recentIncident = await Incident.findOne({
            where: {
                title: `Service Down: ${service.name}`,
                status: 'investigating'
            }
        });

        if (!recentIncident) {
            await Incident.create({
                title: `Service Down: ${service.name}`,
                description: `Automatic alert: Service ${service.name} is unreachable. Error: ${error.message}`,
                status: 'investigating',
                severity: 'critical'
            });
        }
    }
};

const startPinger = () => {
    console.log('[Pinger] Background job started...');
    
    // Check every 10 seconds (main loop)
    setInterval(async () => {
        const services = await Service.findAll();
        const now = new Date();

        services.forEach(service => {
            if (service.isPaused) return; // Skip paused services

            const lastChecked = new Date(service.lastChecked).getTime();
            const intervalMs = service.checkInterval * 1000;
            
            // If time since last check > interval, check again
            if (now.getTime() - lastChecked >= intervalMs) {
                checkService(service);
            }
        });
    }, 10000); // Main loop runs every 10s
};

module.exports = startPinger;