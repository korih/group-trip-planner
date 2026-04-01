import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';

interface MeResponse {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_guest: number;
}

export function useAuth() {
  const { user, isLoading, setUser, setLoading, logout } = useAuthStore();

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!queryLoading) {
      if (data) {
        setUser({
          id: data.id,
          name: data.name,
          email: data.email,
          avatar_url: data.avatar_url,
          is_guest: data.is_guest === 1,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    }
  }, [data, queryLoading, setUser, setLoading]);

  const signInWithGoogle = () => {
    const base = import.meta.env.VITE_API_URL ?? '';
    window.location.href = `${base}/auth/google`;
  };

  const signOut = async () => {
    await api.post('/auth/logout');
    logout();
    window.location.href = '/';
  };

  return {
    user,
    isLoading: isLoading || queryLoading,
    isGuest: user?.is_guest ?? false,
    signInWithGoogle,
    signOut,
  };
}
