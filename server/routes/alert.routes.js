// server/routes/alert.routes.js
const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');

// 固定路径先于 /:id
router.get('/events/unread-count', alertController.getUnreadCount);
router.get('/events', alertController.getEvents);
router.patch('/events/:id/read', alertController.markEventRead);

router.post('/evaluate', alertController.evaluate);

router.get('/rules', alertController.getRules);
router.post('/rules', alertController.createRule);
router.get('/rules/:id', alertController.getRuleById);
router.put('/rules/:id', alertController.updateRule);
router.delete('/rules/:id', alertController.deleteRule);

module.exports = router;
