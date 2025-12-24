const Service = require('../models/Service');
const ServiceLog = require('../models/ServiceLog');
const Incident = require('../models/Incident');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const calculateUptime = async (serviceId) => {
    // Calculate uptime based on logs from today (since 00:00)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const logs = await ServiceLog.findAll({
        where: {
            serviceId: serviceId,
            timestamp: { [Op.gte]: todayStart }
        },
        order: [['timestamp', 'ASC']]
    });

    // If no logs today, we need to check the last known status before today
    if (logs.length === 0) {
        const lastLog = await ServiceLog.findOne({
            where: {
                serviceId: serviceId,
                timestamp: { [Op.lt]: todayStart }
            },
            order: [['timestamp', 'DESC']]
        });

        // If the last known status was outage, then uptime is 0% for today so far
        if (lastLog && (lastLog.status === 'outage' || lastLog.status === 'degraded')) {
            return 0.0;
        }
        // Otherwise assume 100%
        return 100.0;
    }

    let totalDuration = 0;
    let outageDuration = 0;
    const now = new Date();

    let lastStatus = 'operational';
    let lastTime = todayStart;

    // Find the status just before the window if possible, otherwise assume operational
    const previousLog = await ServiceLog.findOne({
        where: {
            serviceId: serviceId,
            timestamp: { [Op.lt]: todayStart }
        },
        order: [['timestamp', 'DESC']]
    });

    if (previousLog) {
        lastStatus = previousLog.status;
    }

    // Add a "virtual" log for the current time to close the window
    const relevantLogs = [...logs, { timestamp: now, status: 'end_of_window' }];

    for (const log of relevantLogs) {
        const currentTime = new Date(log.timestamp);
        const duration = currentTime - lastTime;

        if (lastStatus === 'outage' || lastStatus === 'degraded') {
            outageDuration += duration;
        }

        totalDuration += duration;
        lastTime = currentTime;
        
        if (log.status !== 'end_of_window') {
            lastStatus = log.status;
        }
    }

    if (totalDuration === 0) return 100.0;

    const uptimePercentage = ((totalDuration - outageDuration) / totalDuration) * 100;
    const safePercentage = Math.max(0, Math.min(100, uptimePercentage));
    
    return parseFloat(safePercentage.toFixed(2));
};

