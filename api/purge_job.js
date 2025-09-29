export function startRegistroDesafiosPurge(db) {
  const intervalSec = Number(process.env.REG_PURGE_INTERVAL_SEC || 3600);
  if (!intervalSec) return;
  setInterval(async () => {
    try {
      await db('registro_desafios')
        .where('expira_en', '<', db.fn.now())
        .orWhere(function () {
          this.where({ usado: true })
              .andWhere('creado_en', '<', db.raw("now() - interval '1 day'"));
        })
        .del();
    } catch (e) {
      // opcional: console.error('purge error', e)
    }
  }, intervalSec * 1000).unref();
}
