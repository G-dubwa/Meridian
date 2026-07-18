import { describe, expect, it } from 'vitest';
import { NoopMaterialChangeInvalidationHook } from '../../packages/application/src/journal.js';
import {
  entryIdV1Schema,
  entryRevisionIdV1Schema,
  userIdV1Schema,
} from '../../packages/domain/src/index.js';

describe('journal material-change boundary', () => {
  it('provides a side-effect-free invalidation hook until later workflows consume it', async () => {
    const hook = new NoopMaterialChangeInvalidationHook();
    await expect(
      hook.invalidate({
        changeKind: 'content',
        currentRevisionId: entryRevisionIdV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01981',
        ),
        entryId: entryIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01980'),
        previousRevisionId: entryRevisionIdV1Schema.parse(
          '018f0f77-34f1-7ef2-8ca1-7a3bf7f01982',
        ),
        scope: {
          userId: userIdV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01970'),
        },
      }),
    ).resolves.toBeUndefined();
  });
});
