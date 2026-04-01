import { useState } from 'react';
import { Routes, Route, NavLink, useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTrip } from '../hooks/useTrip';
import { useTripWebSocket } from '../hooks/useTripWebSocket';
import { useRealtimeStore } from '../store/realtimeStore';
import { useTripStore } from '../store/tripStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import type { ActivityEntry } from '../types/api';
import { formatDate } from '../lib/dateUtils';

import ItineraryPage from './trip/ItineraryPage';
import MapPage from './trip/MapPage';
import ExpensesPage from './trip/ExpensesPage';
import ReservationsPage from './trip/ReservationsPage';
import PackingPage from './trip/PackingPage';
import DocumentsPage from './trip/DocumentsPage';
import TripSettingsPage from './trip/TripSettingsPage';

const NAV_ITEMS = [
  { path: 'itinerary', label: 'Itinerary', icon: '📅' },
  { path: 'map', label: 'Map', icon: '🗺️' },
  { path: 'expenses', label: 'Expenses', icon: '💰' },
  { path: 'reservations', label: 'Bookings', icon: '🎫' },
  { path: 'packing', label: 'Packing', icon: '🎒' },
  { path: 'documents', label: 'Documents', icon: '📎' },
];

// ─── Activity Feed Drawer ─────────────────────────────────────────────────────

function ActivityFeedDrawer({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { data: activities = [] } = useQuery({
    queryKey: ['activity', tripId],
    queryFn: () => api.get<ActivityEntry[]>(`/trips/${tripId}/activity?limit=40`),
    enabled: !!tripId,
    refetchInterval: 30_000,
  });

  const ACTION_LABELS: Record<string, string> = {
    created_item: 'added activity',
    updated_item: 'updated activity',
    deleted_item: 'deleted activity',
    created_reservation: 'added booking',
    updated_reservation: 'updated booking',
    deleted_reservation: 'deleted booking',
    created_packing_list: 'created packing list',
    created_note: 'added day notes',
    updated_note: 'updated day notes',
    joined_trip: 'joined the trip',
    changed_member_role: 'changed member role',
    updated_expense: 'updated expense',
    created_expense: 'added expense',
    deleted_expense: 'deleted expense',
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex w-80 flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-gray-900">Activity</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {activities.length === 0 ? (
            <p className="text-center text-sm text-gray-400">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activities.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {entry.actor_display[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{entry.actor_display}</span>
                      {' '}{ACTION_LABELS[entry.action] ?? entry.action}
                      {entry.entity_label && (
                        <span className="font-medium"> "{entry.entity_label}"</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(entry.created_at, 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Guest Banner ─────────────────────────────────────────────────────────────

function GuestBanner() {
  const { user } = useAuthStore();

  if (!user?.is_guest) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm">
      <span className="text-amber-800">
        You're viewing as a guest.{' '}
        <button
          onClick={() => window.location.href = '/auth/google'}
          className="font-semibold text-amber-900 underline hover:text-amber-700"
        >
          Create an account
        </button>
        {' '}to edit and create your own trips.
      </span>
    </div>
  );
}

// ─── Main Trip Page ───────────────────────────────────────────────────────────

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { trip, isLoading } = useTrip(tripId);
  const { userRole } = useTripStore();
  const [showActivity, setShowActivity] = useState(false);

  useTripWebSocket(tripId ?? null);

  const { connectedUsers, isConnected } = useRealtimeStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!trip) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Guest Banner */}
      <GuestBanner />

      {/* Trip Header */}
      <header className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <NavLink to="/dashboard" className="shrink-0 text-gray-400 hover:text-gray-600">
              ← Back
            </NavLink>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-gray-900">{trip.name}</h1>
              <p className="truncate text-xs text-gray-400">{trip.destination}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live presence */}
            {isConnected && connectedUsers.length > 0 && (
              <div className="flex -space-x-2">
                {connectedUsers.slice(0, 4).map((u) => (
                  <div
                    key={u.userId}
                    title={u.displayName}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-indigo-200 text-xs font-medium text-indigo-700"
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.displayName} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      u.displayName[0].toUpperCase()
                    )}
                  </div>
                ))}
                {connectedUsers.length > 4 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs text-gray-500">
                    +{connectedUsers.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Activity feed button */}
            <button
              onClick={() => setShowActivity(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Activity feed"
            >
              📋
            </button>

            {/* Settings (owner only) */}
            {userRole === 'owner' && (
              <NavLink
                to={`/trips/${tripId}/settings`}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ⚙️
              </NavLink>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="mt-3 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`/trips/${tripId}/${item.path}`}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Page Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="itinerary" replace />} />
          <Route path="itinerary" element={<ItineraryPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="packing" element={<PackingPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="settings" element={<TripSettingsPage />} />
        </Routes>
      </main>

      {/* Activity Feed Drawer */}
      {showActivity && tripId && (
        <ActivityFeedDrawer tripId={tripId} onClose={() => setShowActivity(false)} />
      )}
    </div>
  );
}
