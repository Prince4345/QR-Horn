import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import vehiclesRouter from './routes/vehicles.js';
import scanRouter from './routes/scan.js';
import authRouter from './routes/auth.js';
import callsRouter from './routes/calls.js';
import chatRouter from './routes/chat.js';
import nativeAuthCallbackRouter from './routes/nativeAuthCallback.js';
import { attachFrontend } from './serveFrontend.js';
import { prisma } from './lib/prisma.js';
import { initSocketServer } from './socket.js';
import { runChatCleanup } from './lib/chatSessions.js';
import { APP_NAME } from './lib/brand.js';
import { resolveCorsOrigins } from './lib/corsOrigins.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
const corsOrigins = resolveCorsOrigins(isProd);
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

if (!isProd) {
  app.get('/', (_req, res) => {
    res.json({
      name: `${APP_NAME} API`,
      status: 'running',
      app: 'Open http://localhost:3000 for the web app',
      health: '/api/health',
      voice: 'WebRTC in-app calls via socket.io',
    });
  });
}

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/scan', scanRouter);
app.use('/api/calls', callsRouter);
app.use('/api/chat', chatRouter);

// Must be before SPA catch-all — Capacitor Google OAuth bridge
app.use('/auth', nativeAuthCallbackRouter);

if (isProd) {
  attachFrontend(app);
}

const httpServer = createServer(app);
initSocketServer(httpServer);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop other "npm run dev" terminals, then restart.`);
    process.exit(1);
  }
  throw err;
});

const shutdown = () => {
  httpServer.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`${APP_NAME} API running on port ${PORT}${isProd ? ' (production)' : ''}`);
  if (!isProd) {
    console.log('Dev: open http://localhost:3000 (Vite proxies API)');
  }
});

// Keep Render's free tier awake by pinging our own public URL.
// Set KEEP_ALIVE_URL to the live site (e.g. https://qr-horn.onrender.com).
// An external monitor (UptimeRobot) is still recommended — see DEPLOY.md.
const keepAliveUrl = process.env.KEEP_ALIVE_URL?.trim();
if (isProd && keepAliveUrl) {
  const ping = async () => {
    try {
      await fetch(`${keepAliveUrl.replace(/\/$/, '')}/api/health`);
    } catch {
      // network hiccup — next ping will retry
    }
  };
  setInterval(ping, 10 * 60 * 1000);
  console.log(`Keep-alive ping enabled → ${keepAliveUrl}/api/health every 10 min`);
}

void runChatCleanup();
setInterval(() => {
  void runChatCleanup();
}, 60 * 60 * 1000);
