import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';

/** Middleware factory: allow only the given roles. Requires requireAuth to run first. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}