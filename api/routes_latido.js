// api/routes_latido.js
import express from 'express';
import db from './db.js';
import { requireApiKey } from './middleware_apiKey.js';
import { requireJwt } from './middleware_auth.js';

const router = express.Router();

/**
 * Alta de dispositivo (solicitud)
 * Requiere: X-API-Key + Bearer JWT (el de /registro/validar)
 * Body ejemplo:
 * {
 *   "modelo":"Pixel 7","so":"Android 14",
 *   "ubicacion":"CDMX - Sucursal Centro",
 *   "coordenadas":{"lat":19.4326,"lng":-99.1332},
 *   "version_app":"1.0.0"
 * }
 */
router.post('/dispositivos/alta', requireApiKey, requireJwt, async (req, res) => {
  const device_id = req.auth?.sub;
  if (!device_id) return res.status(400).json({ error: 'missing_sub' });

  const meta = {
    modelo: req.body?.modelo || null,
    so: req.body?.so || null,
    ubicacion: req.body?.ubicacion || null,
    coordenadas: req.body?.coordenadas || null,
    version_app: req.body?.version_app || null
  };

  const exists = await db('devices').where({ id: device_id }).first();

  if (exists) {
    // Actualiza metadata y deja estado como esté (no forzamos)
    await db('devices').where({ id: device_id }).update({
      ultimo_latido: db.fn.now(),
      ...meta
    });
  } else {
    // Crea en estado "pendiente"
    await db('devices').insert({
      id: device_id,
      client_id: req.auth?.cid || 'unknown',
      public_key: '{"kty":"OKP","crv":"Ed25519","x":"placeholder"}',
      estado: 'pendiente',
      ultimo_latido: db.fn.now(),
      ...meta
    });
  }

  await db('auditoria_eventos').insert({
    device_id,
    tipo: exists ? 'alta_update' : 'alta_solicitada',
    payload: meta
  });

  // Reporta el estado actual para que la app sepa si puede operar
  const row = await db('devices').select('estado','suspendido_hasta').where({ id: device_id }).first();
  res.status(202).json({
    estado: row?.estado || 'pendiente',
    suspendido_hasta: row?.suspendido_hasta || null
  });
});

/**
 * Latido (heartbeat)
 * - Requiere X-API-Key + Bearer JWT
 * - Si estado != activo ⇒ 403 con motivo/estado
 */
router.post('/dispositivos/latido', requireApiKey, requireJwt, async (req, res) => {
  const scopes = Array.isArray(req.auth?.scopes) ? req.auth.scopes : [];
  if (!scopes.includes('devices:heartbeat')) {
    return res.status(403).json({ error: 'insufficient_scope' });
  }

  const device_id = req.auth?.sub;
  if (!device_id) return res.status(400).json({ error: 'missing_sub' });

  let d = await db('devices').where({ id: device_id }).first();

  if (!d) {
    // Primer contacto sin alta previa → crea como "pendiente"
    await db('devices').insert({
      id: device_id,
      client_id: req.auth?.cid || 'unknown',
      public_key: '{"kty":"OKP","crv":"Ed25519","x":"placeholder"}',
      estado: 'pendiente',
      ultimo_latido: db.fn.now()
    });
    d = await db('devices').where({ id: device_id }).first();
  }

  // Cumplimiento de estado
  const now = new Date();
  if (d.estado === 'baja') {
    return res.status(403).json({ error: 'device_terminated', estado: d.estado });
  }
  if (d.estado === 'rechazado') {
    return res.status(403).json({ error: 'device_rejected', estado: d.estado });
  }
  if (d.estado === 'pendiente') {
    return res.status(403).json({ error: 'device_pending_approval', estado: d.estado });
  }
  if (d.estado === 'suspendido') {
    if (d.suspendido_hasta && new Date(d.suspendido_hasta) > now) {
      return res.status(403).json({
        error: 'device_suspended',
        estado: d.estado,
        suspendido_hasta: d.suspendido_hasta
      });
    }
    // Si la suspensión caducó, podrías reactivarlo automático aquí.
    // Por ahora conservamos 'suspendido' hasta una reactivación explícita.
    return res.status(403).json({ error: 'device_suspended', estado: d.estado, suspendido_hasta: d.suspendido_hasta || null });
  }

  // Activo → actualiza latido
  await db('devices').where({ id: device_id }).update({ ultimo_latido: db.fn.now() });

  await db('auditoria_eventos').insert({
    device_id,
    tipo: 'latido',
    payload: { jti: req.auth?.jti || null }
  });

  const estadoRow = await db('devices').select('estado').where({ id: device_id }).first();
  res.json({
    intervalo: 60,
    renovar_desde: req.auth?.renew_from || null,
    estado: estadoRow?.estado || 'activo'
  });
});

export default router;
