module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: Number(process.env.DB_POOL_MIN || 2), max: Number(process.env.DB_POOL_MAX || 10) },
  migrations: { tableName: 'knex_migrations', directory: './migrations', extension: 'cjs' }
};
