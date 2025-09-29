import { readFile } from 'node:fs/promises';
import { importSPKI, jwtVerify } from 'jose';
let publicKey;
async function getKey() {
  if (!publicKey) {
    const spki = await readFile(process.env.JWT_PUBLIC_PATH || '/etc/koresoft-secrets/jwt.pub', 'utf8');
    publicKey = await importSPKI(spki, 'RS256');
  }
  return publicKey;
}
export async function requireJwt(req, res, next) {
  try {
    const m = (req.header('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'missing_bearer' });
    const { payload, protectedHeader } = await jwtVerify(m[1], await getKey(), { algorithms: ['RS256'] });
    req.auth = payload; req.jwtHeader = protectedHeader; next();
  } catch (e) {
    res.status(401).json({ error: 'invalid_jwt' });
  }
}
