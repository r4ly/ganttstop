'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

// Module-level singleton — stable reference across renders
const supabase = createClient();

interface AuthContextType {
  user: User | null;
  username: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchProfile = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    setUsername(profile?.username ?? null);
  };

  useEffect(() => {
    // Fetch session, then profile — both before marking loading:false
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const authedUser = session?.user ?? null;
      setUser(authedUser);

      if (authedUser) {
        await fetchProfile(authedUser.id);
      }

      setLoading(false);
    };

    init();

    // Listen for auth changes (sign-in/out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setUsername(null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) await fetchProfile(currentUser.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUsername(null);
    // Clear the "has username" proxy cache cookie
    document.cookie = 'gs_hun=; path=/; max-age=0; sameSite=strict';
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, username, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}