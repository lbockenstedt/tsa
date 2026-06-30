import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { HttpError } from './error.js';

/** Validate req.body against a zod schema; on failure throw a 400 HttpError. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new HttpError(400, 'Validation failed: ' + result.error.issues.map((i) => i.message).join('; ')));
      return;
    }
    req.body = result.data;
    next();
  };
}