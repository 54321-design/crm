const cron = require('node-cron');
const { runSync, isConnected } = require('../services/sheetSync');

function start() {
  const expr = process.env.SYNC_CRON || '*/5 * * * *';
  cron.schedule(expr, async () => {
    if (!isConnected()) return;
    try {
      const r = await runSync('schedule');
      if (r.status !== 'skipped') console.log(`[sync] ${r.status}: ${r.scanned} scanned, ${r.created} new, ${r.updated} updated, ${r.duplicate} duplicates, ${r.errors} errors`);
    } catch (err) {
      console.error('[sync] failed:', err.message);
    }
  });
  console.log(`[sync] scheduled (${expr}) - ${isConnected() ? 'sheet connected' : 'sheet NOT connected'}`);
}

module.exports = { start };
