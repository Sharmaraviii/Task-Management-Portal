import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';

async function start() {
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB connected');

  // Mongoose only creates the indexes declared in the schemas when
  // autoIndex runs; it is on by default in development. In production you
  // would build them in a migration instead, because an index build on a
  // large live collection is expensive.
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  console.log('Indexes ensured');

  createApp().listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
