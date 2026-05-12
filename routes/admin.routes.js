/**
 * Admin Routes - Thin Aggregator
 * Each domain is handled by its own sub-router under routes/admin/
 */

const express = require('express');
const router = express.Router();

router.use('/', require('./admin/stats.routes'));
router.use('/', require('./admin/bookings.routes'));
router.use('/', require('./admin/users.routes'));
router.use('/', require('./admin/settings.routes'));
router.use('/', require('./admin/slots.routes'));
router.use('/', require('./admin/whatsapp.routes'));
router.use('/', require('./admin/quotations.routes'));
router.use('/', require('./admin/open-events.routes'));

module.exports = router;
