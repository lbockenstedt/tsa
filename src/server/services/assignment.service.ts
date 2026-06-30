import { prisma } from '../prisma.js';
import { HttpError } from '../middleware/error.js';

/**
 * Auto-assignment automation.
 *
 * Pure functions operate on plain data so they can be unit-tested without a
 * database; `runAssignment` is the thin Prisma-backed wrapper that loads
 * signups, calls the pure core, and persists Assignment rows.
 */

export interface SlotInput {
  id: number;
  capacity: number;
  room: string;
  startsAt: Date;
}

export interface CompetitorSignupInput {
  userId: number;
  timeSlotId?: number | null;
}

export interface JudgeSignupInput {
  userId: number;
}

export interface CompetitorPlacement {
  competitorUserId: number;
  timeSlotId: number;
  room: string;
}

export interface JudgePlacement {
  judgeUserId: number;
  timeSlotId: number;
  room: string;
}

export interface AssignmentRow {
  competitorUserId: number;
  judgeUserId: number;
  timeSlotId: number;
  room: string;
}

const DEFAULT_JUDGES_PER_ROOM = 3;

/**
 * Distribute competitors across time slots respecting capacity.
 * Fills earliest slots first. If a competitor picked a slot at signup and it
 * still has capacity, they stay there; otherwise they overflow to the earliest
 * slot with remaining capacity.
 */
export function placeCompetitors(
  slots: SlotInput[],
  competitorSignups: CompetitorSignupInput[],
): CompetitorPlacement[] {
  const ordered = [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const remaining = new Map<number, number>(ordered.map((s) => [s.id, s.capacity]));
  const slotRoom = new Map<number, string>(ordered.map((s) => [s.id, s.room]));
  const placements: CompetitorPlacement[] = [];

  const earliestWithCapacity = (): number | undefined => ordered.find((s) => (remaining.get(s.id) ?? 0) > 0)?.id;

  for (const signup of competitorSignups) {
    let slotId: number | undefined;

    // Honor the competitor's chosen slot if it still has room.
    if (signup.timeSlotId && (remaining.get(signup.timeSlotId) ?? 0) > 0) {
      slotId = signup.timeSlotId;
    } else {
      slotId = earliestWithCapacity();
    }

    if (slotId === undefined) {
      throw new HttpError(409, 'Not enough capacity across time slots for all competitors');
    }

    remaining.set(slotId, (remaining.get(slotId) ?? 0) - 1);
    placements.push({
      competitorUserId: signup.userId,
      timeSlotId: slotId,
      room: slotRoom.get(slotId) ?? 'Main',
    });
  }

  return placements;
}

/**
 * Balance judges across the occupied slots so each room has up to
 * `judgesPerRoom` judges, assigning round-robin to the least-full room.
 */
export function assignJudgesToSlots(
  competitorPlacements: CompetitorPlacement[],
  slots: SlotInput[],
  judgeSignups: JudgeSignupInput[],
  judgesPerRoom = DEFAULT_JUDGES_PER_ROOM,
): JudgePlacement[] {
  // Only slots that actually host competitors need judges.
  const occupiedSlotIds = Array.from(new Set(competitorPlacements.map((p) => p.timeSlotId)));
  const slotRoom = new Map<number, string>(slots.map((s) => [s.id, s.room]));
  const judgeCounts = new Map<number, number>(occupiedSlotIds.map((id) => [id, 0]));
  const placements: JudgePlacement[] = [];

  for (const judge of judgeSignups) {
    // Pick the occupied room with the fewest judges so far that is still under cap.
    let target: number | undefined;
    let minCount = Infinity;
    for (const slotId of occupiedSlotIds) {
      const count = judgeCounts.get(slotId) ?? 0;
      if (count < judgesPerRoom && count < minCount) {
        minCount = count;
        target = slotId;
      }
    }

    if (target === undefined) {
      // Every room is at capacity; spread extra judges evenly across rooms.
      target = occupiedSlotIds[judgeSignups.indexOf(judge) % occupiedSlotIds.length];
    }

    judgeCounts.set(target, (judgeCounts.get(target) ?? 0) + 1);
    placements.push({
      judgeUserId: judge.userId,
      timeSlotId: target,
      room: slotRoom.get(target) ?? 'Main',
    });
  }

  return placements;
}

/**
 * Combine competitor and judge placements into Assignment rows.
 * Each judge in a room scores every competitor in that room => C × J rows.
 */
export function buildAssignmentRows(
  competitorPlacements: CompetitorPlacement[],
  judgePlacements: JudgePlacement[],
): AssignmentRow[] {
  const judgesBySlot = new Map<number, JudgePlacement[]>();
  for (const jp of judgePlacements) {
    const arr = judgesBySlot.get(jp.timeSlotId) ?? [];
    arr.push(jp);
    judgesBySlot.set(jp.timeSlotId, arr);
  }

  const rows: AssignmentRow[] = [];
  for (const cp of competitorPlacements) {
    const judges = judgesBySlot.get(cp.timeSlotId) ?? [];
    for (const jp of judges) {
      rows.push({
        competitorUserId: cp.competitorUserId,
        judgeUserId: jp.judgeUserId,
        timeSlotId: cp.timeSlotId,
        room: cp.room,
      });
    }
  }
  return rows;
}

/**
 * Run the full assignment for an event and persist the results.
 * Replaces any prior assignments for the event. Returns the created rows.
 */
export async function runAssignment(eventId: number): Promise<AssignmentRow[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new HttpError(404, 'Event not found');

  const slots: SlotInput[] = await prisma.timeSlot.findMany({
    where: { eventId },
    orderBy: { startsAt: 'asc' },
  }).then((rows) => rows.map((s) => ({ id: s.id, capacity: s.capacity, room: s.room, startsAt: s.startsAt })));

  if (slots.length === 0) throw new HttpError(400, 'Event has no time slots');

  const competitorSignups: CompetitorSignupInput[] = await prisma.signup.findMany({
    where: { eventId, role: 'COMPETITOR' },
  }).then((rows) => rows.map((s) => ({ userId: s.userId, timeSlotId: s.timeSlotId })));

  const judgeSignups: JudgeSignupInput[] = await prisma.signup.findMany({
    where: { eventId, role: 'JUDGE' },
  }).then((rows) => rows.map((s) => ({ userId: s.userId })));

  if (competitorSignups.length === 0) throw new HttpError(400, 'No competitors signed up');
  if (judgeSignups.length === 0) throw new HttpError(400, 'No judges signed up');

  const competitorPlacements = placeCompetitors(slots, competitorSignups);
  const judgePlacements = assignJudgesToSlots(competitorPlacements, slots, judgeSignups);
  const rows = buildAssignmentRows(competitorPlacements, judgePlacements);

  // Persist in a transaction: wipe prior assignments, insert new ones, update status.
  await prisma.$transaction([
    prisma.assignment.deleteMany({ where: { eventId } }),
    prisma.assignment.createMany({
      data: rows.map((r) => ({
        eventId,
        timeSlotId: r.timeSlotId,
        competitorUserId: r.competitorUserId,
        judgeUserId: r.judgeUserId,
        room: r.room,
      })),
    }),
    prisma.event.update({ where: { id: eventId }, data: { status: 'ASSIGNED' } }),
  ]);

  return rows;
}