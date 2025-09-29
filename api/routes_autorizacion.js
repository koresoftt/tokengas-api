import express from 'express';
import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { requireJwt } from './middleware_auth.js';

const router = express.Router();
const LIFETIME = 30 * 24 * 60 * 60;
const RENEW_WINDOW = 7 * 24 * 60 * 60;

async function getPrivateKey() {
  const pem = await readFile(process.env.JWT_PRIVATE_PATH || '/etc/koresoft-secrets/jwt.key', 'utf8');
  return importPKCS8(pem, 'RS256');
}

router.post('/renovar', requireJwt, async (req, res) => {
  try {
    const now = Math.floor(Date.now()/1000);
    const { sub, cid, exp, renew_from, scopes = [], max_offline, cnf } = req.auth || {};
    if (!sub || !cid || typeof exp !== 'number' || typeof renew_from !== 'number') {
      return res.status(400).json({ error: 'invalid_token_claims' });
    }
    if (now < renew_from || now >= exp) {
      return res.status(400).json({ error: 'outside_renew_window' });
    }
    const key = await getPrivateKey();
    const iat = now, newExp = iat + LIFETIME, newRenewFrom = newExp - RENEW_WINDOW;
    const payload = {
      sub, cid, iat, nbf: iat, exp: newExp, renew_from: newRenewFrom,
      max_offline: typeof max_offline === 'number' ? max_offline : 3*24*60*60,
      scopes, jti: randomUUID()
    };
    if (cnf?.jkt) payload.cnf = { jkt: cnf.jkt };
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KID || 'srv-2025-09-k1' })
      .sign(key);
    res.json({ token: jwt });
  } catch (e) {
    res.status(500).json({ error: 'renew_error', detail: String(e?.message || e) });
  }
});

export default router;
