import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api.js';
import { useAuth } from '../auth/AuthContext.js';

interface AssignmentAsJudge {
  id: number;
  eventId: number;
  event: { id: number; name: string; status: string };
  room: string;
  timeSlot: { id: number; startsAt: string; room: string };
  competitor: { id: number; name: string };
  scores: { criteriaName: string; score: number }[];
}

interface AssignmentsResponse { asCompetitor: unknown[]; asJudge: AssignmentAsJudge[] }

interface RubricCriterion { name: string; maxScore: number; weight: number }

export function JudgeScores() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentAsJudge[]>([]);
  const [rubrics, setRubrics] = useState<Record<number, RubricCriterion[]>>({});
  const [drafts, setDrafts] = useState<Record<number, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    apiGet<AssignmentsResponse>('/assignments/me')
      .then(async (res) => {
        setAssignments(res.asJudge);
        // Load each event's rubric so the form knows criteria + max scores.
        const eventIds = Array.from(new Set(res.asJudge.map((a) => a.eventId)));
        const entries = await Promise.all(
          eventIds.map((eid) =>
            apiGet<{ rubric: { criteria: RubricCriterion[] } | null }>(`/events/${eid}`)
              .then((e) => [eid, e.rubric?.criteria ?? []] as const),
          ),
        );
        const map: Record<number, RubricCriterion[]> = {};
        for (const [eid, crit] of entries) map[eid] = crit;
        setRubrics(map);
        // Pre-fill drafts from any existing scores.
        const d: Record<number, Record<string, number>> = {};
        for (const a of res.asJudge) {
          d[a.id] = Object.fromEntries(a.scores.map((s) => [s.criteriaName, s.score]));
        }
        setDrafts(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load assignments'))
      .finally(() => setLoading(false));
  }, []);

  if (user?.role !== 'JUDGE' && user?.role !== 'ADMIN') {
    return <p className="subtle">Only judges can enter scores.</p>;
  }
  if (loading) return <p className="subtle">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (assignments.length === 0) return <p className="subtle">No judging assignments yet. Once an admin runs auto-assignment, your competitors will appear here.</p>;

  const submit = async (a: AssignmentAsJudge) => {
    setError('');
    const criteria = rubrics[a.eventId] ?? [];
    const scores = criteria
      .filter((c) => drafts[a.id]?.[c.name] !== undefined)
      .map((c) => ({ criteriaName: c.name, score: drafts[a.id][c.name] }));
    if (scores.length === 0) { setError('Enter at least one score.'); return; }
    try {
      await apiPost('/scores', { assignmentId: a.id, scores });
      setSaved(a.id);
      setTimeout(() => setSaved(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save scores');
    }
  };

  return (
    <div>
      <h2>Scoring</h2>
      {assignments.map((a) => {
        const criteria = rubrics[a.eventId] ?? [];
        return (
          <div className="card" key={a.id}>
            <h3>{a.competitor.name}</h3>
            <div className="meta">{a.event.name} · {a.timeSlot.room} · {new Date(a.timeSlot.startsAt).toLocaleString()}</div>
            <div className="col" style={{ marginTop: '0.5rem' }}>
              {criteria.map((c) => (
                <label key={c.name}>
                  {c.name} <span className="hint">(max {c.maxScore}, weight {c.weight})</span>
                  <input
                    type="number" min={0} max={c.maxScore} step="0.1"
                    value={drafts[a.id]?.[c.name] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [a.id]: { ...d[a.id], [c.name]: Number(e.target.value) } }))
                    }
                  />
                </label>
              ))}
              <div className="muted-btn-row">
                <button onClick={() => submit(a)}>Save scores</button>
                {saved === a.id && <span className="badge ok">Saved</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}