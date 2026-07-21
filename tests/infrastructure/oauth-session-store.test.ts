import {
  MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  userIdV1Schema,
  uuidV1Schema,
} from '../../packages/domain/src/index.js';
import { DrizzleOAuthAuthorizationSessionStore } from '../../packages/infrastructure-db/src/index.js';
import { describe, expect, it } from 'vitest';

const record = {
  codeVerifierCiphertext: 'v1.synthetic.envelope.tag',
  consumedAt: null,
  createdAt: new Date('2026-07-21T18:00:00.000Z'),
  expiresAt: new Date('2026-07-21T18:10:00.000Z'),
  id: uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01990'),
  nonceHash: 'a'.repeat(64),
  provider: 'microsoft' as const,
  redirectUri: 'http://localhost:3000/api/integrations/microsoft/callback',
  requestedScopes: MICROSOFT_TODO_SPIKE_REQUESTED_SCOPES,
  stateHash: 'b'.repeat(64),
  userId: userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01991'),
};

function rejectingDatabase(error: Error) {
  return {
    transaction: () => Promise.reject(error),
  };
}

describe('OAuth authorization-session persistence', () => {
  it.each(['42703', '42P01'])(
    'classifies stale schema code %s without preserving the query values',
    async (databaseCode) => {
      const databaseError = Object.assign(new Error('schema is stale'), {
        code: databaseCode,
      });
      const drizzleError = Object.assign(new Error('query failed'), {
        cause: databaseError,
      });
      const store = new DrizzleOAuthAuthorizationSessionStore(
        rejectingDatabase(drizzleError) as never,
      );

      await expect(store.create(record)).rejects.toMatchObject({
        code: 'CONFLICT',
        details: {
          databaseCode,
          stage: 'oauth_session_persistence',
        },
        message: 'The integration configuration is not ready.',
        name: 'IntegrationConfigurationInvalidError',
        stage: 'oauth_session_persistence',
      });
    },
  );

  it('preserves an unexpected database failure for correlated HTTP 500 handling', async () => {
    const unexpected = new Error('synthetic unexpected database failure');
    const store = new DrizzleOAuthAuthorizationSessionStore(
      rejectingDatabase(unexpected) as never,
    );

    await expect(store.create(record)).rejects.toBe(unexpected);
  });
});
