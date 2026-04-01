import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '../lib/dateUtils';

interface InvitePreview {
  tokenId: string;
  tripId: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  role: 'editor' | 'viewer';
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();
  const [guestName, setGuestName] = useState('');

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<InvitePreview>(`/invites/${token}`),
    enabled: !!token,
    retry: false,
  });

  const redeemMutation = useMutation({
    mutationFn: (name?: string) =>
      api.post<{
        isGuest: boolean;
        tripId: string;
        guestToken?: string;
        user?: { id: string; name: string; email: string; avatar_url: string | null; is_guest: number };
      }>(
        `/invites/${token}/redeem`,
        name ? { guestName: name } : undefined,
      ),
    onSuccess: (data) => {
      if (data.guestToken && data.user) {
        sessionStorage.setItem('guest_token', data.guestToken);
        // Populate auth cache immediately so AuthGuard doesn't redirect to /
        const guestUser = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          avatar_url: data.user.avatar_url,
          is_guest: data.user.is_guest === 1,
        };
        setUser(guestUser);
        queryClient.setQueryData(['auth', 'me'], data.user);
      }
      navigate(`/trips/${data.tripId}/itinerary`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="max-w-sm text-center">
          <p className="text-4xl">🔗</p>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Invite link not found</h1>
          <p className="mt-2 text-sm text-gray-500">
            This invite link is invalid, expired, or has reached its use limit.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-indigo-600">
            You're invited
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{preview.tripName}</h1>
          <p className="mt-1 text-gray-500">{preview.destination}</p>
          <p className="mt-1 text-sm text-gray-400">
            {formatDate(preview.startDate, 'MMM d')} – {formatDate(preview.endDate, 'MMM d, yyyy')}
          </p>
          <p className="mt-1 text-sm text-gray-400 capitalize">
            {preview.role === 'editor' ? 'Editor access (can edit)' : 'Viewer access (read only)'}
          </p>

          <div className="mt-6 space-y-3">
            {user ? (
              // Already signed in — join directly
              <button
                onClick={() => redeemMutation.mutate(undefined)}
                disabled={redeemMutation.isPending}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {redeemMutation.isPending ? 'Joining…' : `Join as ${user.name}`}
              </button>
            ) : (
              <>
                <button
                  onClick={signInWithGoogle}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>

                {/* Guest join option (available for all roles) */}
                <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-600">
                    Or join as a guest{preview.role === 'viewer' ? ' (view only)' : ''}:
                  </p>
                  <input
                    placeholder="Your name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => redeemMutation.mutate(guestName || undefined)}
                    disabled={redeemMutation.isPending}
                    className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                  >
                    {redeemMutation.isPending ? 'Joining…' : 'Continue as guest'}
                  </button>
                </div>
              </>
            )}
          </div>

          {redeemMutation.error && (
            <p className="mt-3 text-sm text-red-600">
              {(redeemMutation.error as Error).message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
