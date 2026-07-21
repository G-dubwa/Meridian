export type DomainErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'BOOTSTRAP_COMPLETE'
  | 'CONFLICT'
  | 'CSRF_INVALID'
  | 'INVALID_AUTHORITY'
  | 'INTEGRATION_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'PROCESSING_CLASS_VIOLATION'
  | 'PROHIBITED_ACTION'
  | 'RATE_LIMITED'
  | 'SESSION_INVALID'
  | 'VALIDATION_FAILED';

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class AuthenticationFailedError extends DomainError {
  public constructor() {
    super('AUTHENTICATION_FAILED', 'Authentication was rejected.');
    this.name = 'AuthenticationFailedError';
  }
}

export class BootstrapCompleteError extends DomainError {
  public constructor() {
    super('BOOTSTRAP_COMPLETE', 'The owner account already exists.');
    this.name = 'BootstrapCompleteError';
  }
}

export class RateLimitedError extends DomainError {
  public constructor(public readonly retryAt: Date | null) {
    super('RATE_LIMITED', 'Authentication is temporarily rate limited.');
    this.name = 'RateLimitedError';
  }
}

export class SessionInvalidError extends DomainError {
  public constructor() {
    super('SESSION_INVALID', 'The session is invalid or expired.');
    this.name = 'SessionInvalidError';
  }
}

export class CsrfInvalidError extends DomainError {
  public constructor() {
    super('CSRF_INVALID', 'CSRF validation failed.');
    this.name = 'CsrfInvalidError';
  }
}

export class InvalidAuthorityError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('INVALID_AUTHORITY', message, details);
    this.name = 'InvalidAuthorityError';
  }
}

export class ProhibitedActionError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('PROHIBITED_ACTION', message, details);
    this.name = 'ProhibitedActionError';
  }
}

export class ProcessingClassViolationError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('PROCESSING_CLASS_VIOLATION', message, details);
    this.name = 'ProcessingClassViolationError';
  }
}

export class NotFoundError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('NOT_FOUND', message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export type IntegrationConfigurationFailureStage =
  'microsoft_configuration' | 'oauth_session_persistence';

export class IntegrationConfigurationInvalidError extends ConflictError {
  public constructor(
    public readonly stage: IntegrationConfigurationFailureStage,
    databaseCode?: string,
  ) {
    super('The integration configuration is not ready.', {
      ...(databaseCode === undefined ? {} : { databaseCode }),
      stage,
    });
    this.name = 'IntegrationConfigurationInvalidError';
  }
}

export class DomainValidationError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('VALIDATION_FAILED', message, details);
    this.name = 'DomainValidationError';
  }
}

export class IntegrationUnavailableError extends DomainError {
  public constructor() {
    super(
      'INTEGRATION_UNAVAILABLE',
      'The requested integration is not configured.',
    );
    this.name = 'IntegrationUnavailableError';
  }
}
