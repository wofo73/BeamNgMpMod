import type { Socket } from "node:net";
import { ServerNet } from "./net/ServerNet";
import { Session } from "./Session";
import { MAX_PLAYERS, TICK_RATE } from "../../shared/src/types";
import type { ClientCommand, ServerCommand } from "../../shared/src/types";

export interface GameServerOptions {
  port: number;
  /** Maximum number of concurrent players per session (default: 255). */
  maxPlayers?: number;
  /** Authoritative simulation tick rate in Hz. */
  tickRate?: number;
  /** Heartbeat timeout in milliseconds before a client is dropped. */
  heartbeatTimeoutMs?: number;
}

/**
 * Authoritative BeamNG.drive multiplayer server.
 *
 * Responsibilities:
 *  - accept client connections (TCP, BN01 framing)
 *  - lobby / player slot management (hard cap of MAX_PLAYERS = 255 per session)
 *  - collect client inputs
 *  - run the authoritative simulation tick
 *  - broadcast authoritative snapshots back to all connected players
 */
export class GameServer {
  private readonly maxPlayers: number;
  private readonly tickRate: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly net: ServerNet;
  private readonly sessions = new Map<string, Session>();
  private readonly socketToSessionId = new Map<Socket, string>();
  private readonly socketToPlayerId = new Map<Socket, number>();
  private readonly playerIdToSessionId = new Map<number, string>();
  private readonly playerIdToSocket = new Map<number, Socket>();
  private readonly defaultSession: Session;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(options: GameServerOptions) {
    this.maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
    this.tickRate = options.tickRate ?? TICK_RATE;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000;
    this.net = new ServerNet({
      onMessage: (socket, message) => this.handleMessage(socket, message),
      onClose: (socket) => this.handleClose(socket),
    });
    this.defaultSession = this.getOrCreateSession("default");
  }

  start(port: number): void {
    this.net.start(port);
    this.running = true;
    this.timer = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.net.stop();
  }

  getMaxPlayers(): number {
    return this.maxPlayers;
  }

  getSessionPlayerCount(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.playerCount : 0;
  }

  private getOrCreateSession(id: string): Session {
    let session = this.sessions.get(id);
    if (!session) {
      session = new Session(id, this.maxPlayers);
      this.sessions.set(id, session);
    }
    return session;
  }

  private handleMessage(socket: Socket, message: ClientCommand): void {
    switch (message.cmd) {
      case "handshake": {
        const sessionId = this.socketToSessionId.get(socket) ?? "default";
        const session = this.getOrCreateSession(sessionId);
        if (session.playerCount >= this.maxPlayers) {
          this.net.send(socket, { cmd: "error", message: `session_full_max_players_${this.maxPlayers}` });
          return;
        }
        const playerId = session.playerCount;
        const player = session.addPlayer(playerId, message.name, socket);
        this.socketToPlayerId.set(socket, playerId);
        this.socketToSessionId.set(socket, session.id);
        this.playerIdToSessionId.set(playerId, session.id);
        this.playerIdToSocket.set(playerId, socket);

        this.net.send(socket, {
          cmd: "welcome",
          serverTime: session.getServerTime(),
          tick: session.getTick(),
          playerId,
          players: session.listPlayers(),
          vehicles: session.getVehicles(),
        });

        const snapshot = session.tickOnce();
        if (snapshot) {
          this.broadcast(session, snapshot);
        }
        break;
      }
      case "input": {
        const sessionId = this.socketToSessionId.get(socket);
        if (!sessionId) {
          return;
        }
        const session = this.getOrCreateSession(sessionId);
        const accepted = session.handleInput(message.playerId, message.input, message.seq);
        if (!accepted) {
          this.net.send(socket, { cmd: "error", message: "stale_input" });
        }
        break;
      }
      case "chat": {
        const sessionId = this.socketToSessionId.get(socket);
        if (!sessionId) {
          return;
        }
        const session = this.getOrCreateSession(sessionId);
        const sender = session.getPlayer(message.playerId);
        const chat = sender ? session.createChatMessage(sender, message.text) : null;
        if (chat) {
          this.broadcast(session, chat);
        }
        break;
      }
      case "heartbeat": {
        const sessionId = this.socketToSessionId.get(socket);
        if (!sessionId) {
          return;
        }
        const session = this.getOrCreateSession(sessionId);
        session.heartbeat(message.playerId, message.timestamp);
        break;
      }
      default:
        console.warn(`[GameServer] unknown command from ${socket.remoteAddress}: ${JSON.stringify(message)}`);
    }
  }

  private handleClose(socket: Socket): void {
    const playerId = this.socketToPlayerId.get(socket);
    const sessionId = this.socketToSessionId.get(socket);
    if (playerId !== undefined && sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.removePlayer(playerId);
      }
      this.playerIdToSessionId.delete(playerId);
      this.playerIdToSocket.delete(playerId);
    }
    this.socketToPlayerId.delete(socket);
    this.socketToSessionId.delete(socket);
  }

  private broadcast(session: Session, message: ServerCommand): void {
    for (const socket of session.getPlayerSockets()) {
      this.net.send(socket, message);
    }
  }

  private tick(): void {
    if (!this.running) {
      return;
    }
    const now = Date.now();
    for (const session of this.sessions.values()) {
      for (const player of session.getPlayers()) {
        if (now - player.lastHeartbeatAt > this.heartbeatTimeoutMs) {
          const socket = this.playerIdToSocket.get(player.playerId);
          if (socket) {
            socket.destroy();
          }
        }
      }
      const snapshot = session.tickOnce();
      if (snapshot) {
        this.broadcast(session, snapshot);
      }
    }
  }
}