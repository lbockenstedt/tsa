import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost } from '../api.js';

export type Role = 'ADMIN' | 'JUDGE' | 'COMPETITOR' | 'CHECKIN';

export interface CurrentUser {
  sub: number;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: 'JUDGE' | 'COMPETITOR') => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<CurrentUser>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const u = await apiPost<CurrentUser>('/auth/login', { email, password });
    setUser(u);
  };

  const register = async (email: string, password: string, name: string, role: 'JUDGE' | 'COMPETITOR') => {
    const u = await apiPost<CurrentUser>('/auth/register', { email, password, name, role });
    setUser(u);
  };

  const logout = async () => {
    await apiPost('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}