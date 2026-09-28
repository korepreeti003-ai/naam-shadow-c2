require('./db'); // initialise DB on startup

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const verificationRoutes = require('./routes/verification');
const adminRoutes        = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve admin panel static files
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// API routes
app.use('/api/verification', verificationRoutes);
app.use('/api/admin',        adminRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', demo: process.env.NODE_ENV !== 'production' });
});

app.listen(PORT, () => {
  const mode = process.env.NODE_ENV !== 'production' ? '[DEMO MODE]' : '[PRODUCTION]';
  console.log(`BOOM PANEL backend ${mode} running on port ${PORT}`);
});
