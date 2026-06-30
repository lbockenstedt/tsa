import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../auth/session.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { sendSignupConfirmation } from '../services/notification.service.js';
import type { SignupRole } from '@prisma/client';

export const signupRouter = Router();

const signupSchema = z.object({
  eventId: z.number().int().positive(),
  role: z.enum(['JUDGE', 'COMPETITOR']),
  timeSlotId: z.number().int().positive().optional(),
});

// Sign up for an event as judge or competitor.
// Competitors must pick a time slot; judges do not.
signupRouter.post('/', requireAuth, validateBody(signupSchema), async (req, res, next) => {
  try {
    const { eventId, role, timeSlotId } = req.body as z.infer<typeof signupSchema>;
    const userId = req.user!.sub;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new HttpError(404, 'Event not found');
    if (event.status !== 'OPEN') throw new HttpError(409, 'Signups are closed for this event');
    if (new Date() > event.signupClosesAt) throw new HttpError(409, 'Signup deadline has passed');

    if (role === 'COMPETITOR') {
      if (!timeSlotId) throw new HttpError(400, 'Competitors must choose a time slot');
      const slot = await prisma.timeSlot.findUnique({ where: { id: timeSlotId } });
      if (!slot || slot.eventId !== eventId) throw new HttpError(400, 'Invalid time slot');
      const taken = await prisma.signup.count({ where: { eventId, role: 'COMPETITOR', timeSlotId } });
      if (taken >= slot.capacity) throw new HttpError(409, 'That time slot is full');
    }

    const signup = await prisma.signup.create({
      data: { eventId, userId, role: role as SignupRole, timeSlotId: role === 'COMPETITOR' ? timeSlotId : null },
    });

    // Fire-and-forget email; failures are logged, never thrown.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      void sendSignupConfirmation({
        email: user.email,
        name: user.name,
        eventName: event.name,
        role: role === 'JUDGE' ? 'judge' : 'competitor',
      });
    }

    res.status(201).json(signup);
  } catch (err) {
    // Prisma unique-constraint violation => double signup.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      next(new HttpError(409, 'You are already signed up for this role'));
      return;
    }
    next(err);
  }
});

// List signups for an event (admin/organizer view).
signupRouter.get('/event/:eventId', requireAuth, async (req, res, next) => {
  try {
    const signups = await prisma.signup.findMany({
      where: { eventId: Number(req.params.eventId) },
      include: { user: { select: { id: true, name: true, email: true } }, timeSlot: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(signups);
  } catch (err) {
    next(err);
  }
});

// My signups (current user).
signupRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const signups = await prisma.signup.findMany({
      where: { userId: req.user!.sub },
      include: { event: true, timeSlot: true },
    });
    res.json(signups);
  } catch (err) {
    next(err);
  }
});