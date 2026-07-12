import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express, { type Express } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Serve Vite build from Express in production (API + app on one domain). */
export function attachFrontend(app: Express) {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
    console.warn('Frontend dist not found — API only mode. Run: npm run build:prod');
    return;
  }

  app.use(express.static(frontendDist, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  console.log(`Serving frontend from ${frontendDist}`);
}
