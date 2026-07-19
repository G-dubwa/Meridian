import {
  DomainValidationError,
  IntegrationUnavailableError,
  InvalidAuthorityError,
  NotFoundError,
  entryRevisionIdV1Schema,
} from '@meridian/domain';
import type {
  EntryRevisionId,
  InterpretationOutputV1,
  SecretService,
  TransactionManager,
  UserScope,
} from '@meridian/domain';
import type { ModelGatewayService } from './model-gateway.js';
import type {
  InterpretationDisposition,
  TriageCommandContext,
  TriageService,
} from './triage.js';

export interface TriageExtractionPromptResultV1 {
  readonly schemaVersion: 1;
  readonly outcome: 'proposals' | 'clarification' | 'no_action';
  readonly proposals: readonly {
    readonly assertionClass:
      | 'explicit_statement'
      | 'strong_interpretation'
      | 'weak_inference'
      | 'hypothesis';
    readonly authorityClass: 'inferred_structure';
    readonly confidence: number;
    readonly detail: string | null;
    readonly kind: 'task' | 'reminder' | 'commitment';
    readonly sourceSpanEnd: number;
    readonly sourceSpanStart: number;
    readonly sourceText: string;
    readonly temporalPhrase: string | null;
    readonly title: string;
    readonly uncertaintyIndicators: readonly string[];
  }[];
  readonly clarificationQuestion: string | null;
  readonly uncertaintyIndicators: readonly string[];
}

export interface TriageExtractionPromptContractV1 {
  readonly id: string;
  readonly version: string;
  readonly systemInstruction: string;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  render(sourceRevisionId: string, bodyMarkdown: string): string;
  parse(output: unknown): TriageExtractionPromptResultV1;
}

export interface InterpretationServiceDependencies {
  readonly gateway: ModelGatewayService;
  readonly hasher: Pick<SecretService, 'hash'>;
  readonly prompt: TriageExtractionPromptContractV1;
  readonly transactions: TransactionManager;
  readonly triage: TriageService;
}

export class InterpretationService {
  public constructor(
    private readonly dependencies: InterpretationServiceDependencies,
  ) {}

  public async proposeForRevision(
    scope: UserScope,
    revisionId: EntryRevisionId,
    ownerConfirmedExternalProcessing: boolean,
    context: TriageCommandContext,
  ): Promise<InterpretationDisposition> {
    if (!ownerConfirmedExternalProcessing) {
      throw new InvalidAuthorityError(
        'Owner confirmation is required before external interpretation.',
      );
    }
    const revision = await this.dependencies.transactions.run(
      scope,
      async (ports) => {
        const found = await ports.entryRevisions.findById(
          scope,
          entryRevisionIdV1Schema.parse(revisionId),
        );
        if (!found) throw new NotFoundError('Source revision was not found.');
        const entry = await ports.entries.findById(scope, found.entryId);
        if (entry?.currentRevisionId !== found.id) {
          throw new InvalidAuthorityError(
            'Only the current source revision may be interpreted.',
          );
        }
        if (found.processingClass !== 'standard') {
          throw new InvalidAuthorityError(
            'External interpretation is restricted to Standard revisions.',
          );
        }
        return found;
      },
    );

    let result;
    try {
      result = await this.dependencies.gateway.invoke({
        fixtureId: 'production.triage-extraction',
        maxOutputTokens: 1_200,
        modelId: 'gpt-5.6-sol',
        outputAuthority: 'triage_proposal_only',
        outputSchema: this.dependencies.prompt.outputSchema,
        processingClass: 'standard',
        prompt: this.dependencies.prompt.render(
          revision.id,
          revision.bodyMarkdown,
        ),
        promptId: this.dependencies.prompt.id,
        promptVersion: this.dependencies.prompt.version,
        provider: 'openai',
        purpose: 'production',
        reasoningEffort: 'none',
        systemInstruction: this.dependencies.prompt.systemInstruction,
        taskClass: 'bounded_extraction',
        timeoutMilliseconds: 45_000,
      });
    } catch (error) {
      void error;
      throw new IntegrationUnavailableError();
    }
    let output: TriageExtractionPromptResultV1;
    try {
      output = this.dependencies.prompt.parse(result.output);
    } catch (error) {
      void error;
      throw new IntegrationUnavailableError();
    }
    const interpreted: InterpretationOutputV1 = {
      clarificationQuestion: output.clarificationQuestion,
      outcome: output.outcome,
      proposals: output.proposals.map((candidate) => {
        if (
          revision.bodyMarkdown.slice(
            candidate.sourceSpanStart,
            candidate.sourceSpanEnd,
          ) !== candidate.sourceText
        ) {
          throw new DomainValidationError(
            'Proposal source text does not match its authoritative span.',
          );
        }
        return {
          assertionClass: candidate.assertionClass,
          authorityClass: candidate.authorityClass,
          confidence: candidate.confidence,
          dedupeKey: this.dependencies.hasher.hash(
            JSON.stringify([
              revision.id,
              candidate.sourceSpanStart,
              candidate.sourceSpanEnd,
              candidate.kind,
              candidate.title,
            ]),
          ),
          payload: {
            kind: candidate.kind,
            schemaVersion: 1,
            title: candidate.title,
            ...(candidate.detail === null ? {} : { detail: candidate.detail }),
            ...(candidate.temporalPhrase === null
              ? {}
              : { temporalPhrase: candidate.temporalPhrase }),
          },
          sourceRevisionId: revision.id,
          sourceSpanEnd: candidate.sourceSpanEnd,
          sourceSpanStart: candidate.sourceSpanStart,
          uncertaintyIndicators: [...candidate.uncertaintyIndicators],
        };
      }),
      schemaVersion: 1,
      uncertaintyIndicators: [...output.uncertaintyIndicators],
    };
    return this.dependencies.triage.recordInterpretation(
      scope,
      revision.id,
      interpreted,
      context,
    );
  }
}