exports.getAnalytics = async (req, res) => {
    try {
        const services = await Service.findAll();
        const totalServices = services.length;
        
        // Calculate uptime for each service dynamically
        const servicesWithUptime = await Promise.all(services.map(async (s) => {
            const uptime = await calculateUptime(s.id);
            return { ...s.toJSON(), uptime };
        }));

        // Calculate overall uptime
        const totalUptime = servicesWithUptime.reduce((acc, s) => acc + s.uptime, 0);
        const avgUptime = totalServices > 0 ? (totalUptime / totalServices).toFixed(2) : '0.00';

        // Get recent logs for response time chart (last 24 hours)
        const oneDayAgo = new Date(new Date() - 24 * 60 * 60 * 1000);
        const recentLogs = await ServiceLog.findAll({
            where: {
                timestamp: { [Op.gte]: oneDayAgo }
            },
            order: [['timestamp', 'ASC']]
        });

        // Get incident stats
        const incidents = await Incident.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']]
        });

        // Identify unstable services (lowest uptime)
        const unstableServices = servicesWithUptime
            .sort((a, b) => a.uptime - b.uptime)
            .slice(0, 5);

        res.json({
            overview: {
                totalServices,
                avgUptime,
                activeIncidents: services.filter(s => s.status !== 'operational').length
            },
            responseTimes: recentLogs, // Frontend will process this for the chart
            recentIncidents: incidents,
            unstableServices
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllServices = async (req, res) => {
    try {
        const services = await Service.findAll();
        
        // Calculate uptime for each service dynamically
        const servicesWithUptime = await Promise.all(services.map(async (s) => {
            const uptime = await calculateUptime(s.id);
            return { ...s.toJSON(), uptime };
        }));

        res.json(servicesWithUptime);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getServiceHistory = async (req, res) => {
    try {
        const { id } = req.params;
        // Fetch logs for the last 90 days (or less)
        const logs = await ServiceLog.findAll({
            where: {
                serviceId: id,
                timestamp: {
                    [Op.gte]: new Date(new Date() - 90 * 24 * 60 * 60 * 1000)
                }
            },
            order: [['timestamp', 'ASC']]
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createService = async (req, res) => {
    try {
        const service = await Service.create(req.body);
        res.status(201).json(service);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateService = async (req, res) => {
    try {
        const service = await Service.findByPk(req.params.id);
        if (!service) return res.status(404).json({ message: 'Service not found' });
        await service.update(req.body);
        res.json(service);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteService = async (req, res) => {
    try {
        const service = await Service.findByPk(req.params.id);
        if (!service) return res.status(404).json({ message: 'Service not found' });
        await service.destroy();
        res.json({ message: 'Service deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.downloadRecap = async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, format } = req.query;

        const service = await Service.findByPk(id);
        if (!service) return res.status(404).json({ message: 'Service not found' });

        // Parse dates assuming YYYY-MM-DD format which defaults to UTC midnight
        const start = new Date(startDate);
        // Ensure start is at 00:00:00.000 UTC
        if (!isNaN(start.getTime())) {
            start.setUTCHours(0, 0, 0, 0);
        }

        const end = new Date(endDate);
        // Ensure end is at 23:59:59.999 UTC
        if (!isNaN(end.getTime())) {
            end.setUTCHours(23, 59, 59, 999);
        }

        console.log(`[DownloadRecap] Fetching logs for Service ${id} from ${start.toISOString()} to ${end.toISOString()}`);

        // Debug: Check total logs for this service without date filter
        const totalServiceLogs = await ServiceLog.count({ where: { serviceId: id } });
        console.log(`[DownloadRecap] Total logs for service ${id} in DB: ${totalServiceLogs}`);

        const logs = await ServiceLog.findAll({
            where: {
                serviceId: id,
                timestamp: {
                    [Op.gte]: start,
                    [Op.lte]: end
                }
            },
            order: [['timestamp', 'ASC']]
        });

        console.log(`[DownloadRecap] Found ${logs.length} logs in range.`);

        if (format === 'pdf') {
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${service.name}-recap.pdf"`);
            
            doc.pipe(res);

            // Header
            doc.fontSize(24).font('Helvetica-Bold').text('Looyal Status Recap', { align: 'center' });
            doc.moveDown();
            
            // Service Info Box
            doc.rect(50, 100, 500, 80).stroke();
            doc.fontSize(14).font('Helvetica-Bold').text(`Service: ${service.name}`, 70, 120);
            doc.fontSize(12).font('Helvetica').text(`Period: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`, 70, 145);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 70, 165);
            
            doc.moveDown(6);

            // Summary Stats
            const totalLogs = logs.length;
            const outageLogs = logs.filter(l => l.status === 'outage').length;
            const uptime = totalLogs > 0 ? ((totalLogs - outageLogs) / totalLogs * 100).toFixed(2) : 100;
            
            doc.fontSize(16).font('Helvetica-Bold').text('Performance Summary');
            doc.moveDown(0.5);
            
            doc.fontSize(12).font('Helvetica');
            doc.text(`Total Checks: ${totalLogs}`);
            doc.text(`Outage Events: ${outageLogs}`);
            doc.text(`Estimated Uptime: ${uptime}%`);
            doc.moveDown(2);

            // Logs Table
            doc.fontSize(16).font('Helvetica-Bold').text('Logs History');
            doc.moveDown(0.5);
            
            // Use all logs, reversed to show newest first
            const recentLogs = logs.reverse();
            
            let y = doc.y;
            
            // Table Header
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Timestamp', 50, y);
            doc.text('Status', 250, y);
            doc.text('Response Time', 400, y);
            
            y += 20;
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 10;

            doc.font('Helvetica');
            recentLogs.forEach(log => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                const time = new Date(log.timestamp).toLocaleString();
                const status = log.status.toUpperCase();
                const color = status === 'OPERATIONAL' ? 'green' : 'red';
                
                doc.fillColor('black').text(time, 50, y);
                doc.fillColor(color).text(status, 250, y);
                doc.fillColor('black').text(`${log.responseTime || 0}ms`, 400, y);
                
                y += 20;
            });

            doc.end();

        } else if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Service Logs');

            sheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 25 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Response Time (ms)', key: 'responseTime', width: 20 }
            ];

            logs.forEach(log => {
                sheet.addRow({
                    timestamp: new Date(log.timestamp).toLocaleString(),
                    status: log.status,
                    responseTime: log.responseTime
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${service.name}-recap.xlsx"`);

            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).json({ message: 'Invalid format' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};