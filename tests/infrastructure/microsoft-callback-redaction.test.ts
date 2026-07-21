import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { logMicrosoftCallbackFailure } from '../../packages/application/src/index.js';
import { uuidV1Schema } from '../../packages/domain/src/index.js';

describe('Microsoft OAuth callback redaction', () => {
  it('logs only the callback path and bounded diagnostic enums', () => {
    const warning = vi.fn();
    const sensitiveCode = 'synthetic-authorization-code-must-not-be-logged';
    const sensitiveState = 'synthetic-state-must-not-be-logged';
    logMicrosoftCallbackFailure({ warn: warning }, null);
    expect(warning).toHaveBeenCalledWith(
      'Microsoft callback envelope rejected safely.',
      {
        accountContinuity: 'not_reached',
        correlationId: null,
        failureClass: 'callback_envelope_rejected',
        identityValidation: 'not_reached',
        path: '/api/integrations/microsoft/callback',
        scopeValidation: 'not_reached',
      },
    );
    const log = JSON.stringify({
      calls: warning.mock.calls,
      sensitiveCode,
      sensitiveState,
    });
    const recorded = JSON.stringify(warning.mock.calls);
    expect(log).toContain(sensitiveCode);
    expect(log).toContain(sensitiveState);
    expect(recorded).not.toContain(sensitiveCode);
    expect(recorded).not.toContain(sensitiveState);

    warning.mockClear();
    logMicrosoftCallbackFailure(
      { warn: warning },
      {
        accountContinuity: 'not_reached',
        correlationId: uuidV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
        ),
        failureClass: 'identity_validation_failed',
        identityValidation: 'rejected',
        scopeValidation: 'accepted',
      },
    );
    expect(JSON.stringify(warning.mock.calls)).toBe(
      JSON.stringify([
        [
          'Microsoft callback rejected safely.',
          {
            path: '/api/integrations/microsoft/callback',
            accountContinuity: 'not_reached',
            correlationId: '018f0f77-34f1-7ef2-8ca1-7a3bf7f01976',
            failureClass: 'identity_validation_failed',
            identityValidation: 'rejected',
            scopeValidation: 'accepted',
          },
        ],
      ]),
    );
  });

  it('accepts callbacks only by POST and suppresses framework request lines for the callback path', () => {
    const route = readFileSync(
      'apps/web/app/api/integrations/microsoft/callback/route.ts',
      'utf8',
    );
    expect(route).toMatch(/postMicrosoftCallback as POST/);
    expect(route).not.toMatch(/\bas GET\b/);
    const handler = readFileSync(
      'apps/web/app/_server/microsoft-integration-http.ts',
      'utf8',
    );
    expect(handler).toContain('application/x-www-form-urlencoded');
    expect(handler).toContain('request.nextUrl.search.length > 0');
    const config = readFileSync('apps/web/next.config.ts', 'utf8');
    expect(config).toContain('incomingRequests');
    expect(config).toMatch(/api\\\/integrations\\\/microsoft\\\/callback/);
  });
});
