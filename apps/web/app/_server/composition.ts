import {
  ActionService,
  AuthenticationService,
  InterpretationService,
  JournalService,
  MicrosoftConnectionService,
  MicrosoftTodoEnablementService,
  MicrosoftTodoSpikeService,
  ModelGatewayService,
  ProposalMaterialChangeInvalidationHook,
  OutboxHealthService,
  TriageService,
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
import {
  MicrosoftTodoHttpGateway,
  createMicrosoftInfrastructure,
} from '@meridian/infrastructure-ms-graph';
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
  readonly ids: CryptoIdGenerator;
  readonly interpretation?: InterpretationService;
  readonly journal: JournalService;
  readonly microsoft: MicrosoftConnectionService;
  readonly microsoftTodo?: MicrosoftTodoSpikeService;
  readonly microsoftTodoEnablement?: MicrosoftTodoEnablementService;
  readonly triage: TriageService;
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
  const clock = new SystemClock();
  const transactions = new DrizzleTransactionManager(database.database);
  const microsoftInfrastructure = createMicrosoftInfrastructure({
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
    tokenEncryptionKey: process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY,
  });
  const triage = new TriageService({
    clock,
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
  const actions = new ActionService({
    clock,
    ids,
    transactions,
  });
  const microsoft = new MicrosoftConnectionService({
    ...(microsoftInfrastructure === undefined
      ? {}
      : { authorization: microsoftInfrastructure }),
    clock,
    ids,
    oauthSessions: new DrizzleOAuthAuthorizationSessionStore(database.database),
    secrets,
    transactions,
  });
  const microsoftTodo =
    microsoftInfrastructure === undefined
      ? undefined
      : new MicrosoftTodoSpikeService({
          accessTokenFor: (scope) => microsoft.accessTokenFor(scope),
          clock,
          gateway: new MicrosoftTodoHttpGateway(),
          ids,
          projectionHasher: secrets,
          transactions,
        });
  const microsoftTodoEnablement = microsoftTodo
    ? new MicrosoftTodoEnablementService({
        actions,
        clock,
        todo: microsoftTodo,
        transactions,
      })
    : undefined;
  return {
    actions,
    ...(microsoftTodo === undefined ? {} : { microsoftTodo }),
    ...(microsoftTodoEnablement === undefined
      ? {}
      : { microsoftTodoEnablement }),
    ids,
    ...(interpretation === undefined ? {} : { interpretation }),
    journal: new JournalService({
      clock,
      ids,
      contentHasher: secrets,
      invalidation: new ProposalMaterialChangeInvalidationHook(clock),
      transactions,
    }),
    microsoft,
    secrets,
    service: new AuthenticationService({
      clock,
      ids,
      passwords: new Argon2idPasswordHasher(),
      secrets,
      transactions: new DrizzleAuthenticationTransactionManager(
        database.database,
      ),
    }),
    triage,
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
