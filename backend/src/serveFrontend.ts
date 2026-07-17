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

  app.use(
    express.static(frontendDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/\.(png|jpe?g|svg|ico|webp|woff2?|mp4|webm)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  console.log(`Serving frontend from ${frontendDist}`);
}
