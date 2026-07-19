import {
  ConflictError,
  InvalidAuthorityError,
  NotFoundError,
  derivationLinkIdV1Schema,
  domainEventEnvelopeV1Schema,
  domainEventIdV1Schema,
  entryRevisionIdV1Schema,
  outboxMessageIdV1Schema,
  proposalEventPayloadV1Schema,
  proposalBatchCreatedEventPayloadV1Schema,
  proposalIdV1Schema,
  resourceIdV1Schema,
  transitionProposalStatusV1,
  validateInterpretationOutputV1,
} from '@meridian/domain';
import type {
  Clock,
  DomainEventEnvelopeV1,
  EntryRevisionId,
  IdGenerator,
  InterpretationOutputV1,
  OutboxMessageRecord,
  ProposalEventType,
  ProposalId,
  ProposalRecord,
  TransactionManager,
  TransactionPorts,
  UserScope,
  Uuid,
} from '@meridian/domain';
import type {
  MaterialChangeInvalidation,
  MaterialChangeInvalidationHook,
} from './journal.js';

const PROPOSAL_EXPIRY_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;
const DISMISSAL_SUPPRESSION_MILLISECONDS = 90 * 24 * 60 * 60 * 1_000;
const ALPHA_CONFIDENCE_FLOOR = 0.9;

export interface TriageCommandContext {
  readonly correlationId: Uuid;
}

export interface InterpretationDisposition {
  readonly outcome: 'proposals' | 'clarification' | 'no_action';
  readonly proposals: readonly ProposalRecord[];
  readonly clarificationQuestion: string | null;
}

export interface TriageServiceDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly transactions: TransactionManager;
}

function eventFor(
  dependencies: TriageServiceDependencies,
  scope: UserScope,
  context: TriageCommandContext,
  eventType: ProposalEventType,
  proposal: ProposalRecord,
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    aggregateId: proposal.resourceId,
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType,
    occurredAt: now.toISOString(),
    payload: proposalEventPayloadV1Schema.parse({
      proposalId: proposal.id,
      proposalType: proposal.proposalType,
      status: proposal.status,
    }),
    schemaVersion: 1,
    scope,
  });
}

function batchCreatedEventFor(
  dependencies: TriageServiceDependencies,
  scope: UserScope,
  context: TriageCommandContext,
  proposals: readonly ProposalRecord[],
  now: Date,
): DomainEventEnvelopeV1 {
  return domainEventEnvelopeV1Schema.parse({
    correlationId: context.correlationId,
    eventId: domainEventIdV1Schema.parse(dependencies.ids.next()),
    eventType: 'proposal.batch_created.v1',
    occurredAt: now.toISOString(),
    payload: proposalBatchCreatedEventPayloadV1Schema.parse({
      proposalCount: proposals.length,
      proposalIds: proposals.map((proposal) => proposal.id),
    }),
    schemaVersion: 1,
    scope,
  });
}

async function appendEvent(
  dependencies: TriageServiceDependencies,
  ports: TransactionPorts,
  event: DomainEventEnvelopeV1,
  now: Date,
): Promise<void> {
  const outbox: OutboxMessageRecord = {
    attempts: 0,
    availableAt: now,
    createdAt: now,
    deadLetteredAt: null,
    event,
    id: outboxMessageIdV1Schema.parse(dependencies.ids.next()),
    lastErrorAt: null,
    lastErrorCode: null,
    processedAt: null,
    status: 'pending',
    topic: event.eventType,
  };
  await ports.domainEvents.append(event);
  await ports.outbox.append(outbox);
}

function manualClarification(): InterpretationDisposition {
  return {
    clarificationQuestion:
      'I am not certain what should be captured. What would you like Meridian to propose?',
    outcome: 'clarification',
    proposals: [],
  };
}

export class TriageService {
  public constructor(
    private readonly dependencies: TriageServiceDependencies,
  ) {}

  public list(scope: UserScope): Promise<readonly ProposalRecord[]> {
    return this.dependencies.transactions.run(scope, (ports) =>
      ports.proposals.listPending(scope, this.dependencies.clock.now()),
    );
  }

  public recordInterpretation(
    scope: UserScope,
    revisionId: EntryRevisionId,
    rawOutput: InterpretationOutputV1,
    context: TriageCommandContext,
  ): Promise<InterpretationDisposition> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const revision = await ports.entryRevisions.findById(
        scope,
        entryRevisionIdV1Schema.parse(revisionId),
      );
      if (!revision) throw new NotFoundError('Source revision was not found.');
      const entry = await ports.entries.findById(scope, revision.entryId);
      if (entry?.currentRevisionId !== revision.id) {
        throw new ConflictError(
          'Only the current source revision may be interpreted.',
        );
      }
      if (revision.processingClass !== 'standard') {
        throw new InvalidAuthorityError(
          'Alpha interpretation is restricted to Standard revisions.',
        );
      }

      const output = validateInterpretationOutputV1(rawOutput, {
        bodyLength: revision.bodyMarkdown.length,
        revisionId: revision.id,
      });
      if (output.outcome === 'clarification') {
        return {
          clarificationQuestion: output.clarificationQuestion,
          outcome: 'clarification',
          proposals: [],
        };
      }
      if (output.outcome === 'no_action') {
        return {
          clarificationQuestion: null,
          outcome: 'no_action',
          proposals: [],
        };
      }

