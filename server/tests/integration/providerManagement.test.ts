import { describe, expect, it } from 'vitest';
import { normalizeDeploymentStatus } from '../../src/services/providerManagement.js';

describe('provider deployment status normalization', () => {
  it.each([
    ['READY', 'successful'], ['live', 'successful'], ['build_failed', 'failed'], ['update_failed', 'failed'],
    ['queued', 'queued'], ['created', 'queued'], ['build_in_progress', 'building'], ['pre_deploy_in_progress', 'building'],
    ['update_in_progress', 'deploying'], ['deactivated', 'canceled'], ['provider_custom_state', 'other'],
  ])('maps provider status %s to %s while retaining provider status separately', (providerStatus, normalized) => {
    expect(normalizeDeploymentStatus(providerStatus)).toBe(normalized);
  });
});
