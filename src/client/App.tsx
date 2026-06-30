import { Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { Login } from './pages/Login.js';
import { Register } from './pages/Register.js';
import { Events } from './pages/Events.js';
import { EventDetail } from './pages/EventDetail.js';
import { AdminEventCreate } from './pages/AdminEventCreate.js';
import { JudgeScores } from './pages/JudgeScores.js';
import { Results } from './pages/Results.js';

function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <>
      <div className="utility-bar">
        <div className="container">
          <Link to="/events">Events</Link>
          {user.role === 'ADMIN' && <Link to="/admin/new">Create event</Link>}
          <Link to="/judge">Scoring</Link>
        </div>
      </div>
      <nav className="navbar">
        <Link to="/" className="brand">TSA<span className="dot">·</span>Signups</Link>
        <div className="nav-links">
          <NavLink to="/events" className={({ isActive }) => isActive ? 'active' : ''}>Competitions</NavLink>
          <NavLink to="/mine" className={({ isActive }) => isActive ? 'active' : ''}>My signups</NavLink>
          <NavLink to="/judge" className={({ isActive }) => isActive ? 'active' : ''}>Judge</NavLink>
          {user.role === 'ADMIN' && (
            <NavLink to="/admin/new" className={({ isActive }) => isActive ? 'active' : ''}>New event</NavLink>
          )}
          <span className="spacer" />
          <span className="who">{user.name} · {user.role}</span>
          <button onClick={() => void logout()}>Log out</button>
        </div>
      </nav>
    </>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div>
          <div className="brand">TSA<span className="dot">·</span>Signups</div>
          <p className="muted">Event signups for student competitions — judge or be judged.</p>
        </div>
        <div className="muted">
          <p>Built for a non-profit student organization.</p>
          <p className="muted">© {new Date().getFullYear()} TSA Signups</p>
        </div>
      </div>
    </footer>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/events" replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/events" replace /> : <Register />} />
          <Route path="/" element={<RequireAuth><Events /></RequireAuth>} />
          <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
          <Route path="/events/:id" element={<RequireAuth><EventDetail /></RequireAuth>} />
          <Route path="/mine" element={<RequireAuth><MySignups /></RequireAuth>} />
          <Route path="/judge" element={<RequireAuth><JudgeScores /></RequireAuth>} />
          <Route path="/results/:id" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/admin/new" element={<RequireAuth><AdminEventCreate /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {user && <Footer />}
    </>
  );
}

function MySignups() {
  // Simple placeholder list; full "my signups" view lives on the Events page per-user.
  return (
    <div>
      <h2>My signups</h2>
      <p className="subtle">See your signups and assignments on each event's page, or use the Judge tab to enter scores.</p>
    </div>
  );
}