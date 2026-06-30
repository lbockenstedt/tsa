import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api.js';
import { useAuth } from '../auth/AuthContext.js';

interface EventSummary {
  id: number;
  name: string;
  location: string;
  startsAt: string;
  status: string;
  _count: { signups: number };
}

export function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<EventSummary[]>('/events')
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load events'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="hero" style={{ marginBottom: '1.75rem', borderRadius: 'var(--radius)' }}>
        <h1>Competitions &amp; Programs</h1>
        <p>Sign up to compete or to judge. Once signups close, the system auto-assigns rooms, balances judges, and tallies results.</p>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2>Upcoming events</h2>
        {user?.role === 'ADMIN' && <Link to="/admin/new"><button>Create event</button></Link>}
      </div>
      {loading && <p className="subtle">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && events.length === 0 && <p className="subtle">No events yet.</p>}
      {events.map((ev) => (
        <Link key={ev.id} to={`/events/${ev.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <h3>{ev.name}</h3>
          <div className="meta">
            {new Date(ev.startsAt).toLocaleString()} · {ev.location || 'TBD'} · {ev._count.signups} signups
          </div>
          <div className="meta"><span className="badge">{ev.status}</span></div>
        </Link>
      ))}
    </div>
  );
}