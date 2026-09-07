import path from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { openBibleDatabase } from './database.js';
import { BibleRepository } from './repository.js';

try {
  const database = await openBibleDatabase(config.archivePath, config.databasePath);
  const repository = new BibleRepository(database);
  const builtClient = path.join(config.projectRoot, 'dist');
  const staticDirectory = existsSync(path.join(builtClient, 'index.html'))
    ? builtClient
    : undefined;
  const app = createApp(repository, staticDirectory);
  const server = app.listen(config.port, () => {
    console.log(`Bibelraum läuft auf http://localhost:${config.port}`);
  });

  function shutdown() {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
