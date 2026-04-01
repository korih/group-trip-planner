import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api/client';
import { useTripStore } from '../store/tripStore';
import { useAuthStore } from '../store/authStore';
import type { CurrentTrip, TripMember } from '../store/tripStore';

export function useTrip(tripId: string | undefined) {
  const { setCurrentTrip, setMembers, setUserRole } = useTripStore();
  const { user } = useAuthStore();

  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => api.get<CurrentTrip>(`/trips/${tripId}`),
    enabled: !!tripId,
  });

  const membersQuery = useQuery({
    queryKey: ['trip-members', tripId],
    queryFn: () => api.get<TripMember[]>(`/trips/${tripId}/members`),
    enabled: !!tripId,
  });

  useEffect(() => {
    setCurrentTrip(tripQuery.data ?? null);
  }, [tripQuery.data, setCurrentTrip]);

  useEffect(() => {
    const members = membersQuery.data ?? [];
    setMembers(members);
    if (user) {
      const me = members.find((m) => m.user_id === user.id);
      setUserRole(me?.role ?? null);
    }
  }, [membersQuery.data, user, setMembers, setUserRole]);

  return {
    trip: tripQuery.data ?? null,
    members: membersQuery.data ?? [],
    isLoading: tripQuery.isLoading,
    error: tripQuery.error,
  };
}
