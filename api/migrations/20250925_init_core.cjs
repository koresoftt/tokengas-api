/**
 * Estructura base: devices, tokens (auditoría) y auditoria_eventos
 * Usa pgcrypto (gen_random_uuid) para UUIDs.
 */
module.exports.up = async function (knex) {
  // Extensión para UUIDs
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  // Enum de estado (idempotente)
  await knex.raw(`DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_state') THEN
      CREATE TYPE device_state AS ENUM ('activo','suspendido','revocado');
    END IF;
  END$$;`);

  // Tabla devices
  await knex.schema.createTable('devices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('client_id').notNullable().index();
    t.text('public_key').notNullable(); // JWK Ed25519 (string JSON)
    t.specificType('estado', 'device_state').notNullable().defaultTo('activo');
    t.timestamp('ultimo_latido', { useTz: true }).index();
    t.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('actualizado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['client_id', 'public_key']); // evita doble enrolamiento con misma llave por cliente
  });

  // Tabla tokens (auditoría de emisiones/renovaciones)
  await knex.schema.createTable('tokens', (t) => {
    t.text('jti').primary();
    t.uuid('device_id').notNullable()
      .references('id').inTable('devices').onDelete('CASCADE');
    t.timestamp('emitido_en', { useTz: true }).notNullable();
    t.timestamp('expira_en', { useTz: true }).notNullable().index();
    t.jsonb('scopes').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));
  });

  // Tabla auditoría general
  await knex.schema.createTable('auditoria_eventos', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('device_id').nullable()
      .references('id').inTable('devices').onDelete('SET NULL');
    t.text('tipo').notNullable(); // enrolamiento | latido | renovar | error | ...
    t.jsonb('payload').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
    t.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['tipo', 'creado_en']);
  });

  // Trigger updated_at en devices
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.actualizado_en = now();
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_devices_updated_at ON devices;
    CREATE TRIGGER trg_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  `);
};

module.exports.down = async function (knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_devices_updated_at ON devices;');
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at;');
  await knex.schema.dropTableIfExists('auditoria_eventos');
  await knex.schema.dropTableIfExists('tokens');
  await knex.schema.dropTableIfExists('devices');
  await knex.raw(`DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_state') THEN
      DROP TYPE device_state;
    END IF;
  END$$;`);
};
