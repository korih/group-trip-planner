import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { PackingList, PackingItem } from '../../types/api';
import { useTripStore } from '../../store/tripStore';

type PackingTemplate = 'beach' | 'hiking' | 'city' | 'winter';

const TEMPLATES: { id: PackingTemplate; label: string; emoji: string }[] = [
  { id: 'beach', label: 'Beach', emoji: '🏖️' },
  { id: 'hiking', label: 'Hiking', emoji: '🥾' },
  { id: 'city', label: 'City', emoji: '🏙️' },
  { id: 'winter', label: 'Winter', emoji: '❄️' },
];

// ─── Packing Item Row ─────────────────────────────────────────────────────────

function PackingItemRow({
  item,
  tripId,
  listId,
  canEdit,
}: {
  item: PackingItem;
  tripId: string;
  listId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (checked: boolean) =>
      api.patch(`/trips/${tripId}/packing/${listId}/items/${item.id}/check`, { is_checked: checked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing', tripId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/trips/${tripId}/packing/${listId}/items/${item.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing', tripId] }),
  });

  return (
    <div className={`flex items-center gap-3 py-2 ${item.is_checked ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={(e) => toggleMutation.mutate(e.target.checked)}
        disabled={toggleMutation.isPending}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {item.label}
      </span>
      {item.assigned_name && (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
          {item.assigned_name}
        </span>
      )}
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 capitalize">
        {item.category}
      </span>
      {canEdit && (
        <button
          onClick={() => deleteMutation.mutate()}
          className="text-gray-300 hover:text-red-400"
          aria-label="Remove item"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Packing List Card ────────────────────────────────────────────────────────

function PackingListCard({
  list,
  tripId,
  canEdit,
}: {
  list: PackingList;
  tripId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [newItem, setNewItem] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);

  const addItemMutation = useMutation({
    mutationFn: (label: string) =>
      api.post(`/trips/${tripId}/packing/${list.id}/items`, { label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing', tripId] });
      setNewItem('');
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: () => api.delete(`/trips/${tripId}/packing/${list.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['packing', tripId] }),
  });

  const checkedCount = list.items.filter((i) => i.is_checked).length;
  const totalCount = list.items.length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* List header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="font-medium text-gray-900">{list.name}</h3>
          <p className="text-xs text-gray-400">{checkedCount}/{totalCount} packed</p>
        </div>
        {canEdit && (
          <button
            onClick={() => deleteListMutation.mutate()}
            className="text-sm text-gray-400 hover:text-red-500"
            aria-label="Delete list"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-1 rounded-full bg-green-500 transition-all"
            style={{ width: `${(checkedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Items */}
      <div className="divide-y divide-gray-50 px-4">
        {list.items.map((item) => (
          <PackingItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            listId={list.id}
            canEdit={canEdit}
          />
        ))}

        {/* Add item row */}
        {canEdit && (
          <div className="py-2">
            {showAddItem ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newItem.trim()) addItemMutation.mutate(newItem.trim());
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add item…"
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newItem.trim() || addItemMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddItem(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowAddItem(true)}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                + Add item
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Suggestions Panel ─────────────────────────────────────────────────────

interface AiSuggestion {
  label: string;
  category: string;
}

function AiSuggestionsPanel({
  tripId,
  destination,
  lists,
}: {
  tripId: string;
  destination: string;
  lists: PackingList[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ai-pack-suggestions', tripId],
    queryFn: () =>
      api.post<{ items: AiSuggestion[] }>('/ai/pack-suggestions', {
        destination,
      }),
    enabled: false,
    staleTime: Infinity,
  });

  const suggestions = data?.items ?? [];

  const addMutation = useMutation({
    mutationFn: async (items: AiSuggestion[]) => {
      // Find or create a list named "AI Suggestions"
      let listId = lists.find((l) => l.name === 'AI Suggestions')?.id;
      if (!listId) {
        const newList = await api.post<PackingList>(`/trips/${tripId}/packing`, {
          name: 'AI Suggestions',
        });
        listId = newList.id;
      }
      await Promise.all(
        items.map((item) =>
          api.post(`/trips/${tripId}/packing/${listId}/items`, {
            label: item.label,
            category: item.category,
          }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing', tripId] });
      setSelected(new Set());
      setOpen(false);
    },
  });

  const handleOpen = () => {
    setOpen(true);
    if (suggestions.length === 0) refetch();
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
      >
        ✨ AI suggestions
      </button>
    );
  }

  const toggleAll = () => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((_, i) => i)));
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-indigo-800">✨ AI Packing Suggestions</p>
        <button onClick={() => setOpen(false)} className="text-xs text-indigo-400 hover:text-indigo-600">
          Close
        </button>
      </div>

      {isFetching ? (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Generating suggestions…
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-indigo-500">No suggestions yet.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
              {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-xs text-indigo-400">{selected.size} selected</span>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {suggestions.map((s, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  selected.has(i)
                    ? 'border-indigo-400 bg-white'
                    : 'border-transparent bg-white/60 hover:bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setSelected(next);
                  }}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600"
                />
                <span className="flex-1 text-gray-800">{s.label}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs capitalize text-gray-500">
                  {s.category}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addMutation.mutate(suggestions.filter((_, i) => selected.has(i)))}
              disabled={selected.size === 0 || addMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} items`}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-100"
            >
              Regenerate
            </button>
          </div>
          {addMutation.error && (
            <p className="mt-2 text-xs text-red-500">{(addMutation.error as Error).message}</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PackingPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { userRole, currentTrip } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['packing', tripId],
    queryFn: () => api.get<PackingList[]>(`/trips/${tripId}/packing`),
    enabled: !!tripId,
  });

  const createListMutation = useMutation({
    mutationFn: (payload: { name?: string; template?: PackingTemplate }) =>
      api.post<PackingList>(`/trips/${tripId}/packing`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packing', tripId] });
      setShowTemplates(false);
    },
  });

  return (
    <div className="p-4 pb-20 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Packing Lists</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowTemplates((s) => !s)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Templates
            </button>
            <button
              onClick={() => createListMutation.mutate({ name: 'New List' })}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + New List
            </button>
          </div>
        )}
      </div>

      {/* AI suggestions */}
      {canEdit && tripId && currentTrip && (
        <AiSuggestionsPanel
          tripId={tripId}
          destination={currentTrip.destination}
          lists={lists}
        />
      )}

      {/* Template picker */}
      {showTemplates && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4">
          <p className="col-span-full mb-2 text-sm font-medium text-gray-700">Start from a template:</p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => createListMutation.mutate({ template: t.id })}
              disabled={createListMutation.isPending}
              className="flex flex-col items-center rounded-lg border border-gray-200 p-3 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60"
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="mt-1 text-xs font-medium text-gray-700">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-200" />)}</div>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
          <p className="text-2xl">🎒</p>
          <p className="mt-2 text-sm">No packing lists yet</p>
          {canEdit && (
            <button
              onClick={() => createListMutation.mutate({ template: 'city' })}
              className="mt-3 text-sm text-indigo-500 hover:text-indigo-700"
            >
              Start with a City trip template
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <PackingListCard key={list.id} list={list} tripId={tripId!} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
