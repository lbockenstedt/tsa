import { describe, it, expect } from 'vitest';
import {
  placeCompetitors,
  assignJudgesToSlots,
  buildAssignmentRows,
  type SlotInput,
} from '../../src/server/services/assignment.service.js';

const t0 = new Date('2026-03-01T10:00:00Z');
const slot = (id: number, capacity: number, room: string, offsetMin = 0): SlotInput => ({
  id,
  capacity,
  room,
  startsAt: new Date(t0.getTime() + offsetMin * 60_000),
});

describe('placeCompetitors', () => {
  it('fills earliest slots first respecting capacity', () => {
    const slots = [slot(1, 2, 'A', 0), slot(2, 2, 'B', 60)];
    const signups = [1, 2, 3, 4].map((userId) => ({ userId }));
    const placements = placeCompetitors(slots, signups);
    // First two go to slot 1 (capacity 2), next two to slot 2.
    expect(placements.map((p) => p.timeSlotId)).toEqual([1, 1, 2, 2]);
    expect(placements.every((p) => p.room === (p.timeSlotId === 1 ? 'A' : 'B'))).toBe(true);
  });

  it('keeps a competitor in their chosen slot if it has capacity', () => {
    const slots = [slot(1, 2, 'A', 0), slot(2, 2, 'B', 60)];
    const placements = placeCompetitors(slots, [
      { userId: 1, timeSlotId: 2 },
      { userId: 2, timeSlotId: 2 },
    ]);
    expect(placements.map((p) => p.timeSlotId)).toEqual([2, 2]);
  });

  it('overflows to earliest available slot when chosen slot is full', () => {
    const slots = [slot(1, 1, 'A', 0), slot(2, 1, 'B', 60)];
    const placements = placeCompetitors(slots, [
      { userId: 1, timeSlotId: 1 },
      { userId: 2, timeSlotId: 1 }, // slot 1 full -> overflow to slot 2
    ]);
    expect(placements.map((p) => p.timeSlotId)).toEqual([1, 2]);
  });

  it('throws when there is not enough capacity', () => {
    const slots = [slot(1, 1, 'A', 0)];
    expect(() => placeCompetitors(slots, [{ userId: 1 }, { userId: 2 }])).toThrow();
  });
});

describe('assignJudgesToSlots', () => {
  it('balances judges across occupied rooms up to the cap', () => {
    const slots = [slot(1, 5, 'A', 0), slot(2, 5, 'B', 60)];
    const placements = [
      { competitorUserId: 1, timeSlotId: 1, room: 'A' },
      { competitorUserId: 2, timeSlotId: 2, room: 'B' },
    ];
    const judges = [10, 11, 12, 13, 14, 15].map((userId) => ({ userId }));
    // 6 judges, cap 3 per room -> 3 in A, 3 in B.
    const jp = assignJudgesToSlots(placements, slots, judges, 3);
    const inA = jp.filter((j) => j.timeSlotId === 1).length;
    const inB = jp.filter((j) => j.timeSlotId === 2).length;
    expect(inA).toBe(3);
    expect(inB).toBe(3);
  });

  it('does not assign judges to empty rooms', () => {
    const slots = [slot(1, 5, 'A', 0), slot(2, 5, 'B', 60)];
    const placements = [{ competitorUserId: 1, timeSlotId: 1, room: 'A' }]; // only A occupied
    const jp = assignJudgesToSlots(placements, slots, [10, 11].map((u) => ({ userId: u })), 3);
    expect(jp.every((j) => j.timeSlotId === 1)).toBe(true);
  });
});

describe('buildAssignmentRows', () => {
  it('creates one row per (competitor, judge) pair within a room', () => {
    const competitorPlacements = [
      { competitorUserId: 1, timeSlotId: 1, room: 'A' },
      { competitorUserId: 2, timeSlotId: 1, room: 'A' },
    ];
    const judgePlacements = [
      { judgeUserId: 10, timeSlotId: 1, room: 'A' },
      { judgeUserId: 11, timeSlotId: 1, room: 'A' },
    ];
    const rows = buildAssignmentRows(competitorPlacements, judgePlacements);
    expect(rows).toHaveLength(4); // 2 competitors × 2 judges
    expect(rows.every((r) => r.room === 'A')).toBe(true);
  });
});