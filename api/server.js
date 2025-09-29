import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cors from 'cors';

import autorizacionRouter from './routes_autorizacion.js';
import registroRouter from './routes_registro.js';
import jwksHandler from './jwks_route.js';
import latidoRouter from './routes_latido.js';
import solicitudesRouter from './routes_solicitudes.js';
import adminRouter from './routes_admin.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
app.use(pinoHttp({
  logger,
  redact: {
    paths: [
      'req.headers["x-api-key"]',
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

app.get('/healthz', (req, res) =>
  res.status(200).json({ ok: true, ts: new Date().toISOString() })
);
app.get('/.well-known/jwks.json', jwksHandler);

// Rutas
app.use('/registro', registroRouter);
app.use('/autorizacion', autorizacionRouter);
app.use('/v1', solicitudesRouter);  // <- para /v1/solicitudes/alta
app.use('/v1', adminRouter);
app.use('/v1', latidoRouter);

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'API listening');
});
