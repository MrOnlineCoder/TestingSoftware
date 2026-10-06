import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createDeps } from './deps.js';
import { buildServer } from './server.js';

async function main() {
  const config = loadAppConfig();
  const dbClient = createDbClient(config.databasePath);
  runMigrations(dbClient.db, config.migrationsDir);

  const deps = createDeps(config, dbClient.db);
  const server = await buildServer(deps);

  const shutdown = async () => {
    server.log.info('Shutdown signal received');
    await server.close();
    dbClient.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
