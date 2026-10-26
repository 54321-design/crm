const router = require('express').Router();
const { required, roles } = require('../middleware/auth');
const sync = require('../services/sheetSync');

router.use(required);

// POST /api/sync/sheet  - "Sync Now"
router.post('/sheet', roles('admin', 'manager'), async (req, res, next) => {
  try {
    if (!sync.isConnected())
      return res.status(400).json({ success: false, message: 'Google Sheet is not connected. Set SHEET_CSV_URL in backend/.env.' });
    res.json({ success: true, result: await sync.runSync('manual') });
  } catch (e) { next(e); }
});

// GET /api/sync/status  - connected / last sync / next sync / last result
router.get('/status', async (req, res, next) => {
  try { res.json({ success: true, ...(await sync.getStatus()) }); } catch (e) { next(e); }
});

module.exports = router;
