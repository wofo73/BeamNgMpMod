import type { Socket } from "node:net";
import { VehicleSim } from "./VehicleSim";
import type { PlayerInfo, PlayerInput, ServerCommand, VehicleState } from "../../shared/src/types";

export interface SessionPlayer {
  playerId: number;
  name: string;
  teamId: number;
  connectedAt: number;
  lastHeartbeatAt: number;
  lastInput: PlayerInput | null;
  lastInputSeq: number;
}

/**
 * A single multiplayer session (room). One session == one running map + player slots.
 * The session owns the authoritative vehicle simulation and produces snapshots.
 */
export class Session {
  readonly id: string;
  readonly maxPlayers: number;
  readonly vehicles = new VehicleSim();

  private players = new Map<number, SessionPlayer>();
  private sockets = new Map<number, Socket>();
  private tick = 0;
  private serverTime = Date.now();
  private lastTickAt = Date.now();

  constructor(id: string, maxPlayers: number) {
    this.id = id;
    this.maxPlayers = maxPlayers;
  }

  get playerCount(): number {
    return this.players.size;
  }

  addPlayer(playerId: number, name: string, socket: Socket): SessionPlayer {
    const player: SessionPlayer = {
      playerId,
      name,
      teamId: 0,
      connectedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      lastInput: null,
      lastInputSeq: -1,
    };
    this.players.set(playerId, player);
    this.sockets.set(playerId, socket);
    this.vehicles.createVehicle(playerId);
    return player;
  }

  removePlayer(playerId: number): void {
    this.players.delete(playerId);
    const vehicle = this.vehicles.getVehicleByPlayerId(playerId);
    if (vehicle) {
      this.vehicles.removeVehicleByPlayerId(playerId);
    }
    this.sockets.delete(playerId);
  }

  getPlayer(playerId: number): SessionPlayer | undefined {
    return this.players.get(playerId);
  }

  getPlayers(): SessionPlayer[] {
    return Array.from(this.players.values());
  }

  getServerTime(): number {
    return this.serverTime;
  }

  getTick(): number {
    return this.tick;
  }

  getVehicles(): VehicleState[] {
    return this.vehicles.getAll();
  }

  listPlayers(): PlayerInfo[] {
    const result: PlayerInfo[] = [];
    for (const player of this.players.values()) {
      result.push({ playerId: player.playerId, name: player.name, teamId: player.teamId, connectedAt: player.connectedAt });
    }
    return result;
  }

  getPlayerSockets(): Socket[] {
    return Array.from(this.sockets.values());
  }

  handleInput(playerId: number, input: PlayerInput, seq: number): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }
    player.lastInput = input;
    player.lastInputSeq = seq;
    return true;
  }

  heartbeat(playerId: number, timestamp: number): void {
    const player = this.players.get(playerId);
    if (player) {
      player.lastHeartbeatAt = timestamp;
    }
  }

  /** Advances the simulation by one tick and returns the broadcast snapshot. */
  tickOnce(): ServerCommand | null {
    if (this.players.size === 0) {
      return null;
    }
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    this.tick += 1;
    this.serverTime += dt;

    const inputs = new Map<number, PlayerInput>();
    for (const player of this.players.values()) {
      if (player.lastInput) {
        inputs.set(player.playerId, player.lastInput);
      }
    }
    this.vehicles.step(dt, inputs);

    const snapshot: ServerCommand = {
      cmd: "snapshot",
      serverTime: this.serverTime,
      tick: this.tick,
      players: this.listPlayers(),
      vehicles: this.vehicles.getAll(),
    };
    return snapshot;
  }

  createChatMessage(sender: SessionPlayer, text: string): ServerCommand | null {
    if (sender.name === "") {
      return null;
    }
    const message: ServerCommand = {
      cmd: "chat",
      playerId: sender.playerId,
      name: sender.name,
      text,
      timestamp: Date.now(),
    };
    return message;
  }
}
