import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import vehiclesRouter from './routes/vehicles.js';
import scanRouter from './routes/scan.js';
import authRouter from './routes/auth.js';
import { attachFrontend } from './serveFrontend.js';
import { prisma } from './lib/prisma.js';
import { initSocketServer } from './socket.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';
const CORS_ORIGIN =
  process.env.CORS_ORIGIN ?? (isProd ? '' : 'http://localhost:3000');

app.set('trust proxy', 1);
const corsOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));

if (!isProd) {
  app.get('/', (_req, res) => {
    res.json({
      name: 'QRHorn API',
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
  console.log(`QRHorn API running on port ${PORT}${isProd ? ' (production)' : ''}`);
  if (!isProd) {
    console.log('Dev: open http://localhost:3000 (Vite proxies API)');
  }
});
