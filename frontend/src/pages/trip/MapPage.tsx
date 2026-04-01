import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../lib/leafletConfig';
import { api } from '../../api/client';
import type { ItineraryItem, WeatherDay } from '../../types/api';
import { useTripStore } from '../../store/tripStore';
import { getTripDays, formatDate } from '../../lib/dateUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

const WEATHER_CODES: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: 'Clear sky' },
  1: { emoji: '🌤️', label: 'Mainly clear' },
  2: { emoji: '⛅', label: 'Partly cloudy' },
  3: { emoji: '☁️', label: 'Overcast' },
  45: { emoji: '🌫️', label: 'Foggy' },
  48: { emoji: '🌫️', label: 'Icy fog' },
  51: { emoji: '🌦️', label: 'Light drizzle' },
  61: { emoji: '🌧️', label: 'Slight rain' },
  63: { emoji: '🌧️', label: 'Moderate rain' },
  65: { emoji: '🌧️', label: 'Heavy rain' },
  71: { emoji: '🌨️', label: 'Slight snow' },
  73: { emoji: '❄️', label: 'Moderate snow' },
  75: { emoji: '❄️', label: 'Heavy snow' },
  80: { emoji: '🌦️', label: 'Rain showers' },
  95: { emoji: '⛈️', label: 'Thunderstorm' },
};

const CATEGORY_OPTIONS = ['activity', 'accommodation', 'transport', 'food', 'other'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingPin {
  lat: number;
  lng: number;
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

function BoundsAdjuster({ items }: { items: ItineraryItem[] }) {
  const map = useMap();
  const fitted = useRef(false);
  const pinned = items.filter((i) => i.lat && i.lng);

  if (!fitted.current && pinned.length > 0) {
    fitted.current = true;
    map.fitBounds(
      pinned.map((i) => [i.lat!, i.lng!] as [number, number]),
      { padding: [40, 40] },
    );
  }
  return null;
}

function PinDropper({
  active,
  onPin,
}: {
  active: boolean;
  onPin: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    click(e: LeafletMouseEvent) {
      if (!active) return;
      onPin(e.latlng.lat, e.latlng.lng);
    },
    mousemove() {
      map.getContainer().style.cursor = active ? 'crosshair' : '';
    },
  });

  return null;
}

function MapPanner({ target }: { target: [number, number] | null }) {
  const map = useMap();
  if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.8 });
  return null;
}

// ─── Weather ──────────────────────────────────────────────────────────────────

