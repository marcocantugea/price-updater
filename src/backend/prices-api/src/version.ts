/**
 * Application version, read from `package.json` at runtime.
 *
 * The health endpoint used to carry a hardcoded `'1.0.0'` literal, which quietly
 * drifted from the release it was labelled with. Reading the manifest keeps the
 * reported version and the published image tag in step.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version?: string };

export const APP_VERSION: string = typeof pkg.version === 'string' && pkg.version !== '' ? pkg.version : '0.0.0';
