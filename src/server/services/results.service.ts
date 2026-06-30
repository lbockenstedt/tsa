import { prisma } from '../prisma.js';
import { HttpError } from '../middleware/error.js';

/**
 * Results aggregation automation.
 *
 * For each competitor: average each rubric criterion across all judges who
 * scored them, then compute a weighted sum using the rubric weights. Rank
 * competitors by total descending; ties share a rank.
 */

export interface RubricCriterion {
  name: string;
  maxScore: number;
  weight: number;
}

export interface ScoreInput {
  competitorUserId: number;
  judgeUserId: number;
  criteriaName: string;
  score: number;
}

export interface ResultOutput {
  competitorUserId: number;
  totalScore: number;
  rank: number;
}

/**
 * Aggregate scores into weighted totals and ranks. Pure + testable.
 */
export function aggregateResults(criteria: RubricCriterion[], scores: ScoreInput[]): ResultOutput[] {
  const weights = new Map(criteria.map((c) => [c.name, c.weight]));

  // Group scores by competitor, then by criterion, collecting all judge scores.
  const byCompetitor = new Map<number, Map<string, number[]>>();
  for (const s of scores) {
    const byCriterion = byCompetitor.get(s.competitorUserId) ?? new Map<string, number[]>();
    const arr = byCriterion.get(s.criteriaName) ?? [];
    arr.push(s.score);
    byCriterion.set(s.criteriaName, arr);
    byCompetitor.set(s.competitorUserId, byCriterion);
  }

  const totals: { competitorUserId: number; totalScore: number }[] = [];
  for (const [competitorUserId, byCriterion] of byCompetitor) {
    let total = 0;
    for (const criterion of criteria) {
      const judgeScores = byCriterion.get(criterion.name) ?? [];
      if (judgeScores.length === 0) continue;
      const avg = judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length;
      const weight = weights.get(criterion.name) ?? 0;
      total += avg * weight;
    }
    totals.push({ competitorUserId, totalScore: Math.round(total * 1000) / 1000 });
  }

  totals.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks with ties sharing a rank (standard competition ranking).
  const results: ResultOutput[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  totals.forEach((t, i) => {
    if (lastScore !== null && t.totalScore === lastScore) {
      results.push({ competitorUserId: t.competitorUserId, totalScore: t.totalScore, rank: lastRank });
    } else {
      lastRank = i + 1;
      lastScore = t.totalScore;
      results.push({ competitorUserId: t.competitorUserId, totalScore: t.totalScore, rank: lastRank });
    }
  });

  return results;
}

/**
 * Load rubric + scores for an event, aggregate, persist Result rows,
 * and mark the event FINALIZED. Returns the computed results.
 */
export async function runResults(eventId: number): Promise<ResultOutput[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { rubric: true },
  });
  if (!event) throw new HttpError(404, 'Event not found');
  if (!event.rubric) throw new HttpError(400, 'Event has no rubric');

  const criteria = event.rubric.criteria as unknown as RubricCriterion[];

  const assignments = await prisma.assignment.findMany({
    where: { eventId },
    include: { scores: true },
  });

  const scores: ScoreInput[] = [];
  for (const a of assignments) {
    for (const sc of a.scores) {
      scores.push({
        competitorUserId: a.competitorUserId,
        judgeUserId: sc.judgeUserId,
        criteriaName: sc.criteriaName,
        score: sc.score,
      });
    }
  }

  if (scores.length === 0) throw new HttpError(400, 'No scores have been entered yet');

  const results = aggregateResults(criteria, scores);

  await prisma.$transaction([
    prisma.result.deleteMany({ where: { eventId } }),
    prisma.result.createMany({
      data: results.map((r) => ({
        eventId,
        competitorUserId: r.competitorUserId,
        totalScore: r.totalScore,
        rank: r.rank,
      })),
    }),
    prisma.event.update({ where: { id: eventId }, data: { status: 'FINALIZED' } }),
  ]);

  return results;
}