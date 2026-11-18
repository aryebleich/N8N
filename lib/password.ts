import { hash, verify } from '@node-rs/argon2';

// argon2id, OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// Verifying against this keeps login timing the same for unknown emails.
export const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$UceCaYHspkVZEEGAzgl6Nw$81DJRZE3cdBRPxm3IDKgBedWZPNVnGVY2xptsOIcOhw';
