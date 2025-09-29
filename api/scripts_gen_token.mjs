import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';
const privPem = await readFile(process.env.JWT_PRIVATE_PATH || '/etc/koresoft-secrets/jwt.key', 'utf8');
const key = await importPKCS8(privPem, 'RS256');
const DEVICE_ID = process.env.DEVICE_ID || '00000000-0000-0000-0000-000000000000';
const CLIENT_ID = process.env.CLIENT_ID || 'test-client';
const now = Math.floor(Date.now()/1000);
const exp = now + 30*24*60*60;
const renew_from = exp - 7*24*60*60;
const jwt = await new SignJWT({
  sub: DEVICE_ID, cid: CLIENT_ID, iat: now, nbf: now, exp, renew_from,
  max_offline: 3*24*60*60, scopes: ['devices:heartbeat'], jti: crypto.randomUUID()
}).setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KID || 'srv-2025-09-k1' }).sign(key);
console.log(jwt);
