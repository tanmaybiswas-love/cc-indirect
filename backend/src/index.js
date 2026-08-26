const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const aiRoutes = require('./routes/ai');
const projectRoutes = require('./routes/projects');
const authRoutes = require('./routes/auth');
const { errorHandler } = require('./middleware/error');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/projects', projectRoutes);

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-project', (projectId) => {
    socket.join(projectId);
  });

  socket.on('chat-message', async (data) => {
    // Broadcast to project room
    socket.to(data.projectId).emit('chat-message', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`CC - indirect API running on port ${PORT}`);
});

module.exports = { io };
