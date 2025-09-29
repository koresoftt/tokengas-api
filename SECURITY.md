# Security Policy

## Supported versions
Solo se mantiene la rama `main`.

## Reportar vulnerabilidades
No abras issues públicos para temas de seguridad. En su lugar:

- Envía un correo a **JorgeSolano@koresoft.mx** con:
  - Descripción del problema y su impacto.
  - Pasos de reproducción / PoC (si aplica).
  - Alcance afectado (endpoints, headers, roles).
  - Logs o capturas relevantes (sin secretos).

Confirmaremos recepción en 72h y, si procede, coordinaremos plazos de mitigación y divulgación responsable.

## Buenas prácticas del repo
- No subir `.env` ni datos reales (ver `.gitignore` y `.env.example`).
- Claves rotadas mediante `API_KEY(_NEXT)` y `ENROLL_API_KEY(_NEXT)`.
- JWT firmados y JWKS público.
- Rate limiting y headers de seguridad (Helmet).
- Revisiones automáticas: GitHub secret scanning y Dependabot (activar en el repo).

## Divulgación
Una vez mitigado y desplegado, publicaremos notas de seguridad cuando corresponda.
