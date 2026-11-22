/**
 * Stellar address entry point for the escrow surfaces.
 *
 * Address validation itself lives in `src/lib/stellarAddress.ts`; this module
 * exposes the small, stable API the escrow code imports.
 */

import { isValidStellarAddress, normalizeStellarAddress } from '@/lib/stellarAddress';

/** Length of a StrKey-encoded Stellar address (account or contract). */
export const STELLAR_ADDRESS_LENGTH = 56;

/** Structural shape of a Soroban contract address (`C…`, base32). */
export const STELLAR_CONTRACT_ADDRESS_PATTERN = /^C[A-Z2-7]{55}$/;

/** Normalises user input into a canonical (trimmed, upper-case) address. */
export function normalizeAddress(value: string | null | undefined): string {
  return normalizeStellarAddress(value);
}

/** Returns `true` for a Stellar account address with a valid StrKey checksum. */
export function validateAddress(value: unknown): boolean {
  return typeof value === 'string' && isValidStellarAddress(value);
}

/** Returns `true` for a structurally valid Soroban contract address. */
export function isContractAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return STELLAR_CONTRACT_ADDRESS_PATTERN.test(normalizeAddress(value));
}
