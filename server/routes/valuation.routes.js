// server/routes/valuation.routes.js
const express = require('express');
const router = express.Router();
const valuationController = require('../controllers/valuation.controller');

router.get('/', valuationController.getValuations);
router.put('/:indexCode/:metric', valuationController.upsertValuation);

module.exports = router;
