import http from 'node:http';

// No key, credential, upload, or provider request is involved in liveness checks.
const req = http.get({ host: '127.0.0.1', port: process.env.PORT || 4173, path: '/api/health', timeout: 3000 }, response => {
  response.resume();
  process.exitCode = response.statusCode === 200 ? 0 : 1;
});
req.on('timeout', () => req.destroy(new Error('healthcheck timeout')));
req.on('error', () => { process.exitCode = 1; });
