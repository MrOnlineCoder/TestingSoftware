import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { loadAppConfig } from '../config.js';
import { createDbClient, type Db } from './client.js';

export function runMigrations(db: Db, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}

// Standalone usage: `npm run db:migrate`
if (import.meta.filename === process.argv[1]) {
  const config = loadAppConfig();
  const client = createDbClient(config.databasePath);
  runMigrations(client.db, config.migrationsDir);
  client.close();
  console.log(`Migrations applied to ${config.databasePath}`);
}
