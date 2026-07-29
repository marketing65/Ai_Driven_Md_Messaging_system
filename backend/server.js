import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import hpp from 'hpp';

// DB initialization
import { initializeDatabase } from './config/db.js';
import { testSupabaseConnection } from './config/supabase.js';
import { startScheduler } from './services/scheduler.js';

// Route imports
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import questionsRouter from './routes/questions.js';
import notificationsRouter from './routes/notifications.js';
import analyticsRouter from './routes/analytics.js';

// Security Middlewares
import { apiLimiter, authLimiter, xssSanitizer } from './middleware/security.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Safe CORS Origins Configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server or curl requests (origin undefined)
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy (Production security)'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Store socket io instance to express app context
app.set('socketio', io);

// ── Security Hardening Middlewares ───────────────────────────────
app.use(helmet()); // Enforce secure HTTP headers (XSS, Clickjacking, MIME checks)
app.use(hpp()); // Prevent HTTP Parameter Pollution attacks
app.use(cors(corsOptions)); // Enforce CORS domain restrictions
app.use(express.json({ limit: '10mb' })); // Rate-limit payload size to prevent body parsing overflows
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(xssSanitizer); // Sanitize and strip malicious XSS executable script inputs

// Serve static assets / uploads if needed
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API routes with targeted rate-limiters
app.use('/api', apiLimiter); // Apply general API rate limiting to all requests
app.use('/api/auth', authLimiter, authRouter); // Apply strict rate limiting to Auth/OTP endpoints
app.use('/api/chat', chatRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/analytics', analyticsRouter);

// Base route
app.get('/', (req, res) => {
  res.json({ message: 'MD Knowledge Intelligence System API is running.' });
});

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User registers their room
  socket.on('join', ({ userId, role }) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`User ${userId} (${role}) joined their personal room: ${userId}`);
    }

    if (role === 'md') {
      socket.join('md-group');
      console.log(`MD ${userId} joined the shared 'md-group' room`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Start DB and Server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Test Supabase client connection
    const connected = await testSupabaseConnection();

    if (!connected) {
      console.warn('\n⚠️ [DB] WARNING: Supabase project is unreachable. Server will run, but database operations will fail.');
      console.warn('💡 Tip: Your Supabase project might be paused. Please log in to https://supabase.com/dashboard and restore it if paused.\n');
    } else {
      // 2. Initialize and seed database tables
      try {
        await initializeDatabase();
      } catch (dbInitErr) {
        console.warn(`\n⚠️ [DB] WARNING: Database verification failed: ${dbInitErr.message}`);
        console.warn('Server will continue running, but database features may not function properly.\n');
      }
    }

    // 3. Start background message scheduler
    startScheduler(io);

    server.listen(PORT, () => {
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`  🚀 Server is running!`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`  ➜ API:      http://localhost:${PORT}`);
      console.log(`  ➜ Frontend: http://localhost:5173`);
      console.log(`${'═'.repeat(50)}\n`);
    });
  } catch (err) {
    console.error('Failed to initialize server:', err.message);
    process.exit(1);
  }
}

startServer();
