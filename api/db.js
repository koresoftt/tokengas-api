import knex from 'knex';
const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: Number(process.env.DB_POOL_MIN || 2), max: Number(process.env.DB_POOL_MAX || 10) }
});
export default db;
