import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FightView, Me } from '@mbc/shared';
import { ApiError, get, post } from './api';
import { connectSocket, type GameSocket } from './socket';
import { sfx } from './sound';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'good';
}

interface Session {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (me: Me | null) => void;
  logout: () => Promise<void>;
  socket: GameSocket | null;
  incoming: FightView[];
  dismissIncoming: (fightId: string) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  /** Run an action, toasting any error message. Returns undefined on failure. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** The logged-in player (pages under the game layout only render when logged in). */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error('useMe without a session');
  return me;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [incoming, setIncoming] = useState<FightView[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await get<{ me: Me }>('/me');
      setMe(r.me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'error');
      return undefined;
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // One socket per logged-in player.
  const playerId = me?.id ?? null;
  useEffect(() => {
    if (!playerId) return;
    const s = connectSocket();
    s.on('challenge:incoming', f => {
      sfx.challenge();
      setIncoming(list => [...list.filter(x => x.id !== f.id), f]);
    });
    s.on('challenge:update', u => {
      setIncoming(list => list.filter(x => x.id !== u.fightId));
    });
    s.on('fight:state', f => {
      // When a fight starts, take both players to the fight screen.
      if ((f.state === 'ACCEPTED' || f.state === 'ROUND_PICKING') && pathRef.current !== `/fight/${f.id}`) {
        setIncoming(list => list.filter(x => x.id !== f.id));
        navigate(`/fight/${f.id}`);
      }
    });
    s.on('me:update', () => void refresh());
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [playerId, navigate, refresh]);

  const logout = useCallback(async () => {
    await post('/auth/logout');
    setMe(null);
    setIncoming([]);
    navigate('/');
  }, [navigate]);

  const value = useMemo<Session>(() => ({
    me, loading, refresh, setMe, logout, socket, incoming, toast, toasts, run,
    dismissIncoming: id => setIncoming(list => list.filter(x => x.id !== id)),
  }), [me, loading, refresh, logout, socket, incoming, toast, toasts, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
