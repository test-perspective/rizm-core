import { Server } from '@hocuspocus/server';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
};

const host = getArg('--host', '127.0.0.1');
const port = Number.parseInt(getArg('--port', '48889'), 10);
const path = getArg('--path', '/api/wiki/collab/ws');

const server = Server.configure({
  host,
  port,
  path,
});

const shutdown = async () => {
  try {
    await server.destroy();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.listen();
console.log(`[keel-collab] listening ws://${host}:${port}${path}`);
