import { describe, it, expect } from 'vitest';
import { aggregateResults, type RubricCriterion, type ScoreInput } from '../../src/server/services/results.service.js';

const criteria: RubricCriterion[] = [
  { name: 'Content', maxScore: 10, weight: 0.5 },
  { name: 'Delivery', maxScore: 10, weight: 0.5 },
];

const score = (
  competitorUserId: number,
  judgeUserId: number,
  criteriaName: string,
  s: number,
): ScoreInput => ({ competitorUserId, judgeUserId, criteriaName, score: s });

describe('aggregateResults', () => {
  it('averages each criterion across judges and applies weights', () => {
    // Competitor 1: Content [8, 10] avg 9, Delivery [6, 8] avg 7 => 9*0.5 + 7*0.5 = 8
    // Competitor 2: Content [6, 6]  avg 6, Delivery [6, 6]  avg 6 => 6
    const scores: ScoreInput[] = [
      score(1, 100, 'Content', 8),
      score(1, 101, 'Content', 10),
      score(1, 100, 'Delivery', 6),
      score(1, 101, 'Delivery', 8),
      score(2, 100, 'Content', 6),
      score(2, 101, 'Content', 6),
      score(2, 100, 'Delivery', 6),
      score(2, 101, 'Delivery', 6),
    ];
    const results = aggregateResults(criteria, scores);
    expect(results).toHaveLength(2);
    const c1 = results.find((r) => r.competitorUserId === 1)!;
    const c2 = results.find((r) => r.competitorUserId === 2)!;
    expect(c1.totalScore).toBe(8);
    expect(c2.totalScore).toBe(6);
    expect(c1.rank).toBe(1);
    expect(c2.rank).toBe(2);
  });

  it('assigns tied competitors the same rank', () => {
    const scores: ScoreInput[] = [
      score(1, 100, 'Content', 8),
      score(1, 100, 'Delivery', 8),
      score(2, 100, 'Content', 8),
      score(2, 100, 'Delivery', 8),
      score(3, 100, 'Content', 4),
      score(3, 100, 'Delivery', 4),
    ];
    const results = aggregateResults(criteria, scores);
    // Both 1 & 2 total 8 (rank 1); 3 totals 4 (rank 3).
    expect(results.find((r) => r.competitorUserId === 1)!.rank).toBe(1);
    expect(results.find((r) => r.competitorUserId === 2)!.rank).toBe(1);
    expect(results.find((r) => r.competitorUserId === 3)!.rank).toBe(3);
  });

  it('ignores criteria that no judge scored (graceful partials)', () => {
    const scores: ScoreInput[] = [
      score(1, 100, 'Content', 10), // only Content scored => 10 * 0.5 = 5
    ];
    const results = aggregateResults(criteria, scores);
    expect(results[0].totalScore).toBe(5);
  });

  it('returns empty for no scores', () => {
    expect(aggregateResults(criteria, [])).toEqual([]);
  });
});