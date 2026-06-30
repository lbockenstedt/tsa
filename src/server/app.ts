import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { loadSession } from './auth/session.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { signupRouter } from './routes/signup.routes.js';
import { assignmentRouter } from './routes/assignment.routes.js';
import { scoreRouter } from './routes/score.routes.js';
import { resultsRouter } from './routes/results.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Build the Express app. Exported so tests can import it without starting a server. */
export function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  // Allow the Vite dev server origin to carry credentials (the session cookie).
  app.use(cors({ origin: env.APP_BASE_URL, credentials: true }));
  app.use(loadSession);

  // API routes
  app.use('/api/auth', authRouter);
  app.use('/api/events', eventRouter);
  app.use('/api/signups', signupRouter);
  app.use('/api/assignments', assignmentRouter);
  app.use('/api/scores', scoreRouter);
  app.use('/api/results', resultsRouter);

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Serve the built client (production single-container). In dev, Vite serves it.
  // Compiled server lives at dist/server; built client at dist/client.
  const clientDist = path.resolve(__dirname, '../client');
  app.use(express.static(clientDist));
  // SPA fallback: non-/api routes return index.html so client-side routing works.
  app.get(/^(?!\/api).*/, (_req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use(errorHandler);
  return app;
}