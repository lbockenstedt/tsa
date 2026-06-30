import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../auth/roles.js';
import { HttpError } from '../middleware/error.js';
import { runAssignment } from '../services/assignment.service.js';
import { sendAssignmentNotification } from '../services/notification.service.js';

export const assignmentRouter = Router();

// Run auto-assignment for an event (admin only). Persists assignments + emails participants.
assignmentRouter.post('/event/:eventId/run', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    const rows = await runAssignment(eventId);

    // Email each participant their assignment summary (best-effort).
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.competitorUserId).concat(rows.map((r) => r.judgeUserId)) } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    if (event) {
      // Competitor summaries
      const byCompetitor = new Map<number, string[]>();
      for (const r of rows) {
        const arr = byCompetitor.get(r.competitorUserId) ?? [];
        arr.push(`Room ${r.room}`);
        byCompetitor.set(r.competitorUserId, arr);
      }
      for (const [uid, rooms] of byCompetitor) {
        const u = userMap.get(uid);
        if (u) void sendAssignmentNotification({ email: u.email, name: u.name, eventName: event.name, details: `You will compete in: ${Array.from(new Set(rooms)).join(', ')}` });
      }
      // Judge summaries
      const byJudge = new Map<number, string[]>();
      for (const r of rows) {
        const arr = byJudge.get(r.judgeUserId) ?? [];
        arr.push(`Room ${r.room}`);
        byJudge.set(r.judgeUserId, arr);
      }
      for (const [uid, rooms] of byJudge) {
        const u = userMap.get(uid);
        if (u) void sendAssignmentNotification({ email: u.email, name: u.name, eventName: event.name, details: `You will judge in: ${Array.from(new Set(rooms)).join(', ')}` });
      }
    }

    res.json({ count: rows.length, status: 'ASSIGNED' });
  } catch (err) {
    next(err);
  }
});

// List assignments for an event.
assignmentRouter.get('/event/:eventId', requireAuth, async (req, res, next) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { eventId: Number(req.params.eventId) },
      include: {
        competitor: { select: { id: true, name: true } },
        judge: { select: { id: true, name: true } },
        timeSlot: true,
      },
    });
    res.json(assignments);
  } catch (err) {
    next(err);
  }
});

// Assignments for the current user (judge sees what to score; competitor sees their placement).
assignmentRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const [asCompetitor, asJudge] = await Promise.all([
      prisma.assignment.findMany({
        where: { competitorUserId: userId },
        include: { event: true, timeSlot: true, judge: { select: { name: true } } },
      }),
      prisma.assignment.findMany({
        where: { judgeUserId: userId },
        include: { event: true, timeSlot: true, competitor: { select: { id: true, name: true } }, scores: true },
      }),
    ]);
    res.json({ asCompetitor, asJudge });
  } catch (err) {
    next(err);
  }
});