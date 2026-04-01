import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeStore } from '../store/realtimeStore';
import { api } from '../api/client';
import type { ServerMessage } from '../types/websocket';

const PING_INTERVAL = 25_000;   // 25s — keep-alive before Cloudflare's 100s idle timeout
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1_000; // 1s, doubles each retry

/**
 * Manages a WebSocket connection to the TripRoom Durable Object.
 * Handles auth ticket flow, reconnection with exponential backoff,
 * and invalidates React Query caches on server-push events.
 */
export function useTripWebSocket(tripId: string | null) {
  const queryClient = useQueryClient();
  const { setConnectedUsers, setConnected } = useRealtimeStore();

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(async () => {
    if (!tripId || unmountedRef.current) return;

    try {
      // Step 1: get a short-lived WebSocket ticket from the Worker
      const { ticketUrl } = await api.get<{ ticketUrl: string }>(`/trips/${tripId}/ws`);

      if (unmountedRef.current) return;

      const ws = new WebSocket(ticketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);

        // Start keep-alive pings
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        handleMessage(msg);
      };

      ws.onclose = () => {
        cleanup();
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'presence':
          setConnectedUsers(msg.users);
          break;
        case 'entity_created':
        case 'entity_updated':
        case 'entity_deleted':
          // Invalidate the relevant query so React Query refetches
          queryClient.invalidateQueries({ queryKey: [msg.entityType, tripId] });
          break;
        case 'activity':
          queryClient.invalidateQueries({ queryKey: ['activity', tripId] });
          break;
        default:
          break;
      }
    },
    [queryClient, tripId, setConnectedUsers],
  );

  const cleanup = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    setConnected(false);
    setConnectedUsers([]);
  }, [setConnected, setConnectedUsers]);

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return;
    if (retryRef.current >= MAX_RETRIES) {
      console.warn('[ws] Max retries reached, giving up');
      return;
    }
    const delay = BASE_RETRY_DELAY * Math.pow(2, retryRef.current);
    retryRef.current += 1;
    retryTimerRef.current = setTimeout(connect, delay);
  }, [connect]);

  useEffect(() => {
    unmountedRef.current = false;
    if (tripId) connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      cleanup();
      wsRef.current?.close();
    };
  }, [tripId, connect, cleanup]);
}
