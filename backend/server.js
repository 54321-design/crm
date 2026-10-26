require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is missing in .env'); process.exit(1); }

const app = express();
app.set('trust proxy', 1); // correct client IP behind Vercel/Railway/Nginx (login rate limit)
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/webhooks', require('./src/routes/webhooks'));
app.use('/api/sync', require('./src/routes/sync'));
app.use('/api/leads', require('./src/routes/leads'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/workflows', require('./src/routes/workflows'));
app.use('/api/team', require('./src/routes/team'));
app.use('/api/activity', require('./src/routes/activity'));
app.use('/api/outreach', require('./src/routes/outreach'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use((err, req, res, next) => {
  const code = err.status || 500;
  if (code >= 500) console.error(err); // 4xx are normal validation/permission responses
  res.status(code).json({ success: false, message: code < 500 ? err.message : 'Internal server error' });
});

module.exports = app; // Vercel imports the app; locally and on Railway it is started below

if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`CRM API running on port ${port}`);
    if (process.env.DISABLE_CRON !== '1') require('./src/jobs/syncJob').start();
  });
}
