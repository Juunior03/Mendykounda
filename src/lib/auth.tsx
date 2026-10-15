/**
 * Auth context — wraps Supabase auth. Provides current user + role flag.
 * Always sets up onAuthStateChange BEFORE getSession to avoid race conditions.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** L'utilisateur a-t-il le rôle admin ? */
async function hasAdminRole(uid: string | undefined) {
  if (!uid) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const fetchRole = useCallback(async (uid: string | undefined) => {
    setIsAdmin(await hasAdminRole(uid));
  }, []);

  useEffect(() => {
    // Tout le code auth tourne uniquement côté client.
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setTimeout(() => {
        void fetchRole(sess?.user?.id).catch(() => {});
      }, 0);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: sess } }) => {
        setSession(sess);
        setUser(sess?.user ?? null);
        return fetchRole(sess?.user?.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setIsAdmin(false);
  }, [queryClient]);

  const refreshRole = useCallback(() => fetchRole(user?.id), [fetchRole, user]);

  const value = useMemo(
    () => ({ user, session, loading, isAdmin, signOut, refreshRole }),
    [user, session, loading, isAdmin, signOut, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
