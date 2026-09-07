import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { Profile } from '../api/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data ? ({ ...data, role: data.role as Profile['role'] } as Profile) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [profileKey, setProfileKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      setReady(true);
    });

    supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) setProfile(null);
    });
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchProfile(session.user.id).then(setProfile);
    } else {
      setProfile(null);
    }
  }, [session?.user?.id, profileKey]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      ready,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      refreshProfile: async () => setProfileKey((k) => k + 1),
    }),
    [session, profile, loading, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}