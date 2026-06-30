import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiPatch } from '../api.js';
import { useAuth } from '../auth/AuthContext.js';

interface TimeSlot { id: number; startsAt: string; endsAt: string; capacity: number; room: string; }
interface Rubric { id: number; criteria: { name: string; maxScore: number; weight: number }[]; }
interface EventDetail {
  id: number; name: string; description: string; location: string;
  startsAt: string; endsAt: string; signupClosesAt: string; status: string;
  rubric: Rubric | null; timeSlots: TimeSlot[];
}

interface Signup {
  id: number; role: string;
  user: { id: number; name: string; email: string };
  timeSlot: TimeSlot | null;
}

export function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slotId, setSlotId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!id) return;
    Promise.all([
      apiGet<EventDetail>(`/events/${id}`),
      apiGet<Signup[]>(`/signups/event/${id}`),
    ])
      .then(([e, s]) => { setEvent(e); setSignups(s); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load event'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <p className="subtle">Loading…</p>;
  if (!event) return <p className="error">{error || 'Event not found'}</p>;

  const competitorSignups = signups.filter((s) => s.role === 'COMPETITOR');
  const judgeSignups = signups.filter((s) => s.role === 'JUDGE');

  const signup = async (role: 'JUDGE' | 'COMPETITOR') => {
    setError('');
    setBusy(true);
    try {
      await apiPost('/signups', { eventId: event.id, role, timeSlotId: role === 'COMPETITOR' ? Number(slotId) : undefined });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  const closeSignups = async () => {
    setBusy(true);
    try { await apiPatch(`/events/${event.id}/close`); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const runAssignment = async () => {
    setBusy(true);
    try { await apiPost(`/assignments/event/${event.id}/run`); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Assignment failed'); }
    finally { setBusy(false); }
  };

  const computeResults = async () => {
    setBusy(true);
    try { await apiPost(`/results/event/${event.id}/compute`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h2>{event.name}</h2>
      <div className="meta">
        {new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()} · {event.location || 'TBD'}
      </div>
      <p>{event.description}</p>
      <p className="meta">Signups close {new Date(event.signupClosesAt).toLocaleString()} · <span className="badge">{event.status}</span></p>
      {error && <p className="error">{error}</p>}

      {event.status === 'OPEN' && (
        <div className="card">
          <h3>Sign up</h3>
          <div className="col">
            <label>
              Sign up as a competitor — choose a time slot:
              <select value={slotId} onChange={(e) => setSlotId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select a slot…</option>
                {event.timeSlots.map((s) => {
                  const taken = competitorSignups.filter((c) => c.timeSlot?.id === s.id).length;
                  return (
                    <option key={s.id} value={s.id} disabled={taken >= s.capacity}>
                      {new Date(s.startsAt).toLocaleString()} · {s.room} ({taken}/{s.capacity})
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="muted-btn-row">
              <button disabled={busy || !slotId} onClick={() => signup('COMPETITOR')}>Sign up to compete</button>
              <button className="secondary" disabled={busy} onClick={() => signup('JUDGE')}>Sign up to judge</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Time slots</h3>
        <ul className="slots">
          {event.timeSlots.map((s) => {
            const taken = competitorSignups.filter((c) => c.timeSlot?.id === s.id).length;
            return (
              <li key={s.id}>
                {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleString()} · {s.room}
                {' '}<span className="badge">{taken}/{s.capacity} competitors</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <h3>Rubric</h3>
        {event.rubric ? (
          <table>
            <thead><tr><th>Criterion</th><th>Max</th><th>Weight</th></tr></thead>
            <tbody>
              {event.rubric.criteria.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td>{c.maxScore}</td><td>{c.weight}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="subtle">No rubric.</p>}
      </div>

      <div className="card">
        <h3>Signups</h3>
        <p><strong>Competitors ({competitorSignups.length})</strong></p>
        <ul>{competitorSignups.map((s) => <li key={s.id}>{s.user.name} — {s.timeSlot?.room ?? 'no slot'}</li>)}</ul>
        <p><strong>Judges ({judgeSignups.length})</strong></p>
        <ul>{judgeSignups.map((s) => <li key={s.id}>{s.user.name}</li>)}</ul>
      </div>

      {user?.role === 'ADMIN' && (
        <div className="card">
          <h3>Admin — automation</h3>
          <div className="muted-btn-row">
            <button disabled={busy || event.status !== 'OPEN'} onClick={closeSignups}>Close signups</button>
            <button disabled={busy || event.status === 'OPEN'} onClick={runAssignment}>Run auto-assignment</button>
            <button disabled={busy || event.status === 'OPEN'} onClick={computeResults}>Compute results</button>
            <Link to={`/results/${event.id}`}><button className="secondary">View results</button></Link>
          </div>
        </div>
      )}

      {user && (
        <p className="subtle">
          {user.role === 'JUDGE' && <Link to="/judge">Go to scoring →</Link>}
          {user.role === 'ADMIN' && <Link to={`/results/${event.id}`}>View results →</Link>}
        </p>
      )}
    </div>
  );
}