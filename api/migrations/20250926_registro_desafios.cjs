module.exports.up = async function (knex) {
  await knex.schema.createTable('registro_desafios', (t) => {
    t.text('nonce_hash').primary();
    t.text('client_id').notNullable().index();
    t.timestamp('expira_en', { useTz: true }).notNullable().index();
    t.timestamp('creado_en', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.boolean('usado').notNullable().defaultTo(false);
  });
};
module.exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('registro_desafios');
};
