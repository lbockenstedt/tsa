import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../auth/roles.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';

export const eventRouter = Router();

const criterionSchema = z.object({
  name: z.string().min(1),
  maxScore: z.number().positive(),
  weight: z.number().min(0),
});

const timeSlotSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().positive().default(1),
  room: z.string().min(1).default('Main'),
});

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  location: z.string().default(''),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  signupClosesAt: z.string().datetime(),
  rubric: z.array(criterionSchema).min(1),
  timeSlots: z.array(timeSlotSchema).min(1),
});

// List all events (any authenticated user).
eventRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { startsAt: 'asc' },
      include: { _count: { select: { signups: true } } },
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

eventRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: Number(req.params.id) },
      include: { rubric: true, timeSlots: { orderBy: { startsAt: 'asc' } } },
    });
    if (!event) throw new HttpError(404, 'Event not found');
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// Create an event with rubric + time slots (admin only).
eventRouter.post('/', requireAuth, requireRole('ADMIN'), validateBody(createEventSchema), async (req, res, next) => {
  try {
    const { rubric, timeSlots, startsAt, endsAt, signupClosesAt, ...rest } = req.body as z.infer<
      typeof createEventSchema
    >;
    const event = await prisma.event.create({
      data: {
        ...rest,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        signupClosesAt: new Date(signupClosesAt),
        rubric: { create: { criteria: rubric } },
        timeSlots: {
          create: timeSlots.map((s) => ({
            startsAt: new Date(s.startsAt),
            endsAt: new Date(s.endsAt),
            capacity: s.capacity,
            room: s.room,
          })),
        },
      },
      include: { rubric: true, timeSlots: true },
    });
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// Close signups for an event (admin only).
eventRouter.patch('/:id/close', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const event = await prisma.event.update({
      where: { id: Number(req.params.id) },
      data: { status: 'CLOSED' },
    });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

export type CreateEventInput = z.infer<typeof createEventSchema>;