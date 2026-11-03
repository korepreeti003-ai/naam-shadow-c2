'use client';

import { createContext, useContext } from 'react';
import type { User } from '@/lib/firebase-client';
import type { AppUser } from '@/types';

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  idToken: string | null;
}

// Auth bypassed — panel opens directly without login
const MOCK_USER = {
  uid: 'panel-admin',
  email: 'admin@panel.local',
  displayName: 'Admin',
  emailVerified: true,
  getIdToken: async () => '',
} as unknown as User;

const MOCK_APP_USER: AppUser = {
  uid: 'panel-admin',
  email: 'admin@panel.local',
  role: 'admin',
  createdAt: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextValue>({
  user: MOCK_USER,
  appUser: MOCK_APP_USER,
  loading: false,
  idToken: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: MOCK_USER, appUser: MOCK_APP_USER, loading: false, idToken: null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
