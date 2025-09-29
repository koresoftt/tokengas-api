import express from 'express';
import db from './db.js';
import { requireApiKey } from './middleware_apiKey.js';

const router = express.Router();
const SOL_TABLE = process.env.SOLICITUDES_TABLE || 'solicitudes';

// Salud admin
router.get('/admin/ping', requireApiKey, (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Listado con paginación: ?estado=pending|approved|rejected&limit=20&offset=0
router.get('/admin/solicitudes', requireApiKey, async (req, res) => {
  try {
    const allowed = new Set(['pending', 'approved', 'rejected']);
    const estado = req.query.estado;
    if (estado && !allowed.has(estado)) {
      return res.status(400).json({ error: 'invalid_estado' });
    }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const base = db(SOL_TABLE)
      .select('id','device_id','client_id','modelo','so','ubicacion','lat','lon','estado','creado_en','actualizado_en')
      .orderBy('creado_en','desc');
    if (estado) base.where({ estado });

    const [items, totalRow] = await Promise.all([
      base.clone().limit(limit).offset(offset),
      db(SOL_TABLE).modify(q => { if (estado) q.where({ estado }); }).count('* as n').first(),
    ]);

    res.json({ ok: true, total: Number(totalRow?.n || 0), count: items.length, items });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// Obtener una solicitud
router.get('/admin/solicitudes/:id', requireApiKey, async (req, res) => {
  try {
    const row = await db(SOL_TABLE).where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, item: row });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// Aprobar
router.post('/admin/solicitudes/:id/aprobar', requireApiKey, async (req, res) => {
  const { id } = req.params;
  try {
    await db.transaction(async trx => {
      const sol = await trx(SOL_TABLE).where({ id }).forUpdate().first();
      if (!sol) return res.status(404).json({ error: 'not_found' });
      if (sol.estado !== 'pending') return res.status(409).json({ error: 'invalid_state', estado: sol.estado });

      await trx(SOL_TABLE).where({ id }).update({ estado: 'approved', actualizado_en: trx.fn.now() });

      // Upsert del device a 'activo'
      await trx('devices')
        .insert({
          id: sol.device_id,
          client_id: sol.client_id,
          public_key: '{"kty":"OKP","crv":"Ed25519","x":"placeholder"}',
          estado: 'activo',
          ultimo_latido: trx.fn.now(),
        })
        .onConflict('id')
        .merge({ client_id: sol.client_id, estado: 'activo', ultimo_latido: trx.fn.now() });

      await trx('auditoria_eventos').insert({ device_id: sol.device_id, tipo: 'solicitud_aprobada', payload: { solicitud_id: id } });

      res.json({ ok: true, solicitud_id: id, nuevo_estado: 'approved' });
    });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// Rechazar
router.post('/admin/solicitudes/:id/rechazar', requireApiKey, async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body || {};
  try {
    await db.transaction(async trx => {
      const sol = await trx(SOL_TABLE).where({ id }).forUpdate().first();
      if (!sol) return res.status(404).json({ error: 'not_found' });
      if (sol.estado !== 'pending') return res.status(409).json({ error: 'invalid_state', estado: sol.estado });

      await trx(SOL_TABLE).where({ id }).update({
        estado: 'rejected',
        motivo: motivo || null,
        actualizado_en: trx.fn.now()
      });

      await trx('auditoria_eventos').insert({
        device_id: sol.device_id,
        tipo: 'solicitud_rechazada',
        payload: { solicitud_id: id, motivo: motivo || null }
      });

      res.json({ ok: true, solicitud_id: id, nuevo_estado: 'rejected' });
    });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// Suspender / Reactivar
router.post('/admin/dispositivos/:device_id/suspender', requireApiKey, async (req, res) => {
  try {
    const n = await db('devices').where({ id: req.params.device_id }).update({ estado: 'suspendido', ultimo_latido: db.fn.now() });
    if (!n) return res.status(404).json({ error: 'device_not_found' });
    await db('auditoria_eventos').insert({ device_id: req.params.device_id, tipo: 'device_suspendido' });
    res.json({ ok: true, device_id: req.params.device_id, nuevo_estado: 'suspendido' });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/admin/dispositivos/:device_id/reactivar', requireApiKey, async (req, res) => {
  try {
    const n = await db('devices').where({ id: req.params.device_id }).update({ estado: 'activo', ultimo_latido: db.fn.now() });
    if (!n) return res.status(404).json({ error: 'device_not_found' });
    await db('auditoria_eventos').insert({ device_id: req.params.device_id, tipo: 'device_reactivado' });
    res.json({ ok: true, device_id: req.params.device_id, nuevo_estado: 'activo' });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
