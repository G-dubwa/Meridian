import { describe, expect, it } from 'vitest';
import {
  assertAuthorityInteractionV1,
  assertExecutableAuthorityTierV1,
  InvalidAuthorityError,
  ProhibitedActionError,
  requiredInteractionForAuthorityTierV1,
} from '../../packages/domain/src/index.js';

describe('authority policy v1', () => {
  it.each([
    ['T0', 'activity_visibility'],
    ['T1', 'inline_receipt_edit_undo'],
    ['T2', 'triage'],
    ['T3', 'exact_preview_and_approval'],
    ['T4', 'reject'],
  ] as const)('maps %s to its required interaction', (tier, interaction) => {
    expect(requiredInteractionForAuthorityTierV1(tier)).toBe(interaction);
    expect(() => {
      assertAuthorityInteractionV1(tier, interaction);
    }).not.toThrow();
  });

  it('rejects interaction below the required authority', () => {
    expect(() => {
      assertAuthorityInteractionV1('T3', 'inline_receipt_edit_undo');
    }).toThrow(InvalidAuthorityError);
  });

  it('never executes T4 autonomy', () => {
    expect(() => {
      assertExecutableAuthorityTierV1('T4');
    }).toThrow(ProhibitedActionError);
  });
});
