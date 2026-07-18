import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { recoveryCodeV1Schema, uuidV1Schema } from '@meridian/domain';
import type {
  Clock,
  IdGenerator,
  PasswordHasher,
  RecoveryCode,
  SecretService,
  Uuid,
} from '@meridian/domain';
import { argon2id, hash, verify } from 'argon2';

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Argon2idPasswordHasher implements PasswordHasher {
  public hash(plainText: string): Promise<string> {
    return hash(plainText, { type: argon2id });
  }

  public verify(hashValue: string, plainText: string): Promise<boolean> {
    return verify(hashValue, plainText);
  }
}

export class NodeSecretService implements SecretService {
  public generate(byteLength: number): string {
    return randomBytes(byteLength).toString('base64url');
  }

  public generateRecoveryCode(): RecoveryCode {
    const bytes = randomBytes(16);
    const characters = Array.from(bytes, (byte) =>
      RECOVERY_ALPHABET.charAt(byte & 31),
    ).join('');
    return recoveryCodeV1Schema.parse(
      `MRD-${characters.slice(0, 8)}-${characters.slice(8)}`,
    );
  }

  public hash(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  public matches(hashValue: string, secret: string): boolean {
    const candidate = this.hash(secret);
    if (hashValue.length !== candidate.length) return false;
    return timingSafeEqual(
      Buffer.from(hashValue, 'hex'),
      Buffer.from(candidate, 'hex'),
    );
  }
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  public next(): Uuid {
    return uuidV1Schema.parse(randomUUID());
  }
}
