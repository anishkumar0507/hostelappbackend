import app from './app.js';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { schedulePaymentReminders } from './utils/paymentReminders.js';
import { verifyEmailTransporter } from './utils/emailService.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables with explicit path
// This ensures .env is loaded regardless of where the server is executed from
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Verify environment variables are loaded
console.log('📋 Loading environment variables...');
if (process.env.MONGO_URI) {
  console.log('✅ MONGO_URI loaded successfully');
} else {
  console.error('❌ MONGO_URI is missing from .env file');
  console.error(`   Expected .env file at: ${envPath}`);
  process.exit(1);
}

// Connect to database and start server
connectDB().then(async () => {
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on http://0.0.0.0:${PORT}`);
    console.log(`✅ Listening on http://localhost:${PORT}`);
  });

  // Verify email transporter connection at startup
  await verifyEmailTransporter();

  schedulePaymentReminders();

  // Initialize Socket.IO for real-time updates
  try {
    const { Server: IOServer } = await import('socket.io');
    const { setIO } = await import('./utils/socket.js');
    const io = new IOServer(server, {
      cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      }
    });

    setIO(io);

    io.on('connection', (socket) => {
      console.log('🔌 Socket connected:', socket.id);

      socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
      });

      socket.on('leave', (room) => {
        socket.leave(room);
        console.log(`Socket ${socket.id} left room ${room}`);
      });

      socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', socket.id, reason);
      });
    });
  } catch (err) {
    console.warn('⚠️ Socket.IO not initialized:', err?.message || err);
  }

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
  });
}).catch((err) => {
  console.error('❌ Failed to connect to database:', err);
  process.exit(1);
});
