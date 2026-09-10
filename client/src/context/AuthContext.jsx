import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, setSessionExpiredHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `booting` prevents a flash of the login page while we try to restore the
  // session. Without it, ProtectedRoute would redirect before the refresh
  // call has had a chance to succeed.
  const [booting, setBooting] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
  }, [clearSession]);

  /*
   * On mount, try to exchange the httpOnly refresh cookie for a new access
   * token. This is how a page refresh keeps you logged in even though the
   * access token only ever lived in memory. A 401 here simply means "not
   * logged in", which is not an error worth surfacing.
   */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        setUser(data.user);
      } catch {
        clearSession();
      } finally {
        setBooting(false);
      }
    })();
  }, [clearSession]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
