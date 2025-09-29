import { readFile } from 'node:fs/promises';
import { importSPKI, exportJWK } from 'jose';

export default async function jwksHandler(req, res) {
  try {
    const kid = process.env.JWT_KID || 'srv-2025-09-k1';
    const path = process.env.JWT_PUBLIC_PATH || '/etc/koresoft-secrets/jwt.pub';
    const spki = await readFile(path, 'utf8');
    const key = await importSPKI(spki, 'RS256');
    const jwk = await exportJWK(key);
    jwk.kid = kid;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    return res.json({ keys: [jwk] });
  } catch (e) {
    return res.status(500).json({ error: 'jwks_error', detail: String(e?.message || e) });
  }
}
