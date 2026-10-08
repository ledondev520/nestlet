// Test-only observer: the real HTTP server binds port 0 atomically. Report the
// selected address over IPC; never reserve and release a port in the parent.
import http from 'node:http';

if (process.env.PORT !== '0' || process.env.HOST !== '127.0.0.1' || !process.send) {
  throw new Error('Ephemeral server bootstrap requires loopback port 0 and child IPC');
}
const createServer = http.createServer;
http.createServer = function (...args) {
  http.createServer = createServer;
  const server = Reflect.apply(createServer, this, args);
  server.once('listening', () => {
    process.send({ type: 'nestlet-test-listening', address: server.address() });
  });
  return server;
};
