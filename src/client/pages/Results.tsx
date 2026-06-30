import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../api.js';

interface ResultRow {
  id: number;
  rank: number;
  totalScore: number;
  competitor: { id: number; name: string };
}

export function Results() {
  const { id } = useParams();
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiGet<ResultRow[]>(`/results/event/${id}`)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load results'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="subtle">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (results.length === 0) return <p className="subtle">No results published yet. An admin must compute results after scores are entered.</p>;

  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '');

  return (
    <div>
      <h2>Results</h2>
      <table>
        <thead><tr><th>Rank</th><th>Competitor</th><th>Total score</th></tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td>{medal(r.rank)} {r.rank}</td>
              <td>{r.competitor.name}</td>
              <td>{r.totalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}