      if (
        output.uncertaintyIndicators.length > 0 ||
        output.proposals.some(
          (candidate) =>
            candidate.uncertaintyIndicators.length > 0 ||
            candidate.confidence < ALPHA_CONFIDENCE_FLOOR,
        )
      ) {
        return manualClarification();
      }

      const now = this.dependencies.clock.now();
      const created: ProposalRecord[] = [];
      for (const candidate of output.proposals) {
        await ports.proposals.acquireDedupeLock(scope, candidate.dedupeKey);
        const existing = await ports.proposals.findByDedupeKey(
          scope,
          candidate.dedupeKey,
        );
        if (
          existing &&
          (existing.status !== 'dismissed' ||
            existing.suppressionUntil === null ||
            existing.suppressionUntil > now)
        ) {
          continue;
        }
        const id = proposalIdV1Schema.parse(this.dependencies.ids.next());
        const resourceId = resourceIdV1Schema.parse(id);
        const proposal: ProposalRecord = {
          assertionClass: candidate.assertionClass,
          authorityClass: candidate.authorityClass,
          confidence: candidate.confidence,
          createdAt: now,
          decidedAt: null,
          dedupeKey: candidate.dedupeKey,
          expiresAt: new Date(now.getTime() + PROPOSAL_EXPIRY_MILLISECONDS),
          id,
          payload: candidate.payload,
          proposalType: candidate.payload.kind,
          resourceId,
          scope,
          sourceRevisionId: candidate.sourceRevisionId,
          sourceSpanEnd: candidate.sourceSpanEnd,
          sourceSpanStart: candidate.sourceSpanStart,
          status: 'pending',
          suppressionUntil: null,
          uncertaintyIndicators: candidate.uncertaintyIndicators,
          version: 1,
        };
        await ports.resources.save({
          createdAt: now,
          deletedAt: null,
          id: resourceId,
          resourceType: 'resource.proposal',
          scope,
        });
        await ports.proposals.save(proposal);
        await ports.derivationLinks.append({
          assertionClass: proposal.assertionClass,
          confidence: proposal.confidence,
          createdAt: now,
          derivedResourceId: resourceId,
          id: derivationLinkIdV1Schema.parse(this.dependencies.ids.next()),
          invalidatedAt: null,
          invalidationReason: null,
          relation: 'derived_from',
          scope,
          sourceResourceId: resourceIdV1Schema.parse(revision.entryId),
          sourceRevisionId: revision.id,
          sourceSpanEnd: proposal.sourceSpanEnd,
          sourceSpanStart: proposal.sourceSpanStart,
        });
        created.push(proposal);
      }
      if (created.length > 0) {
        await appendEvent(
          this.dependencies,
          ports,
          batchCreatedEventFor(this.dependencies, scope, context, created, now),
          now,
        );
      }
      return {
        clarificationQuestion: null,
        outcome: created.length > 0 ? 'proposals' : 'no_action',
        proposals: created,
      };
    });
  }

  public decide(
    scope: UserScope,
    proposalId: ProposalId,
    input: {
      readonly decision: 'dismiss';
      readonly expectedVersion: number;
      readonly ownerConfirmed: boolean;
    },
    context: TriageCommandContext,
  ): Promise<ProposalRecord> {
    return this.dependencies.transactions.run(scope, async (ports) => {
      const current = await ports.proposals.findById(scope, proposalId);
      if (!current) throw new NotFoundError('Proposal was not found.');
      if (current.version !== input.expectedVersion) {
        throw new ConflictError('Proposal version is stale.');
      }
      if (current.expiresAt <= this.dependencies.clock.now()) {
        throw new ConflictError('Proposal has expired.');
      }
      if (!input.ownerConfirmed) {
        throw new InvalidAuthorityError('Owner confirmation is required.');
      }
      const status = transitionProposalStatusV1(
        current.status,
        input.decision,
        current.assertionClass,
      );
      const now = this.dependencies.clock.now();
      const updated: ProposalRecord = {
        ...current,
        decidedAt: now,
        status,
        suppressionUntil:
          status === 'dismissed'
            ? new Date(now.getTime() + DISMISSAL_SUPPRESSION_MILLISECONDS)
            : null,
        version: current.version + 1,
      };
      const saved = await ports.proposals.update(updated, current.version);
      if (!saved) throw new ConflictError('Proposal was changed concurrently.');
      const eventType: ProposalEventType = 'proposal.dismissed.v1';
      await appendEvent(
        this.dependencies,
        ports,
        eventFor(this.dependencies, scope, context, eventType, updated, now),
        now,
      );
      return updated;
    });
  }
}

export class ProposalMaterialChangeInvalidationHook implements MaterialChangeInvalidationHook {
  public constructor(private readonly clock: Clock) {}

  public async invalidate(
    change: MaterialChangeInvalidation,
    ports?: Pick<TransactionPorts, 'proposals'>,
  ): Promise<void> {
    if (!ports)
      throw new ConflictError('Proposal invalidation ports are required.');
    await ports.proposals.stalePendingForRevision(
      change.scope,
      change.previousRevisionId,
      this.clock.now(),
    );
  }
}