function WeatherWidget({ tripId }: { tripId: string }) {
  const { currentTrip } = useTripStore();
  const { data: weather = [] } = useQuery({
    queryKey: ['weather', tripId],
    queryFn: () => api.get<WeatherDay[]>(`/trips/${tripId}/weather`),
    enabled: !!(currentTrip?.destination_lat && currentTrip?.destination_lng),
    staleTime: 3 * 60 * 60 * 1000,
  });

  if (!weather.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Weather Forecast</h3>
      <div className="flex gap-3">
        {weather.map((day) => {
          const { emoji } = WEATHER_CODES[day.weathercode] ?? { emoji: '🌡️' };
          return (
            <div key={day.date} className="flex min-w-[72px] flex-col items-center rounded-lg bg-gray-50 px-3 py-2 text-center">
              <span className="text-xs text-gray-400">{formatDate(day.date, 'EEE d')}</span>
              <span className="my-1 text-2xl">{emoji}</span>
              <span className="text-sm font-semibold text-gray-800">{Math.round(day.temp_max)}°</span>
              <span className="text-xs text-gray-400">{Math.round(day.temp_min)}°</span>
              {day.precipitation > 0 && (
                <span className="mt-1 text-xs text-blue-500">{day.precipitation}mm</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pin Panel ────────────────────────────────────────────────────────────────
// Shown after dropping a pin — lets user link an existing item or create new

interface PinPanelProps {
  pin: PendingPin;
  unmappedItems: ItineraryItem[];
  tripDays: string[];
  onLink: (itemId: string) => void;
  onCreate: (form: NewItemForm) => void;
  onCancel: () => void;
  isLoading: boolean;
}

interface NewItemForm {
  title: string;
  item_date: string;
  category: typeof CATEGORY_OPTIONS[number];
}

function PinPanel({ pin, unmappedItems, tripDays, onLink, onCreate, onCancel, isLoading }: PinPanelProps) {
  const [mode, setMode] = useState<'choose' | 'link' | 'new'>('choose');
  const [newForm, setNewForm] = useState<NewItemForm>({
    title: '',
    item_date: tripDays[0] ?? '',
    category: 'activity',
  });

  return (
    <div className="absolute bottom-4 left-1/2 z-[1000] w-[340px] -translate-x-1/2 rounded-2xl bg-white shadow-xl ring-1 ring-gray-200">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Pin dropped</p>
          <p className="text-xs text-gray-400">
            {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="p-4">
        {mode === 'choose' && (
          <div className="space-y-2">
            <button
              onClick={() => setMode('link')}
              disabled={unmappedItems.length === 0}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="block">📍 Link to existing activity</span>
              <span className="text-xs font-normal text-gray-400">
                {unmappedItems.length > 0
                  ? `${unmappedItems.length} unpinned activities`
                  : 'All activities already have pins'}
              </span>
            </button>
            <button
              onClick={() => setMode('new')}
              className="w-full rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-left text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              <span className="block">➕ Create new activity here</span>
              <span className="text-xs font-normal text-indigo-400">Add to itinerary at this location</span>
            </button>
          </div>
        )}

        {mode === 'link' && (
          <div>
            <button onClick={() => setMode('choose')} className="mb-3 text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
            <p className="mb-2 text-xs font-medium text-gray-500">Select activity to pin here:</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {unmappedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onLink(item.id)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span className="block font-medium text-gray-800">{item.title}</span>
                  <span className="text-xs text-gray-400">
                    {formatDate(item.item_date, 'EEE, MMM d')}
                    {item.location ? ` · ${item.location}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'new' && (
          <div>
            <button onClick={() => setMode('choose')} className="mb-3 text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Title *</label>
                <input
                  autoFocus
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Activity name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Date *</label>
                  <select
                    value={newForm.item_date}
                    onChange={(e) => setNewForm({ ...newForm, item_date: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {tripDays.map((d) => (
                      <option key={d} value={d}>{formatDate(d, 'EEE, MMM d')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                  <select
                    value={newForm.category}
                    onChange={(e) => setNewForm({ ...newForm, category: e.target.value as NewItemForm['category'] })}
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm capitalize focus:border-indigo-500 focus:outline-none"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => newForm.title.trim() && onCreate(newForm)}
                disabled={!newForm.title.trim() || isLoading}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? 'Adding…' : 'Add to itinerary'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Sidebar ─────────────────────────────────────────────────────────

function ActivitySidebar({
  items,
  days,
  dayColors,
  onPanTo,
  onStartPin,
  canEdit,
}: {
  items: ItineraryItem[];
  days: string[];
  dayColors: Record<string, string>;
  onPanTo: (lat: number, lng: number) => void;
  onStartPin: (item: ItineraryItem) => void;
  canEdit: boolean;
}) {
  const unmapped = items.filter((i) => !i.lat || !i.lng);
  const mapped = items.filter((i) => i.lat && i.lng);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );

  const ItemRow = ({ item }: { item: ItineraryItem }) => {
    const isPinned = !!(item.lat && item.lng);
    const dayIdx = days.indexOf(item.item_date);
    const color = dayColors[item.item_date];

    return (
      <div className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
        {/* Day color dot */}
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? '#d1d5db' }}
          title={`Day ${dayIdx + 1}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
          <p className="truncate text-xs text-gray-400">
            {formatDate(item.item_date, 'EEE, MMM d')}
            {item.location ? ` · ${item.location}` : ''}
          </p>
        </div>
        {isPinned ? (
          <button
            onClick={() => onPanTo(item.lat!, item.lng!)}
            className="shrink-0 rounded p-1 text-indigo-400 opacity-0 hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
            title="Fly to on map"
          >
            🎯
          </button>
        ) : canEdit ? (
          <button
            onClick={() => onStartPin(item)}
            className="shrink-0 rounded p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
            title="Drop a pin for this activity"
          >
            📍
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border-l bg-white">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">Activities</p>
        <p className="text-xs text-gray-400">
          {mapped.length}/{items.length} pinned
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {unmapped.length > 0 && (
          <Section title="No pin yet">
            {unmapped.map((item) => <ItemRow key={item.id} item={item} />)}
          </Section>
        )}
        {mapped.length > 0 && (
          <Section title="Pinned">
            {mapped.map((item) => <ItemRow key={item.id} item={item} />)}
          </Section>
        )}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">No activities yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { currentTrip, userRole } = useTripStore();
  const queryClient = useQueryClient();
  const canEdit = userRole === 'owner' || userRole === 'editor';

  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [panTarget, setPanTarget] = useState<[number, number] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // When user clicks 📍 on a sidebar item, pre-select that item
  const [pinningSidebarItem, setPinningSidebarItem] = useState<ItineraryItem | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ['itinerary_item', tripId],
    queryFn: () => api.get<ItineraryItem[]>(`/itineraries?tripId=${tripId}`),
    enabled: !!tripId,
  });

  const itemsWithCoords = items.filter((i) => i.lat && i.lng);
  const unmappedItems = items.filter((i) => !i.lat || !i.lng);

  const center: [number, number] =
    currentTrip?.destination_lat && currentTrip?.destination_lng
      ? [currentTrip.destination_lat, currentTrip.destination_lng]
      : [20, 0];

  const days = currentTrip ? getTripDays(currentTrip.start_date, currentTrip.end_date) : [];
  const dayColorMap: Record<string, string> = {};
  days.forEach((d, i) => { dayColorMap[d] = DAY_COLORS[i % DAY_COLORS.length]; });

  const dayPolylines = days.map((day) => {
    const dayItems = itemsWithCoords
      .filter((i) => i.item_date === day)
      .sort((a, b) => a.order_index - b.order_index);
    return { day, color: dayColorMap[day], coords: dayItems.map((i) => [i.lat!, i.lng!] as [number, number]) };
  });

  // PATCH existing item with new lat/lng
  const linkMutation = useMutation({
    mutationFn: ({ itemId, lat, lng }: { itemId: string; lat: number; lng: number }) =>
      api.patch(`/itineraries/${itemId}`, { lat, lng }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] });
      closePinFlow();
    },
  });

  // POST new item with lat/lng
  const createMutation = useMutation({
    mutationFn: (body: object) => api.post(`/itineraries`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itinerary_item', tripId] });
      closePinFlow();
    },
  });

  const isLoading = linkMutation.isPending || createMutation.isPending;

  const handleMapClick = (lat: number, lng: number) => {
    if (pinningSidebarItem) {
      // Sidebar pin flow: auto-link immediately, no panel
      linkMutation.mutate({ itemId: pinningSidebarItem.id, lat, lng });
      return;
    }
    // Header drop-pin flow: show the panel
    setPendingPin({ lat, lng });
    setPinMode(false);
  };

  const handleSidebarPin = (item: ItineraryItem) => {
    setPinningSidebarItem(item);
    setPinMode(true);
  };

  const closePinFlow = () => {
    setPendingPin(null);
    setPinMode(false);
    setPinningSidebarItem(null);
    setSidebarOpen(true);
  };

  const handleLink = (itemId: string) => {
    if (!pendingPin) return;
    linkMutation.mutate({ itemId, lat: pendingPin.lat, lng: pendingPin.lng });
  };

  const handleCreate = (form: { title: string; item_date: string; category: string }) => {
    if (!pendingPin || !tripId) return;
    createMutation.mutate({
      trip_id: tripId,
      title: form.title,
      item_date: form.item_date,
      category: form.category,
      lat: pendingPin.lat,
      lng: pendingPin.lng,
    });
  };

  // When a sidebar item has the pin flow started, auto-link once pin is dropped
  const unmappedForPanel = pinningSidebarItem
    ? [pinningSidebarItem, ...unmappedItems.filter((i) => i.id !== pinningSidebarItem.id)]
    : unmappedItems;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">Map</h2>
          <span className="text-sm text-gray-400">{itemsWithCoords.length} pinned</span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => {
                const next = !pinMode;
                setPinMode(next);
                if (!next) setPendingPin(null);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                pinMode
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              📍 {pinMode ? 'Click map to drop pin…' : 'Drop Pin'}
            </button>
          )}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            {sidebarOpen ? 'Hide list' : 'Show list'}
          </button>
        </div>
      </div>

      {/* Body: map + optional sidebar */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="relative flex-1">
          <MapContainer
            center={center}
            zoom={itemsWithCoords.length ? 5 : 2}
            className="h-full w-full"
            style={{ zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {itemsWithCoords.length > 0 && <BoundsAdjuster items={itemsWithCoords} />}
            <PinDropper active={pinMode} onPin={handleMapClick} />
            {panTarget && <MapPanner target={panTarget} />}

            {/* Day polylines */}
            {dayPolylines.map(({ day, color, coords }) =>
              coords.length >= 2 ? (
                <Polyline key={day} positions={coords} color={color} weight={2.5} dashArray="6 4" />
              ) : null,
            )}

            {/* Existing markers */}
            {itemsWithCoords.map((item) => (
              <Marker key={item.id} position={[item.lat!, item.lng!]}>
                <Popup>
                  <div className="min-w-[140px]">
                    <p className="font-semibold">{item.title}</p>
                    {item.location && <p className="text-xs text-gray-500">{item.location}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDate(item.item_date, 'EEE, MMM d')}
                      {item.start_time && ` · ${item.start_time}`}
                    </p>
                    <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs capitalize text-gray-500">
                      {item.category}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Pending pin marker */}
            {pendingPin && (
              <Marker position={[pendingPin.lat, pendingPin.lng]} opacity={0.7} />
            )}
          </MapContainer>

          {/* Pin panel floats over map */}
          {pendingPin && canEdit && (
            <PinPanel
              pin={pendingPin}
              unmappedItems={unmappedForPanel}
              tripDays={days}
              onLink={handleLink}
              onCreate={handleCreate}
              onCancel={closePinFlow}
              isLoading={isLoading}
            />
          )}

          {/* Pin mode hint */}
          {pinMode && !pendingPin && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
              {pinningSidebarItem
                ? `Click to pin "${pinningSidebarItem.title}"`
                : 'Click anywhere on the map to drop a pin'}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="hidden w-72 shrink-0 md:block">
            <ActivitySidebar
              items={items}
              days={days}
              dayColors={dayColorMap}
              onPanTo={(lat, lng) => {
                setPanTarget([lat, lng]);
                setTimeout(() => setPanTarget(null), 100);
              }}
              onStartPin={handleSidebarPin}
              canEdit={canEdit}
            />
          </div>
        )}
      </div>

      {/* Weather below */}
      {tripId && (
        <div className="border-t bg-gray-50 p-4">
          <WeatherWidget tripId={tripId} />
          {!currentTrip?.destination_lat && (
            <p className="text-xs text-gray-400">Set trip coordinates to enable weather forecast.</p>
          )}
        </div>
      )}
    </div>
  );
}
