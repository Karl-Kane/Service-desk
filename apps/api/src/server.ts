import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db });

// Graceful shutdown: `docker stop` шлёт SIGTERM и ждёт 10 c до SIGKILL.
// app.close() перестаёт принимать новые соединения и дожидается текущих запросов,
// затем закрываем пул БД. Без этого обрываются запросы посреди транзакции.
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.destroy();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.fatal({ err }, 'failed to start');
  process.exit(1);
}
