/**
 * Ajusta registro_desafios para que se rellene nonce_hash (sha256) desde nonce
 * automáticamente y deja todo consistente con el código actual.
 */
module.exports.up = async function(knex) {
  // Asegura pgcrypto para digest()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  // Asegura columnas básicas (por idempotencia; ya las tienes)
  await knex.raw(`
    ALTER TABLE registro_desafios
      ADD COLUMN IF NOT EXISTS nonce text,
      ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now()
  `);

  // Crea o reemplaza función y trigger para setear nonce_hash desde nonce
  await knex.raw(`
    CREATE OR REPLACE FUNCTION registro_desafios_set_hash()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.nonce IS NOT NULL THEN
        NEW.nonce_hash := encode(digest(NEW.nonce, 'sha256'), 'hex');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_registro_desafios_hash ON registro_desafios;
    CREATE TRIGGER trg_registro_desafios_hash
    BEFORE INSERT OR UPDATE ON registro_desafios
    FOR EACH ROW EXECUTE FUNCTION registro_desafios_set_hash();
  `);

  // Índices útiles (si no existieran)
  await knex.raw(`CREATE INDEX IF NOT EXISTS registro_desafios_client_id_index ON registro_desafios(client_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS registro_desafios_expira_en_index ON registro_desafios(expira_en)`);

  // NOT NULL donde aplica (si hay filas antiguas nulas, corrige primero)
  await knex.raw(`
    DO $$
    BEGIN
      BEGIN
        ALTER TABLE registro_desafios ALTER COLUMN client_id SET NOT NULL;
      EXCEPTION WHEN others THEN END;
      BEGIN
        ALTER TABLE registro_desafios ALTER COLUMN expira_en SET NOT NULL;
      EXCEPTION WHEN others THEN END;
    END$$
  `);
};

module.exports.down = async function(knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS trg_registro_desafios_hash ON registro_desafios;`);
  await knex.raw(`DROP FUNCTION IF EXISTS registro_desafios_set_hash();`);
};
