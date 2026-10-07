/**
 * Demo seeds must never load by accident in staging/production.
 *
 * Allowed when:
 *   - NODE_ENV=development (local development), or
 *   - ALLOW_DEMO_SEED=true (explicit opt-in)
 */
export interface SeedPolicyConfig {
  nodeEnv: string;
  allowDemoSeed: boolean;
}

export function shouldRunDemoSeeds(config: SeedPolicyConfig): boolean {
  return config.nodeEnv === 'development' || config.allowDemoSeed === true;
}
