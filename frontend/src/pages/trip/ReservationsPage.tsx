import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatDate } from '../../lib/dateUtils';
import type { Reservation, ReservationType } from '../../types/api';
import { useTripStore } from '../../store/tripStore';

const TYPES: ReservationType[] = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'other'];

const TYPE_ICONS: Record<ReservationType, string> = {
  flight: '✈️',
  hotel: '🏨',
  restaurant: '🍽️',
  activity: '🎯',
  transport: '🚗',
  other: '📋',
};

// ─── Reservation Form Modal ───────────────────────────────────────────────────

function ReservationFormModal({
  tripId,
  editRes,
  onClose,
}: {
  tripId: string;
  editRes: Reservation | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    type: editRes?.type ?? ('other' as ReservationType),
    name: editRes?.name ?? '',
    confirmation_number: editRes?.confirmation_number ?? '',
    check_in: editRes?.check_in ?? '',
    check_out: editRes?.check_out ?? '',
    booking_url: editRes?.booking_url ?? '',
    notes: editRes?.notes ?? '',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post<Reservation>(`/trips/${tripId}/reservations`, {
        ...data,
        confirmation_number: data.confirmation_number || undefined,
        check_in: data.check_in || undefined,
        check_out: data.check_out || undefined,
        booking_url: data.booking_url || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', tripId] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch<Reservation>(`/trips/${tripId}/reservations/${editRes!.id}`, {
        ...data,
        confirmation_number: data.confirmation_number || undefined,
        check_in: data.check_in || undefined,
        check_out: data.check_out || undefined,
        booking_url: data.booking_url || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', tripId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editRes) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          {editRes ? 'Edit Booking' : 'Add Booking'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ReservationType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Name *</label>
              <input
                required
                placeholder="e.g. Hotel Paradiso"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <input
            placeholder="Confirmation number"
            value={form.confirmation_number}
            onChange={(e) => setForm({ ...form, confirmation_number: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Check-in / From</label>
              <input
                type="datetime-local"
                value={form.check_in}
                onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Check-out / To</label>
              <input
                type="datetime-local"
                value={form.check_out}
                onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <input
            type="url"
            placeholder="Booking URL"
            value={form.booking_url}
            onChange={(e) => setForm({ ...form, booking_url: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {isPending ? 'Saving…' : editRes ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reservation Card ─────────────────────────────────────────────────────────

function ReservationCard({
  res,
  canEdit,
  onEdit,
  onDelete,
}: {
  res: Reservation;
  canEdit: boolean;
  onEdit: (r: Reservation) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl">{TYPE_ICONS[res.type]}</span>
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{res.name}</p>
            {res.confirmation_number && (
              <p className="text-xs text-gray-400">Conf: {res.confirmation_number}</p>
            )}
            {(res.check_in || res.check_out) && (
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                {res.check_in && <span>In: {formatDate(res.check_in, 'MMM d, h:mm a')}</span>}
                {res.check_out && <span>Out: {formatDate(res.check_out, 'MMM d, h:mm a')}</span>}
              </div>
            )}
            {res.notes && <p className="mt-1 text-xs text-gray-400 line-clamp-2">{res.notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-500">
            {res.type}
          </span>
          {res.booking_url && (
            <a href={res.booking_url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-gray-400 hover:text-indigo-600">🔗</a>
          )}
          {canEdit && (
            <>
              <button onClick={() => onEdit(res)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">✏️</button>
              <button onClick={() => onDelete(res.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">🗑️</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { userRole } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';
  const [showModal, setShowModal] = useState(false);
  const [editRes, setEditRes] = useState<Reservation | null>(null);
  const [filterType, setFilterType] = useState<ReservationType | 'all'>('all');

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', tripId],
    queryFn: () => api.get<Reservation[]>(`/trips/${tripId}/reservations`),
    enabled: !!tripId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${tripId}/reservations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', tripId] }),
  });

  const filtered = filterType === 'all'
    ? reservations
    : reservations.filter((r) => r.type === filterType);

  return (
    <div className="p-4 pb-20 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Bookings</h2>
        {canEdit && (
          <button
            onClick={() => { setEditRes(null); setShowModal(true); }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterType('all')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${filterType === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${filterType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
          <p className="text-2xl">{filterType === 'all' ? '🎫' : TYPE_ICONS[filterType]}</p>
          <p className="mt-2 text-sm">No bookings yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((res) => (
            <ReservationCard
              key={res.id}
              res={res}
              canEdit={canEdit}
              onEdit={(r) => { setEditRes(r); setShowModal(true); }}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {showModal && tripId && (
        <ReservationFormModal
          tripId={tripId}
          editRes={editRes}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
