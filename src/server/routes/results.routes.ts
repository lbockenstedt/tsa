import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../auth/roles.js';
import { HttpError } from '../middleware/error.js';
import { runResults } from '../services/results.service.js';

export const resultsRouter = Router();

// Compute & persist results for an event (admin only). Returns ranked results.
resultsRouter.post('/event/:eventId/compute', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const results = await runResults(Number(req.params.eventId));
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// View published results for an event (any authenticated user).
resultsRouter.get('/event/:eventId', requireAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: Number(req.params.eventId) } });
    if (!event) throw new HttpError(404, 'Event not found');
    const results = await prisma.result.findMany({
      where: { eventId: event.id },
      include: { competitor: { select: { id: true, name: true } } },
      orderBy: { rank: 'asc' },
    });
    res.json(results);
  } catch (err) {
    next(err);
  }
});