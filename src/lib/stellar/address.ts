/**
 * Stellar address helpers shared by the reputation and escrow surfaces.
 *
 * The heavy lifting (base32 decoding + StrKey CRC16-XModem verification)
 * lives in `src/lib/stellarAddress.ts`. This module is the stable entry point
 * the feature modules import so address handling has exactly one public API.
 */

import {
  isValidStellarAddress,
  normalizeStellarAddress,
} from '@/lib/stellarAddress';

/** Length of a StrKey-encoded Stellar address (account or contract). */
export const STELLAR_ADDRESS_LENGTH = 56;

/**
 * Structural shape of a Soroban contract address. Contract ids use the same
 * StrKey alphabet as account ids but a different version byte, hence the `C`
 * prefix. Structural checks only — checksum verification is performed by
 * `@stellar/stellar-sdk` where a contract address is actually consumed.
 */
export const STELLAR_CONTRACT_ADDRESS_PATTERN = /^C[A-Z2-7]{55}$/;

/**
 * Normalises user input into a canonical address: surrounding whitespace is
 * removed and the value is upper-cased. Never throws.
 */
export function normalizeAddress(value: string | null | undefined): string {
  return normalizeStellarAddress(value);
}

/**
 * Returns `true` when `value` is a well-formed Stellar *account* address with
 * a valid StrKey checksum.
 */
export function validateAddress(value: unknown): boolean {
  return typeof value === 'string' && isValidStellarAddress(value);
}

/**
 * Returns `true` when `value` looks like a Soroban *contract* address
 * (`C…`, 56 characters, Stellar base32 alphabet).
 *
 * This is a structural guard for route params and form input; it does not
 * verify the checksum.
 */
export function isContractAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return STELLAR_CONTRACT_ADDRESS_PATTERN.test(normalizeAddress(value));
}
