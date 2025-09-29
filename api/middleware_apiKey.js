export function requireApiKey(req, res, next) {
  const keys = [process.env.API_KEY, process.env.API_KEY_NEXT].filter(Boolean);
  if (!keys.length) return res.status(500).json({ error: 'server_misconfigured' });
  const got = req.get('X-API-Key');
  if (!got || !keys.includes(got)) {
    return res.status(401).json({ error: 'missing_or_invalid_api_key' });
  }
  next();
}
