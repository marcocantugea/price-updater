import { APP_VERSION } from '../../src/version';
import pkg from '../../package.json';

/**
 * The health endpoint reports `APP_VERSION`, and `/health` is what an operator
 * checks after a deploy. It used to be a hardcoded literal, so a release could
 * ship an image whose own health check named a different version; this keeps the
 * reported version and the manifest in step.
 */
describe('application version', () => {
  it('comes from the package manifest', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is a non-empty semver-shaped string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
