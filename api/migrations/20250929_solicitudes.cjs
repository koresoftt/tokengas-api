/**
 * Tabla 'solicitudes' (PK UUID), enum de estado e índices útiles.
 * Compatible con Knex (CommonJS).
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  // Necesaria para gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

  // Crear enum nativo si no existe
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'solicitudes_estado') THEN
        CREATE TYPE solicitudes_estado AS ENUM ('pending','approved','rejected');
      END IF;
    END
    $$;
  `);

  const has = await knex.schema.hasTable('solicitudes');
  if (!has) {
    await knex.schema.createTable('solicitudes', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('device_id').notNullable();
      t.text('client_id').notNullable();

      t.text('modelo');
      t.text('so');
      t.text('ubicacion');
      t.double('lat');
      t.double('lon');

      t.specificType('estado', 'solicitudes_estado')
        .notNullable()
        .defaultTo('pending');

      t.text('motivo');
      t.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('actualizado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // Índices
    await knex.raw('CREATE INDEX IF NOT EXISTS solicitudes_device_idx ON solicitudes(device_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS solicitudes_estado_creado_idx ON solicitudes(estado, creado_en DESC)');
  }
};

exports.down = async function down(knex) {
  // Quitar índices si existen
  await knex.raw('DROP INDEX IF EXISTS solicitudes_device_idx');
  await knex.raw('DROP INDEX IF EXISTS solicitudes_estado_creado_idx');

  await knex.schema.dropTableIfExists('solicitudes');
  await knex.raw('DROP TYPE IF EXISTS solicitudes_estado');
};
