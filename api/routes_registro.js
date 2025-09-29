import express from 'express';
import { readFile } from 'node:fs/promises';
import knexLib from 'knex';
import { randomBytes, randomUUID } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { startRegistroDesafiosPurge } from './purge_job.js';

const router = express.Router();

const db = knexLib({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: Number(process.env.DB_POOL_MIN || 2), max: Number(process.env.DB_POOL_MAX || 10) },
});

// lanza purga periódica de desafíos expirados/usados
startRegistroDesafiosPurge(db);

const JWT_PRIVATE_PATH = process.env.JWT_PRIVATE_PATH || '/etc/koresoft-secrets/jwt.key';
const JWT_KID = process.env.JWT_KID || 'srv-2025-09-k1';

// Si defines ENROLL_* se exige; si no, deja pasar.
function optionalEnrollApiKey(req, res, next) {
  const keys = [process.env.ENROLL_API_KEY, process.env.ENROLL_API_KEY_NEXT].filter(Boolean);
  if (!keys.length) return next();
  const got = req.header('X-API-Key');
  if (!got || !keys.includes(got)) return res.status(401).json({ error: 'invalid_api_key' });
  return next();
}

async function getPrivateKey() {
  const pem = await readFile(JWT_PRIVATE_PATH, 'utf8');
  return await importPKCS8(pem, 'RS256');
}

function b64uToBuf(b64u) {
  const pad = b64u.length % 4 ? '='.repeat(4 - (b64u.length % 4)) : '';
  return Buffer.from((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// POST /registro/desafio  -> { nonce, challenge, exp }
router.post('/desafio', optionalEnrollApiKey, async (req, res) => {
  try {
    const { client_id } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'missing_client_id' });

    const nonce = randomBytes(24).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 300; // 5 min

    await db('registro_desafios').insert({
      client_id,
      nonce,
      expira_en: db.raw('to_timestamp(?)', [exp]),
    });

    // Challenge firmado (opcional)
    let challenge = null;
    try {
      const key = await getPrivateKey();
      challenge = await new SignJWT({ nonce })
        .setProtectedHeader({ alg: 'RS256', kid: JWT_KID })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    } catch {
      challenge = null;
    }

    return res.json({ nonce, challenge, exp });
  } catch (e) {
    return res.status(500).json({ error: 'desafio_error', detail: String(e?.message || e) });
  }
});

// POST /registro/validar  -> { device_id, token }
router.post('/validar', async (req, res) => {
  try {
    const { client_id, nonce, jwk, signature } = req.body || {};
    if (!client_id || !nonce || !jwk || !signature) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const row = await db('registro_desafios')
      .where({ client_id, nonce })
      .andWhere('expira_en', '>', db.fn.now())
      .andWhere(function(){ this.whereNull('usado').orWhere({ usado: false }) })
      .first();
    if (!row) return res.status(400).json({ error: 'invalid_or_expired_nonce' });

    // Verifica firma Ed25519(nonce)
    const pubKey = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, b64uToBuf(signature), new TextEncoder().encode(nonce));
    if (!ok) return res.status(400).json({ error: 'bad_signature' });

    // marca desafío como usado
    await db('registro_desafios').where({ client_id, nonce }).update({ usado: true });

    // Upsert dispositivo
    const existing = await db('devices').where({ client_id, public_key: JSON.stringify(jwk) }).first();
    let device_id;
    if (existing) {
      device_id = existing.id;
    } else {
      const [ins] = await db('devices')
        .insert({ client_id, public_key: JSON.stringify(jwk), estado: 'activo' })
        .returning(['id']);
      device_id = ins.id;
    }

    // Emite JWT
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 30 * 24 * 60 * 60; // 30d
    const renew_from = exp - 7 * 24 * 60 * 60; // 7d antes

    const key = await getPrivateKey();
    const token = await new SignJWT({
      sub: device_id,
      cid: client_id,
      iat: now,
      nbf: now,
      exp,
      renew_from,
      max_offline: 3 * 24 * 60 * 60,
      scopes: ['devices:heartbeat'],
      jti: randomUUID(),
    }).setProtectedHeader({ alg: 'RS256', kid: JWT_KID }).sign(key);

    // Auditoría
    await db('auditoria_eventos').insert({
      device_id,
      tipo: 'enrolamiento',
      payload: { client_id },
    });

    return res.json({ device_id, token });
  } catch (e) {
    return res.status(500).json({ error: 'validar_error', detail: String(e?.message || e) });
  }
});

export default router;
