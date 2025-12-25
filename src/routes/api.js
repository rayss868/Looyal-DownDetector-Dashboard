const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const incidentController = require('../controllers/incidentController');
const webhookController = require('../controllers/webhookController');
const settingsController = require('../controllers/settingsController');
const systemController = require('../controllers/systemController');

// Service Routes
router.get('/analytics', serviceController.getAnalytics);
router.get('/services', serviceController.getAllServices);
router.post('/services', serviceController.createService);
router.put('/services/:id', serviceController.updateService);
router.delete('/services/:id', serviceController.deleteService);
router.get('/services/:id/history', serviceController.getServiceHistory);
router.get('/services/:id/recap', serviceController.downloadRecap);

// Incident Routes
router.get('/incidents', incidentController.getAllIncidents);
router.post('/incidents', incidentController.createIncident);
router.put('/incidents/:id', incidentController.updateIncident);
router.delete('/incidents/:id', incidentController.deleteIncident);

// Webhook Routes
router.get('/webhooks', webhookController.getAllWebhooks);
router.post('/webhooks', webhookController.createWebhook);
router.put('/webhooks/:id', webhookController.updateWebhook);
router.delete('/webhooks/:id', webhookController.deleteWebhook);

// Settings Routes
router.get('/settings', settingsController.getSettings);
router.put('/settings', settingsController.updateSettings);

// System Routes
router.post('/system/sync-db', systemController.syncDatabase);

module.exports = router;