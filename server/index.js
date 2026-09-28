require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authMiddleware = require('./middleware/auth');
const deviceRoutes = require('./routes/devices');
const smsRoutes = require('./routes/sms');
const firebaseRoutes = require('./routes/firebase');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/sms', authMiddleware, smsRoutes);
app.use('/api/firebase', authMiddleware, firebaseRoutes);
app.post('/api/checkin', require('./routes/checkin'));

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);
  socket.on('subscribe_device', (deviceId) => {
    socket.join(`device:${deviceId}`);
  });
  socket.on('disconnect', () => {
    console.log('Admin disconnected:', socket.id);
  });
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/boom_panel', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`BOOM Panel running on :${PORT}`));
}).catch(err => {
  console.error('DB connection failed:', err);
  process.exit(1);
});

module.exports = { io };
