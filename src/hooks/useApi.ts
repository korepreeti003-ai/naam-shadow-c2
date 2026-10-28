'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T = unknown>() {
  const { idToken } = useAuth();
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (
      url: string,
      options: RequestInit = {}
    ): Promise<T | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            ...options.headers,
          },
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? `Request failed: ${res.status}`);
        }
        setState({ data: json.data, loading: false, error: null });
        return json.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [idToken]
  );

  return { ...state, execute };
}

export async function apiFetch<T>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }
  return json.data as T;
}
