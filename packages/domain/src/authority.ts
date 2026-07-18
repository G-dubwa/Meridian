import { z } from 'zod';
import { InvalidAuthorityError, ProhibitedActionError } from './errors.js';

export const authorityTierV1Schema = z.enum(['T0', 'T1', 'T2', 'T3', 'T4']);
export type AuthorityTier = z.infer<typeof authorityTierV1Schema>;

export const authorityInteractionV1Schema = z.enum([
  'activity_visibility',
  'inline_receipt_edit_undo',
  'triage',
  'exact_preview_and_approval',
  'reject',
]);
export type AuthorityInteraction = z.infer<typeof authorityInteractionV1Schema>;

export const authorityPolicyV1 = {
  T0: 'activity_visibility',
  T1: 'inline_receipt_edit_undo',
  T2: 'triage',
  T3: 'exact_preview_and_approval',
  T4: 'reject',
} as const satisfies Record<AuthorityTier, AuthorityInteraction>;

export function requiredInteractionForAuthorityTierV1(
  tier: AuthorityTier,
): AuthorityInteraction {
  return authorityPolicyV1[tier];
}

export function assertAuthorityInteractionV1(
  tier: AuthorityTier,
  interaction: AuthorityInteraction,
): void {
  const required = requiredInteractionForAuthorityTierV1(tier);
  if (interaction !== required) {
    throw new InvalidAuthorityError(
      'The interaction does not satisfy the authority tier.',
      {
        interaction,
        required,
        tier,
      },
    );
  }
}

export function assertExecutableAuthorityTierV1(tier: AuthorityTier): void {
  if (tier === 'T4') {
    throw new ProhibitedActionError('T4 autonomy is prohibited.', { tier });
  }
}
