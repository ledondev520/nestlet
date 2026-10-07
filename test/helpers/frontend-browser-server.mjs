// Real Node/SQLite fixture for NON-email product journeys. All accounts below are
// explicitly seeded legacy users via private storage setup; this is not enrollment.
import { startBrowserFixture, LEGACY_BROWSER_USERS } from './browser-fixture.mjs';
const fixture = await startBrowserFixture({ port: process.env.NESTLET_BROWSER_PORT || '4199', legacyUsers: LEGACY_BROWSER_USERS });
console.log('Nestlet available: disposable legacy-seeded browser fixture');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await fixture.stop(); }
process.once('SIGTERM', () => stop().finally(() => process.exit(0)));
process.once('SIGINT', () => stop().finally(() => process.exit(0)));
fixture.child.once('exit', code => { if (!stopping) stop().finally(() => process.exit(code ?? 1)); });
