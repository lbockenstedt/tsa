import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../auth/roles.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';

export const scoreRouter = Router();

const scoreEntrySchema = z.object({
  criteriaName: z.string().min(1),
  score: z.number().min(0),
});

const submitScoresSchema = z.object({
  assignmentId: z.number().int().positive(),
  scores: z.array(scoreEntrySchema).min(1),
});

// A judge submits scores for one of their assignments.
scoreRouter.post('/', requireAuth, requireRole('JUDGE', 'ADMIN'), validateBody(submitScoresSchema), async (req, res, next) => {
  try {
    const { assignmentId, scores } = req.body as z.infer<typeof submitScoresSchema>;
    const judgeUserId = req.user!.sub;

    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new HttpError(404, 'Assignment not found');
    if (assignment.judgeUserId !== judgeUserId && req.user!.role !== 'ADMIN') {
      throw new HttpError(403, 'You can only score your own assignments');
    }

    // Validate scores against the rubric's max scores.
    const event = await prisma.event.findUnique({ where: { id: assignment.eventId }, include: { rubric: true } });
    if (!event?.rubric) throw new HttpError(400, 'Event has no rubric');
    const criteria = event.rubric.criteria as { name: string; maxScore: number; weight: number }[];
    const byName = new Map(criteria.map((c) => [c.name, c]));
    for (const s of scores) {
      const criterion = byName.get(s.criteriaName);
      if (!criterion) throw new HttpError(400, `Unknown criterion: ${s.criteriaName}`);
      if (s.score > criterion.maxScore) throw new HttpError(400, `Score for ${s.criteriaName} exceeds max ${criterion.maxScore}`);
    }

    // Upsert each score (unique on assignment + judge + criteriaName).
    await prisma.$transaction(
      scores.map((s) =>
        prisma.score.upsert({
          where: {
            assignmentId_judgeUserId_criteriaName: {
              assignmentId,
              judgeUserId,
              criteriaName: s.criteriaName,
            },
          },
          update: { score: s.score },
          create: { assignmentId, judgeUserId, criteriaName: s.criteriaName, score: s.score },
        }),
      ),
    );

    // Mark event SCORED once at least one score is in.
    await prisma.event.update({ where: { id: assignment.eventId }, data: { status: 'SCORED' } });

    res.status(201).json({ ok: true, count: scores.length });
  } catch (err) {
    next(err);
  }
});