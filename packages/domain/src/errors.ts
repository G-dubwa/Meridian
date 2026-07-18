export type DomainErrorCode =
  | 'CONFLICT'
  | 'INVALID_AUTHORITY'
  | 'NOT_FOUND'
  | 'PROCESSING_CLASS_VIOLATION'
  | 'PROHIBITED_ACTION'
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

export class DomainValidationError extends DomainError {
  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super('VALIDATION_FAILED', message, details);
    this.name = 'DomainValidationError';
  }
}
