// api/routes_solicitudes.js
import express from 'express';
import db from './db.js';
import { requireApiKey } from './middleware_apiKey.js';
import { requireJwt } from './middleware_auth.js';

const router = express.Router();
const SOL_TABLE = process.env.SOLICITUDES_TABLE || 'solicitudes';

// POST /v1/solicitudes/alta  (lo llama la app Tokengas POS)
router.post('/solicitudes/alta', requireApiKey, requireJwt, async (req, res) => {
  try {
    const device_id = req.auth?.sub;            // viene del JWT de enrolamiento
    const client_id = req.auth?.cid || 'unknown';
    if (!device_id) return res.status(400).json({ error: 'missing_sub' });

    // payload libre que manda la app (validación básica)
    const { modelo, so, ubicacion, lat, lon } = req.body || {};
    const latNum = lat === undefined || lat === null ? null : Number(lat);
    const lonNum = lon === undefined || lon === null ? null : Number(lon);
    if (latNum !== null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)) {
      return res.status(400).json({ error: 'invalid_lat' });
    }
    if (lonNum !== null && (Number.isNaN(lonNum) || lonNum < -180 || lonNum > 180)) {
      return res.status(400).json({ error: 'invalid_lon' });
    }

    // idempotencia: si ya hay una pending para este device, regrésala
    const existing = await db(SOL_TABLE).where({ device_id, estado: 'pending' }).first();
    if (existing) {
      return res.status(200).json({ ok: true, solicitud_id: existing.id, estado: existing.estado });
    }

    // crea fila
    const [row] = await db(SOL_TABLE)
      .insert({
        device_id,
        client_id,
        modelo: modelo || null,
        so: so || null,
        ubicacion: ubicacion || null,
        lat: latNum,
        lon: lonNum,
        estado: 'pending',
      })
      .returning(['id', 'estado', 'creado_en']);

    // auditoría (best effort)
    try {
      await db('auditoria_eventos').insert({
        device_id,
        tipo: 'solicitud_alta',
        payload: { id: row.id, client_id, modelo: modelo || null, so: so || null },
      });
    } catch (_) {}

    return res.status(201).json({ ok: true, solicitud_id: row.id, estado: row.estado });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// (Opcional) la app puede consultar su estado actual
router.get('/solicitudes/mias', requireApiKey, requireJwt, async (req, res) => {
  try {
    const device_id = req.auth?.sub;
    if (!device_id) return res.status(400).json({ error: 'missing_sub' });

    const rows = await db(SOL_TABLE)
      .where({ device_id })
      .orderBy('creado_en', 'desc')
      .limit(10);

    return res.json({ ok: true, items: rows });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
