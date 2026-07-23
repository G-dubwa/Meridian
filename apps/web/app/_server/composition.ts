import {
  ActionService,
  AuthenticationService,
  GoalService,
  InterpretationService,
  JournalService,
  MicrosoftConnectionService,
  ModelGatewayService,
  SchedulingService,
  ProposalMaterialChangeInvalidationHook,
  OutboxHealthService,
  TriageService,
  TodayService,
} from '@meridian/application';
import {
  Argon2idPasswordHasher,
  CryptoIdGenerator,
  NodeSecretService,
  SystemClock,
} from '@meridian/infrastructure-auth';
import {
  DrizzleAuthenticationTransactionManager,
  DrizzleOAuthAuthorizationSessionStore,
  DrizzleTransactionManager,
  createDatabaseClient,
} from '@meridian/infrastructure-db';
import { createMicrosoftInfrastructure } from '@meridian/infrastructure-ms-graph';
import { OpenAiResponsesAdapter } from '@meridian/infrastructure-models';
import {
  TRIAGE_EXTRACTION_PROMPT_ID,
  TRIAGE_EXTRACTION_PROMPT_VERSION,
  renderTriageExtractionPromptV1,
  triageExtractionOutputJsonSchemaV1,
  triageExtractionOutputV1Schema,
  triageExtractionSystemInstructionV1,
} from '@meridian/prompts';

export interface AuthenticationRuntime {
  readonly actions: ActionService;
  readonly goals: GoalService;
  readonly ids: CryptoIdGenerator;
  readonly interpretation?: InterpretationService;
  readonly journal: JournalService;
  readonly microsoft: MicrosoftConnectionService;
  readonly scheduling: SchedulingService;
  readonly triage: TriageService;
  readonly today: TodayService;
  readonly secrets: NodeSecretService;
  readonly service: AuthenticationService;
  readonly workerHealth: OutboxHealthService;
}

function createRuntime(): AuthenticationRuntime {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const database = createDatabaseClient(connectionString);
  const ids = new CryptoIdGenerator();
  const secrets = new NodeSecretService();
  const transactions = new DrizzleTransactionManager(database.database);
  const microsoftInfrastructure = createMicrosoftInfrastructure({
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
    tokenEncryptionKey: process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY,
  });
  const triage = new TriageService({
    clock: new SystemClock(),
    ids,
    transactions,
  });
  const openAiKey = process.env.OPENAI_API_KEY;
  const interpretation = openAiKey
    ? new InterpretationService({
        gateway: new ModelGatewayService({
          adapter: new OpenAiResponsesAdapter(openAiKey),
          consent: {
            standardProactiveEvidenceEligible: false,
            sensitiveExternalEmbedding: false,
            sensitiveExternalLlm: false,
            sensitiveProactiveSurfacing: false,
          },
          observations: { observe: () => undefined },
        }),
        hasher: secrets,
        prompt: {
          id: TRIAGE_EXTRACTION_PROMPT_ID,
          outputSchema: triageExtractionOutputJsonSchemaV1,
          parse: (output) => triageExtractionOutputV1Schema.parse(output),
          render: renderTriageExtractionPromptV1,
          systemInstruction: triageExtractionSystemInstructionV1,
          version: TRIAGE_EXTRACTION_PROMPT_VERSION,
        },
        transactions,
        triage,
      })
    : undefined;
  return {
    actions: new ActionService({
      clock: new SystemClock(),
      ids,
      transactions,
    }),
    goals: new GoalService({
      clock: new SystemClock(),
      ids,
      transactions,
    }),
    ids,
    ...(interpretation === undefined ? {} : { interpretation }),
    journal: new JournalService({
      clock: new SystemClock(),
      contentHasher: secrets,
      ids,
      invalidation: new ProposalMaterialChangeInvalidationHook(
        new SystemClock(),
      ),
      transactions,
    }),
    microsoft: new MicrosoftConnectionService({
      ...(microsoftInfrastructure === undefined
        ? {}
        : { authorization: microsoftInfrastructure }),
      clock: new SystemClock(),
      ids,
      oauthSessions: new DrizzleOAuthAuthorizationSessionStore(
        database.database,
      ),
      secrets,
      transactions,
    }),
    scheduling: new SchedulingService({
      clock: new SystemClock(),
      ids,
      transactions,
    }),
    secrets,
    service: new AuthenticationService({
      clock: new SystemClock(),
      ids,
      passwords: new Argon2idPasswordHasher(),
      secrets,
      transactions: new DrizzleAuthenticationTransactionManager(
        database.database,
      ),
    }),
    triage,
    today: new TodayService({
      clock: new SystemClock(),
      ids,
      transactions,
    }),
    workerHealth: new OutboxHealthService(transactions),
  };
}

const shared = globalThis as typeof globalThis & {
  meridianAuthenticationRuntime?: AuthenticationRuntime;
};

export function authenticationRuntime(): AuthenticationRuntime {
  shared.meridianAuthenticationRuntime ??= createRuntime();
  return shared.meridianAuthenticationRuntime;
}
