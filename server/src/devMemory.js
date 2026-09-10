/**
 * `npm run dev:memory` — run the whole API against a throwaway in-memory
 * MongoDB, seeded on boot. Zero database setup required, which makes the
 * project demoable on a machine with no MongoDB installed.
 *
 * It is a convenience for demos only:
 *   - mongodb-memory-server is a devDependency and is never imported by the
 *     normal server entry point (src/index.js).
 *   - Data lives in RAM, so everything is wiped when the process exits.
 *
 * For real use, run a normal MongoDB and use `npm run dev`.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mem = await MongoMemoryServer.create();

// Must be set BEFORE importing anything that reads config, because env.js
// captures the values at import time. dotenv does not overwrite variables
// that already exist in process.env, so this wins over .env.
process.env.MONGO_URI = mem.getUri('task_portal');

const mongoose = (await import('mongoose')).default;
const { env } = await import('./config/env.js');
const { seed } = await import('./seed.js');
const { createApp } = await import('./app.js');

await mongoose.connect(env.mongoUri);
await seed({ manageConnection: false });
await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));

createApp().listen(env.port, () => {
  console.log(`\nAPI listening on http://localhost:${env.port}  (in-memory database)`);
  console.log('Data is not persisted — restarting reseeds from scratch.\n');
});

const shutdown = async () => {
  await mongoose.disconnect();
  await mem.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
