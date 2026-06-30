import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env.js';

export interface JwtPayload {
  sub: number; // user id
  role: string;
  email: string;
  name: string;
}

/** Sign a JWT for a given user payload. */
export function signToken(payload: JwtPayload): string {
  // `expiresIn` is a branded `StringValue` in @types/jsonwebtoken; cast from env string.
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/** Verify a JWT and return its payload, or null if invalid/expired. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    // jwt.verify returns jsonwebtoken's JwtPayload (no role/email/name); cast through unknown.
    return jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'tsa_session';