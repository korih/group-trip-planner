import type { PresenceUser, ServerMessage, ClientMessage, MemberRole } from '../types';

interface SessionInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
}

/**
 * TripRoom Durable Object
 *
 * One instance per trip (keyed by trip ID). Acts as a pure WebSocket
 * broadcast hub — all connected users receive real-time updates.
 *
 * Uses the hibernation API (ctx.acceptWebSocket) so the DO can sleep
 * between messages, which avoids billing idle connection time on the
 * Cloudflare free tier.
 *
 * Mutation flow:
 *   Worker route → write to D1 → POST to DO /broadcast → DO broadcasts
 *
 * Connection flow:
 *   Client → GET /trips/:id/ws (Worker validates auth, issues ticket)
 *          → GET /ws/connect?ticket=xxx (Worker validates ticket, forwards here)
 *          → DO upgrades to WebSocket
 */
export class TripRoom implements DurableObject {
  private sessions: Map<WebSocket, SessionInfo> = new Map();

  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast endpoint (called by Worker after D1 mutations)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.json<ServerMessage>();
      this.broadcast(message);
      return new Response('ok');
    }

    // WebSocket upgrade endpoint
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    return new Response('Not found', { status: 404 });
  }

  // ============================================================
  // WebSocket lifecycle (hibernation API)
  // ============================================================

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }

    if (parsed.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' } satisfies ServerMessage));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private handleWebSocketUpgrade(_request: Request, url: URL): Response {
    const userId = url.searchParams.get('userId');
    const displayName = url.searchParams.get('displayName') ?? 'Unknown';
    const avatarUrl = url.searchParams.get('avatarUrl') ?? null;
    const role = (url.searchParams.get('role') ?? 'viewer') as MemberRole;

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API — DO can sleep between messages
    this.state.acceptWebSocket(server);

    this.sessions.set(server, { userId, displayName, avatarUrl, role });

    // Send current presence to the new connection
    server.send(JSON.stringify(this.buildPresenceMessage()));

    // Broadcast updated presence to everyone
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(message: ServerMessage, excludeSocket?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      if (ws !== excludeSocket) {
        try {
          ws.send(payload);
        } catch {
          // Connection already closed — remove silently
          this.sessions.delete(ws);
        }
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast(this.buildPresenceMessage());
  }

  private buildPresenceMessage(): ServerMessage & { type: 'presence' } {
    const users: PresenceUser[] = Array.from(this.sessions.values()).map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      role: s.role,
    }));
    return { type: 'presence', users };
  }
}
