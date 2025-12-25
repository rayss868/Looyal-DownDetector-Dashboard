const Service = require('../models/Service');
const ServiceLog = require('../models/ServiceLog');
const Incident = require('../models/Incident');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const calculateUptime = async (serviceId, startDate = null, endDate = null) => {
    // Default to today (since 00:00) if no dates provided
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : new Date();

    const logs = await ServiceLog.findAll({
        where: {
            serviceId: serviceId,
            timestamp: {
                [Op.gte]: start,
                [Op.lte]: end
            }
        },
        order: [['timestamp', 'ASC']]
    });

    // If no logs in range, check the last known status before start
    if (logs.length === 0) {
        const lastLog = await ServiceLog.findOne({
            where: {
                serviceId: serviceId,
                timestamp: { [Op.lt]: start }
            },
            order: [['timestamp', 'DESC']]
        });

        // If the last known status was outage, then uptime is 0% for this period
        if (lastLog && (lastLog.status === 'outage' || lastLog.status === 'degraded')) {
            return 0.0;
        }
        // Otherwise assume 100%
        return 100.0;
    }

    let totalDuration = 0;
    let outageDuration = 0;
    
    let lastStatus = 'operational';
    let lastTime = start;

    // Find the status just before the window if possible, otherwise assume operational
    const previousLog = await ServiceLog.findOne({
        where: {
            serviceId: serviceId,
            timestamp: { [Op.lt]: start }
        },
        order: [['timestamp', 'DESC']]
    });

    if (previousLog) {
        lastStatus = previousLog.status;
    }

    // Add a "virtual" log for the end time to close the window
    const relevantLogs = [...logs, { timestamp: end, status: 'end_of_window' }];

    for (const log of relevantLogs) {
        const currentTime = new Date(log.timestamp);
        // Ensure we don't go beyond end time (though query limits it, virtual log is exactly at end)
        const effectiveTime = currentTime > end ? end : currentTime;
        
        const duration = effectiveTime - lastTime;

        if (duration > 0) {
            if (lastStatus === 'outage' || lastStatus === 'degraded') {
                outageDuration += duration;
            }
            totalDuration += duration;
        }

        lastTime = effectiveTime;
        
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
            .filter(s => s.uptime < 100)
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
        const { group, start, end } = req.query;

        if (group === 'day') {
            const now = new Date();
            let startDate, endDate;

            if (start && end) {
                startDate = new Date(start);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Default to last 45 days
                startDate = new Date();
                startDate.setDate(now.getDate() - 44);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
            }

            // Calculate number of days in range
            const diffTime = Math.abs(endDate - startDate);
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const dailyStats = [];

            // Fetch all logs in the range
            const logs = await ServiceLog.findAll({
                where: {
                    serviceId: id,
                    timestamp: {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate
                    }
                },
                order: [['timestamp', 'ASC']]
            });

            // Fetch the last status BEFORE the range to determine initial state
            const previousLog = await ServiceLog.findOne({
                where: {
                    serviceId: id,
                    timestamp: { [Op.lt]: startDate }
                },
                order: [['timestamp', 'DESC']]
            });

            // Default to 'unknown' if no history, to distinguish "no data" from "outage"
            // Default to 'unknown' if no history, to distinguish "no data" from "operational"
            let currentStatus = previousLog ? previousLog.status : 'unknown';

            for (let i = 0; i < days; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                
                const dayStart = new Date(date);
                dayStart.setHours(0, 0, 0, 0);
                
                const dayEnd = new Date(date);
                dayEnd.setHours(23, 59, 59, 999);
                
                // Cap end time to now if it's today (or future)
                const effectiveEnd = (dayEnd > now) ? now : dayEnd;
                
                if (dayStart > now) break;

                // Filter logs for this day
                const dayLogs = logs.filter(l => {
                    const t = new Date(l.timestamp);
                    return t >= dayStart && t <= dayEnd;
                });

                // Handle "No Data" case: No logs today AND status is unknown (no prior history)
                if (dayLogs.length === 0 && currentStatus === 'unknown') {
                    dailyStats.push({
                        date: dayStart.toISOString().split('T')[0],
                        uptime: null,
                        status: 'no_data'
                    });
                    continue;
                }

                // Calculate uptime for this day
                let totalDuration = effectiveEnd - dayStart;
                if (totalDuration < 0) totalDuration = 0;
                
                let outageDuration = 0;
                let lastTime = dayStart;
                let tempStatus = currentStatus;

                // Add a virtual log at the end to close the loop
                const processingLogs = [...dayLogs, { timestamp: effectiveEnd, status: 'end_of_day' }];

                for (const log of processingLogs) {
                    const logTime = new Date(log.timestamp);
                    const effectiveLogTime = logTime > effectiveEnd ? effectiveEnd : logTime;
                    
                    const duration = effectiveLogTime - lastTime;
                    
                    if (duration > 0) {
                        // Treat 'unknown' as 'operational' (or at least NOT 'outage')
                        // to avoid punishing new services with no history.
                        if (tempStatus === 'outage' || tempStatus === 'degraded') {
                            outageDuration += duration;
                        }
                    }

                    lastTime = effectiveLogTime;
                    if (log.status !== 'end_of_day') {
                        tempStatus = log.status;
                    }
                }

                // Update currentStatus for the next day
                if (dayLogs.length > 0) {
                    currentStatus = dayLogs[dayLogs.length - 1].status;
                }

                let uptime = 0;
                if (totalDuration > 0) {
                    uptime = ((totalDuration - outageDuration) / totalDuration) * 100;
                } else {
                    uptime = (currentStatus === 'operational') ? 100 : 0;
                }
                
                uptime = parseFloat(Math.max(0, Math.min(100, uptime)).toFixed(2));

                let statusLabel = 'operational';
                if (uptime < 100 && uptime >= 70) statusLabel = 'degraded';
                if (uptime < 70) statusLabel = 'outage';

                dailyStats.push({
                    date: dayStart.toISOString().split('T')[0],
                    uptime,
                    status: statusLabel
                });
            }
            
            return res.json(dailyStats);
        }

        // Default: Fetch raw logs for the last 90 days
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

        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);

        // Fetch logs for the range
        const logs = await ServiceLog.findAll({
            where: {
                serviceId: id,
                timestamp: { [Op.gte]: start, [Op.lte]: end }
            },
            order: [['timestamp', 'ASC']]
        });

        // Calculate Average Uptime only for days where data exists
        // This prevents the percentage from being diluted by empty historical days.
        let displayUptime = "100.00";
        if (logs.length > 0) {
            // Find the actual date of the FIRST recorded ping
            const firstLogDate = new Date(logs[0].timestamp);
            const actualStart = firstLogDate > start ? firstLogDate : start;
            
            const accurateUptimeValue = await calculateUptime(id, actualStart, end);
            displayUptime = accurateUptimeValue.toFixed(2);
        }

        if (format === 'pdf') {
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${service.name}-recap.pdf"`);
            doc.pipe(res);

            doc.fontSize(24).font('Helvetica-Bold').text('Looyal Status Recap', { align: 'center' });
            doc.moveDown();
            
            doc.rect(50, 100, 500, 80).stroke();
            doc.fontSize(14).font('Helvetica-Bold').text(`Service: ${service.name}`, 70, 120);
            doc.fontSize(12).font('Helvetica').text(`Period: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`, 70, 145);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 70, 165);
            
            doc.moveDown(6);

            doc.fontSize(16).font('Helvetica-Bold').text('Performance Summary');
            doc.moveDown(0.5);
            
            doc.fontSize(12).font('Helvetica');
            doc.text(`Total Checks: ${logs.length}`);
            doc.text(`Outage Events: ${logs.filter(l => l.status === 'outage').length}`);
            doc.text(`Estimated Uptime: ${displayUptime}%`);
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

            sheet.addRow(['Service', service.name]);
            sheet.addRow(['Period', `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`]);
            sheet.addRow(['Uptime Percentage', `${displayUptime}%`]);
            sheet.addRow(['Total Checks', logs.length]);
            sheet.addRow([]); // Empty row

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