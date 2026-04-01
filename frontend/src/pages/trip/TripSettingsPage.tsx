import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTripStore } from '../../store/tripStore';
import type { TripMember, InviteToken } from '../../types/api';

export default function TripSettingsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { currentTrip, userRole } = useTripStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [editName, setEditName] = useState(currentTrip?.name ?? '');
  const [editDest, setEditDest] = useState(currentTrip?.destination ?? '');
  const [editCurrency, setEditCurrency] = useState(currentTrip?.base_currency ?? 'USD');

  const { data: members = [] } = useQuery({
    queryKey: ['trip-members', tripId],
    queryFn: () => api.get<TripMember[]>(`/trips/${tripId}/members`),
    enabled: !!tripId,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', tripId],
    queryFn: () => api.get<InviteToken[]>(`/trips/${tripId}/invites`),
    enabled: !!tripId && userRole === 'owner',
  });

  const updateTripMutation = useMutation({
    mutationFn: () =>
      api.patch(`/trips/${tripId}`, {
        name: editName,
        destination: editDest,
        base_currency: editCurrency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });

  const deleteTripMutation = useMutation({
    mutationFn: () => api.delete(`/trips/${tripId}`),
    onSuccess: () => navigate('/dashboard'),
  });

  const createInviteMutation = useMutation({
    mutationFn: (role: 'editor' | 'viewer') =>
      api.post<{ token: string }>(`/trips/${tripId}/invites`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', tripId] }),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (tokenId: string) =>
      api.delete(`/trips/${tripId}/invites/${tokenId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', tripId] }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'editor' | 'viewer' }) =>
      api.patch(`/trips/${tripId}/members/${userId}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip-members', tripId] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/trips/${tripId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip-members', tripId] }),
  });

  const copyInviteLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (userRole !== 'owner') {
    return (
      <div className="p-6">
        <p className="text-gray-400">Only the trip owner can access settings.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6 pb-20">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Trip Settings</h2>

      {/* Trip details */}
      <section className="mb-8">
        <h3 className="mb-3 font-medium text-gray-700">Trip Details</h3>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Trip name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Destination</label>
            <input
              value={editDest}
              onChange={(e) => setEditDest(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Base currency</label>
            <input
              value={editCurrency}
              maxLength={3}
              onChange={(e) => setEditCurrency(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => updateTripMutation.mutate()}
            disabled={updateTripMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {updateTripMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </section>

      {/* Members */}
      <section className="mb-8">
        <h3 className="mb-3 font-medium text-gray-700">Members ({members.length})</h3>
        <div className="divide-y rounded-xl border border-gray-200 bg-white">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} className="h-8 w-8 rounded-full" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                  {member.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{member.name}</p>
                <p className="truncate text-xs text-gray-400">{member.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {member.role === 'owner' ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 font-medium">Owner</span>
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      changeRoleMutation.mutate({ userId: member.user_id, role: e.target.value as 'editor' | 'viewer' })
                    }
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:outline-none"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                )}
                {member.role !== 'owner' && (
                  <button
                    onClick={() => removeMemberMutation.mutate(member.user_id)}
                    className="text-gray-300 hover:text-red-500"
                    title="Remove member"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Invite Links */}
      <section className="mb-8">
        <h3 className="mb-3 font-medium text-gray-700">Invite Links</h3>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => createInviteMutation.mutate('editor')}
            disabled={createInviteMutation.isPending}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            + Editor link
          </button>
          <button
            onClick={() => createInviteMutation.mutate('viewer')}
            disabled={createInviteMutation.isPending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            + View-only link
          </button>
        </div>

        {invites.length > 0 ? (
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-gray-500 truncate">{invite.token.slice(0, 20)}…</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {invite.role} · {invite.use_count} use{invite.use_count !== 1 ? 's' : ''}
                    {invite.max_uses ? ` / ${invite.max_uses}` : ''}
                    {invite.expires_at ? ` · expires ${invite.expires_at.split('T')[0]}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => copyInviteLink(invite.token)}
                  className="text-sm text-indigo-500 hover:underline"
                >
                  {copiedToken === invite.token ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => revokeInviteMutation.mutate(invite.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No active invite links</p>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <h3 className="mb-3 font-medium text-red-600">Danger Zone</h3>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-700">
            Deleting this trip will permanently remove all data including the itinerary, expenses, and documents.
          </p>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${currentTrip?.name}"? This cannot be undone.`)) {
                deleteTripMutation.mutate();
              }
            }}
            disabled={deleteTripMutation.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleteTripMutation.isPending ? 'Deleting…' : 'Delete Trip'}
          </button>
        </div>
      </section>
    </div>
  );
}
