/**
 * Crea/ajusta la tabla registro_desafios para que tenga:
 *  - client_id (text)
 *  - nonce (text)
 *  - expira_en (timestamptz)
 *  - creado_en (timestamptz default now())
 *  - unique(client_id, nonce)
 *  - índices por expira_en
 */
module.exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('registro_desafios');
  if (!hasTable) {
    await knex.schema.createTable('registro_desafios', (t) => {
      t.bigIncrements('id').primary();
      t.text('client_id').notNullable().index();
      t.text('nonce').notNullable().index();
      t.timestamp('expira_en', { useTz: true }).notNullable().index();
      t.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.unique(['client_id','nonce']);
    });
  } else {
    // Agrega columnas que falten
    await knex.raw(`
      ALTER TABLE registro_desafios
        ADD COLUMN IF NOT EXISTS client_id text,
        ADD COLUMN IF NOT EXISTS nonce text,
        ADD COLUMN IF NOT EXISTS expira_en timestamptz,
        ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now()
    `);
    // Marcar NOT NULL donde aplique (si hay filas antiguas nulas, primero pon valores; aquí asumimos tabla vacía o temporal)
    await knex.raw(`UPDATE registro_desafios SET creado_en = now() WHERE creado_en IS NULL`);
    await knex.raw(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE registro_desafios ALTER COLUMN client_id SET NOT NULL;
        EXCEPTION WHEN others THEN END;
        BEGIN
          ALTER TABLE registro_desafios ALTER COLUMN nonce SET NOT NULL;
        EXCEPTION WHEN others THEN END;
        BEGIN
          ALTER TABLE registro_desafios ALTER COLUMN expira_en SET NOT NULL;
        EXCEPTION WHEN others THEN END;
      END$$
    `);
    // Índices y unique
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_desafios_unique ON registro_desafios(client_id, nonce)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_reg_desafios_expira_en ON registro_desafios(expira_en)`);
  }
};

module.exports.down = async function(knex) {
  // Reversible simple: no tocar si ya existía
  const hasTable = await knex.schema.hasTable('registro_desafios');
  if (hasTable) {
    // Si quieres revertir completamente, descomenta:
    // await knex.schema.dropTable('registro_desafios');
  }
};
