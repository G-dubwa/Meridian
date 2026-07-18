import {
  authorityTierV1Schema,
  domainEventEnvelopeV1Schema,
  processingClassV1Schema,
  userScopeV1Schema,
} from '@meridian/domain';

export const generatedSchemaPlaceholdersV1 = {
  authorityTier: authorityTierV1Schema,
  domainEventEnvelope: domainEventEnvelopeV1Schema,
  processingClass: processingClassV1Schema,
  userScope: userScopeV1Schema,
} as const;

export const apiContractSchemaVersion = 1 as const;
