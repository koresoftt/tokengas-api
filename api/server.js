import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cors from 'cors';
import { randomUUID } from 'crypto';

import autorizacionRouter from './routes_autorizacion.js';
import registroRouter from './routes_registro.js';
import jwksHandler from './jwks_route.js';
import latidoRouter from './routes_latido.js';
import solicitudesRouter from './routes_solicitudes.js';
import adminRouter from './routes_admin.js';

const PORT = Number(process.env.PORT || 3001);
const APP_VERSION = process.env.APP_VERSION || 'v0';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

app.use(helmet({ crossOriginResourcePolicy: false }));

const corsOptions = {
  origin: (origin, cb) => {
    if (ALLOWED_ORIGINS.includes('*') || !origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
  allowedHeaders: ['Content-Type','Authorization','X-API-Key'],
  maxAge: 600
};
app.use(cors(corsOptions));

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  redact: {
    paths: [
      'req.headers["x-api-key"]',
      'req.headers.x-api-key',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]'
    ],
    censor: '[REDACTED]'
  }
}));

const rl = new RateLimiterMemory({ points: 60, duration: 60 });
app.use(async (req, res, next) => {
  try { await rl.consume(req.ip); next(); }
  catch { res.status(429).json({ error: 'too_many_requests' }); }
});

app.use(express.json({ limit: '64kb' }));

// Header de versión en todas las respuestas
app.use((req, res, next) => { res.setHeader('X-App-Version', APP_VERSION); next(); });

// Health y JWKS
app.get('/healthz', (req, res) =>
  res.status(200).json({ ok: true, ts: new Date().toISOString() })
);
app.get('/.well-known/jwks.json', jwksHandler);

// Rutas
app.use('/registro', registroRouter);
app.use('/autorizacion', autorizacionRouter);
app.use('/v1', solicitudesRouter);
app.use('/v1', adminRouter);
app.use('/v1', latidoRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Handler de errores
app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'server_error' });
});

// Arranque + graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'API listening');
});
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
