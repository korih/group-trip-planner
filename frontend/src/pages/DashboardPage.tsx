import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { formatDate } from '../lib/dateUtils';
import type { Trip } from '../types/api';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.get<Trip[]>(`/trips?userId=${user?.id}`),
    enabled: !!user,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✈️</span>
            <span className="text-lg font-semibold text-gray-900">Trip Planner</span>
          </div>
          <div className="flex items-center gap-3">
            {user?.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="h-8 w-8 rounded-full"
              />
            )}
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={signOut}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Your Trips</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New Trip
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-200" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400">No trips yet. Create your first one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onClick={() => navigate(`/trips/${trip.id}/itinerary`)}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateTripModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(trip) => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            navigate(`/trips/${trip.id}/itinerary`);
          }}
        />
      )}
    </div>
  );
}

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    planning: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-500',
    cancelled: 'bg-red-100 text-red-600',
  };

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md hover:-translate-y-0.5"
    >
      {trip.cover_photo_url && (
        <img
          src={trip.cover_photo_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-10"
        />
      )}
      <div className="relative">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">
            {trip.name}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[trip.status]}`}>
            {trip.status}
          </span>
        </div>
        <p className="mb-3 text-sm text-gray-500">{trip.destination}</p>
        <p className="text-xs text-gray-400">
          {formatDate(trip.start_date, 'MMM d')} – {formatDate(trip.end_date, 'MMM d, yyyy')}
        </p>
      </div>
    </button>
  );
}

function CreateTripModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    destination: '',
    start_date: '',
    end_date: '',
    description: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post<Trip>('/trips', form),
    onSuccess: (trip) => {
      onCreated(trip);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create New Trip</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Trip name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Tokyo Adventure"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Destination *</label>
            <input
              type="text"
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Tokyo, Japan"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">End date *</label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              rows={2}
              placeholder="Optional trip description…"
            />
          </div>
        </div>

        {mutation.error && (
          <p className="mt-3 text-sm text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.destination || !form.start_date || !form.end_date || mutation.isPending}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  );
}
