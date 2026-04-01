import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { api } from '../../api/client';
import type { ItineraryItem, ItineraryCategory } from '../../types/api';
import { useTripStore } from '../../store/tripStore';
import { getTripDays, formatDate } from '../../lib/dateUtils';

// ─── Sortable Item Card ───────────────────────────────────────────────────────

function SortableItemCard({
  item,
  onEdit,
  onDelete,
  canEdit,
}: {
  item: ItineraryItem;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-gray-300 hover:text-gray-500"
          aria-label="Drag to reorder"
        >
          ⣿
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{item.title}</p>
        {item.location && (
          <p className="truncate text-sm text-gray-500">📍 {item.location}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
          {item.start_time && <span>🕐 {item.start_time}</span>}
          {item.end_time && <span>–{item.end_time}</span>}
          {item.estimated_cost != null && (
            <span>💵 {item.currency} {item.estimated_cost}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-500">
          {item.category}
        </span>
        {canEdit && (
          <>
            <button
              onClick={() => onEdit(item)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Edit"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              aria-label="Delete"
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Day Note Editor ──────────────────────────────────────────────────────────

function DayNoteEditor({ tripId, date }: { tripId: string; date: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { data: noteData } = useQuery({
    queryKey: ['day-note', tripId, date],
    queryFn: () => api.get<{ content: string }>(`/day-notes/${tripId}/${date}`),
    enabled: isExpanded,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (content: string) =>
      api.put(`/day-notes/${tripId}/${date}`, { content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['day-note', tripId, date] }),
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Add notes for this day…' }),
    ],
    content: noteData?.content ?? '',
    editable: true,
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveMutation.mutate(json), 1000);
    },
  });

  // Sync fetched content into editor when it loads
  useEffect(() => {
    if (editor && noteData?.content && !editor.getText()) {
      try {
        const parsed = JSON.parse(noteData.content);
        editor.commands.setContent(parsed);
      } catch {
        editor.commands.setContent(noteData.content);
      }
    }
  }, [noteData, editor]);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="mt-2 text-xs text-gray-400 hover:text-indigo-600"
      >
        + Add day notes
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Day Notes</span>
        <button onClick={() => setIsExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">
          Hide
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm min-h-[80px] max-w-none text-sm focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400"
      />
    </div>
  );
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────

const CATEGORIES: ItineraryCategory[] = ['activity', 'accommodation', 'transport', 'food', 'other'];

function ItemFormModal({
  tripId,
  initialDate,
  editItem,
  onClose,
}: {
  tripId: string;
  initialDate: string;
  editItem: ItineraryItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: editItem?.title ?? '',
    location: editItem?.location ?? '',
    item_date: editItem?.item_date ?? initialDate,
    start_time: editItem?.start_time ?? '',
    end_time: editItem?.end_time ?? '',
    category: editItem?.category ?? ('activity' as ItineraryCategory),
    estimated_cost: editItem?.estimated_cost != null ? String(editItem.estimated_cost) : '',
    currency: editItem?.currency ?? 'USD',
    description: editItem?.description ?? '',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post<ItineraryItem>('/itineraries', {
        trip_id: tripId,
        ...data,
        estimated_cost: data.estimated_cost ? Number(data.estimated_cost) : undefined,
        start_time: data.start_time || undefined,
        end_time: data.end_time || undefined,
        location: data.location || undefined,
        description: data.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch<ItineraryItem>(`/itineraries/${editItem!.id}`, {
        ...data,
        estimated_cost: data.estimated_cost ? Number(data.estimated_cost) : undefined,
        start_time: data.start_time || undefined,
        end_time: data.end_time || undefined,
        location: data.location || undefined,
        description: data.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editItem) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          {editItem ? 'Edit Activity' : 'Add Activity'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <input
            placeholder="Location (auto-geocoded)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Date</label>
              <input
                type="date"
                required
                value={form.item_date}
                onChange={(e) => setForm({ ...form, item_date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ItineraryCategory })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              placeholder="Start time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="time"
              placeholder="End time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Estimated cost"
                value={form.estimated_cost}
                onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <input
              placeholder="USD"
              maxLength={3}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isPending ? 'Saving…' : editItem ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { currentTrip, userRole } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const [addForDate, setAddForDate] = useState('');
  const [localItems, setLocalItems] = useState<ItineraryItem[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['itinerary_item', tripId],
    queryFn: () => api.get<ItineraryItem[]>(`/itineraries?tripId=${tripId}`),
    enabled: !!tripId,
    refetchOnWindowFocus: false,
  });

  // Clear optimistic state when server data arrives
  useEffect(() => {
    setLocalItems(null);
  }, [items]);

  const displayItems: ItineraryItem[] = localItems ?? items;

  const reorderMutation = useMutation({
    mutationFn: (reorderData: { tripId: string; items: Array<{ id: string; order_index: number; item_date?: string }> }) =>
      api.post('/itineraries/reorder', reorderData),
    onError: () => {
      setLocalItems(null);
      queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/itineraries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] }),
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const activeItem = displayItems.find((i) => i.id === active.id);
      const overItem = displayItems.find((i) => i.id === over.id);
      if (!activeItem || !overItem) return;

      const sameDay = activeItem.item_date === overItem.item_date;

      if (sameDay) {
        const dayItems = displayItems
          .filter((i) => i.item_date === activeItem.item_date)
          .sort((a, b) => a.order_index - b.order_index);
        const oldIdx = dayItems.findIndex((i) => i.id === active.id);
        const newIdx = dayItems.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(dayItems, oldIdx, newIdx);

        const updates = reordered.map((item, idx) => ({ ...item, order_index: idx }));
        const newAll = displayItems.map((i) => updates.find((u) => u.id === i.id) ?? i);
        setLocalItems(newAll);

        reorderMutation.mutate({
          tripId: tripId!,
          items: updates.map((i) => ({ id: i.id, order_index: i.order_index })),
        });
      } else {
        // Cross-day move: assign item to over item's day, append at end
        const targetDayItems = displayItems
          .filter((i) => i.item_date === overItem.item_date && i.id !== activeItem.id)
          .sort((a, b) => a.order_index - b.order_index);
        const newOrderIndex = targetDayItems.length;

        const newAll = displayItems.map((i) =>
          i.id === activeItem.id ? { ...i, item_date: overItem.item_date, order_index: newOrderIndex } : i,
        );
        setLocalItems(newAll);

        reorderMutation.mutate({
          tripId: tripId!,
          items: [{ id: activeItem.id, order_index: newOrderIndex, item_date: overItem.item_date }],
        });
      }
    },
    [displayItems, tripId, reorderMutation],
  );

  const openAddModal = (date: string) => {
    setEditItem(null);
    setAddForDate(date);
    setShowModal(true);
  };

  const openEditModal = (item: ItineraryItem) => {
    setEditItem(item);
    setAddForDate(item.item_date);
    setShowModal(true);
  };

  if (!currentTrip) return null;

  const days = getTripDays(currentTrip.start_date, currentTrip.end_date);
  const activeItem = activeId ? displayItems.find((i) => i.id === activeId) : null;

  return (
    <div className="p-4 pb-20 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Itinerary</h2>
        {canEdit && (
          <button
            onClick={() => openAddModal(days[0] ?? '')}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add Activity
          </button>
        )}
      </div>

      {/* Day columns */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-6">
            {days.map((day, dayIdx) => {
              const dayItems = displayItems
                .filter((item) => item.item_date === day)
                .sort((a, b) => a.order_index - b.order_index);

              return (
                <div key={day}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Day {dayIdx + 1} · {formatDate(day, 'EEE, MMM d')}
                    </h3>
                    {canEdit && (
                      <button
                        onClick={() => openAddModal(day)}
                        className="text-xs text-indigo-500 hover:text-indigo-700"
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  <SortableContext
                    items={dayItems.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {dayItems.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">
                        No activities yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayItems.map((item) => (
                          <SortableItemCard
                            key={item.id}
                            item={item}
                            onEdit={openEditModal}
                            onDelete={(id) => deleteMutation.mutate(id)}
                            canEdit={canEdit}
                          />
                        ))}
                      </div>
                    )}
                  </SortableContext>

                  <DayNoteEditor tripId={tripId!} date={day} />
                </div>
              );
            })}
          </div>

          <DragOverlay>
            {activeItem && (
              <div className="rounded-xl border border-indigo-300 bg-white p-4 shadow-xl opacity-90">
                <p className="font-medium text-gray-900">{activeItem.title}</p>
                {activeItem.location && (
                  <p className="text-sm text-gray-500">📍 {activeItem.location}</p>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Item Form Modal */}
      {showModal && tripId && (
        <ItemFormModal
          tripId={tripId}
          initialDate={addForDate}
          editItem={editItem}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
