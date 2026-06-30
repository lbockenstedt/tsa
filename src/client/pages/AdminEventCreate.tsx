import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../api.js';
import { useAuth } from '../auth/AuthContext.js';

interface Criterion { name: string; maxScore: number; weight: number }
interface SlotInput { startsAt: string; endsAt: string; capacity: number; room: string }

const toIsoLocal = (dt: string) => new Date(dt).toISOString();

export function AdminEventCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [signupClosesAt, setSignupClosesAt] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { name: 'Content', maxScore: 10, weight: 0.5 },
    { name: 'Delivery', maxScore: 10, weight: 0.5 },
  ]);
  const [slots, setSlots] = useState<SlotInput[]>([
    { startsAt: '', endsAt: '', capacity: 3, room: 'Room A' },
  ]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role !== 'ADMIN') return <p className="error">Admins only.</p>;

  const setCriterion = (i: number, patch: Partial<Criterion>) =>
    setCriteria((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const setSlot = (i: number, patch: Partial<SlotInput>) =>
    setSlots((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!startsAt || !endsAt || !signupClosesAt) { setError('Please fill in all dates.'); return; }
    if (slots.some((s) => !s.startsAt || !s.endsAt || !s.room)) { setError('Please fill in all slot fields.'); return; }
    setBusy(true);
    try {
      const created = await apiPost<{ id: number }>('/events', {
        name, description, location,
        startsAt: toIsoLocal(startsAt),
        endsAt: toIsoLocal(endsAt),
        signupClosesAt: toIsoLocal(signupClosesAt),
        rubric: criteria,
        timeSlots: slots.map((s) => ({
          startsAt: toIsoLocal(s.startsAt),
          endsAt: toIsoLocal(s.endsAt),
          capacity: s.capacity,
          room: s.room,
        })),
      });
      navigate(`/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Create event</h2>
      <form className="col" onSubmit={submit}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        <div className="row">
          <label>Starts<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></label>
          <label>Ends<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /></label>
          <label>Signups close<input type="datetime-local" value={signupClosesAt} onChange={(e) => setSignupClosesAt(e.target.value)} required /></label>
        </div>

        <h3>Rubric</h3>
        {criteria.map((c, i) => (
          <div className="row" key={i}>
            <input value={c.name} placeholder="Criterion" onChange={(e) => setCriterion(i, { name: e.target.value })} />
            <input type="number" value={c.maxScore} onChange={(e) => setCriterion(i, { maxScore: Number(e.target.value) })} style={{ width: 90 }} />
            <input type="number" step="0.1" value={c.weight} onChange={(e) => setCriterion(i, { weight: Number(e.target.value) })} style={{ width: 90 }} />
            <button type="button" className="secondary" onClick={() => setCriteria((cs) => cs.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="secondary" style={{ width: 'fit-content' }}
          onClick={() => setCriteria((cs) => [...cs, { name: '', maxScore: 10, weight: 0.1 }])}>+ Add criterion</button>

        <h3>Time slots / rooms</h3>
        {slots.map((s, i) => (
          <div className="row" key={i}>
            <input type="datetime-local" value={s.startsAt} onChange={(e) => setSlot(i, { startsAt: e.target.value })} />
            <input type="datetime-local" value={s.endsAt} onChange={(e) => setSlot(i, { endsAt: e.target.value })} />
            <input value={s.room} placeholder="Room" onChange={(e) => setSlot(i, { room: e.target.value })} />
            <input type="number" value={s.capacity} style={{ width: 80 }} onChange={(e) => setSlot(i, { capacity: Number(e.target.value) })} />
            <button type="button" className="secondary" onClick={() => setSlots((ss) => ss.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="secondary" style={{ width: 'fit-content' }}
          onClick={() => setSlots((ss) => [...ss, { startsAt: '', endsAt: '', capacity: 3, room: 'Room A' }])}>+ Add slot</button>

        {error && <p className="error">{error}</p>}
        <button disabled={busy} style={{ width: 'fit-content' }}>{busy ? 'Creating…' : 'Create event'}</button>
      </form>
    </div>
  );
}