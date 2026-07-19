import type { InterpretationAuthorityDecisionV1 } from '@meridian/domain';

export interface InterpretationRoutingFixtureV1 {
  readonly id: string;
  readonly signals: {
    readonly explicit: boolean;
    readonly deterministic: boolean;
    readonly ambiguous: boolean;
    readonly externalEffect: boolean;
    readonly prohibited: boolean;
  };
  readonly expectedRoute: InterpretationAuthorityDecisionV1['route'];
}

export const INTERPRETATION_ROUTING_FIXTURES_V1 = [
  {
    expectedRoute: 'direct_command',
    id: 'explicit-deterministic-internal',
    signals: {
      ambiguous: false,
      deterministic: true,
      explicit: true,
      externalEffect: false,
      prohibited: false,
    },
  },
  {
    expectedRoute: 'triage',
    id: 'inferred-structure',
    signals: {
      ambiguous: false,
      deterministic: false,
      explicit: false,
      externalEffect: false,
      prohibited: false,
    },
  },
  {
    expectedRoute: 'clarification',
    id: 'ambiguous-command',
    signals: {
      ambiguous: true,
      deterministic: false,
      explicit: true,
      externalEffect: false,
      prohibited: false,
    },
  },
  {
    expectedRoute: 'external_preview',
    id: 'external-side-effect',
    signals: {
      ambiguous: false,
      deterministic: true,
      explicit: true,
      externalEffect: true,
      prohibited: false,
    },
  },
  {
    expectedRoute: 'reject',
    id: 'prohibited-autonomy',
    signals: {
      ambiguous: false,
      deterministic: true,
      explicit: true,
      externalEffect: false,
      prohibited: true,
    },
  },
] as const satisfies readonly InterpretationRoutingFixtureV1[];
