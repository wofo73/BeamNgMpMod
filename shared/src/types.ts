/**
 * Shared domain + wire types for the BeamNG.drive multiplayer mod.
 *
 * Design goals (see README.md):
 *  - Authoritative server: the server owns the vehicle simulation state.
 *  - Client -> server: inputs only (plus lobby/chat/heartbeat control messages).
 *  - Server -> client: periodic authoritative snapshots (players + vehicles).
 *  - Hard cap of MAX_PLAYERS (255) concurrent players per session.
 */

/** Wire protocol identifier used by the BeamNG engine (see lua/common/tcpServer.lua -> "BN01"). */
export const PROTOCOL_ID = "BN01";

/** Maximum number of players supported by this multiplayer mod / session. */
export const MAX_PLAYERS = 255;

/** Fixed simulation tick rate of the authoritative server. */
export const TICK_RATE = 30;

/** Server disconnects clients that did not send a heartbeat within this window. */
export const HEARTBEAT_TIMEOUT_MS = 10_000;

/** Seconds of simulation time advanced per server tick. */
export const TICK_DURATION_SECONDS = 1 / TICK_RATE;

// ---------------------------------------------------------------------------
// Vectors / transforms
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Euler angles (radians) used for vehicle orientation in snapshots. */
export interface EulerAngles {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Authoritative state of a single multiplayer vehicle. */
export interface VehicleState {
  vehicleId: number;
  playerId: number;
  pos: Vec3;
  rot: EulerAngles;
  vel: Vec3;
  angVel: Vec3;
}

/** Lobby / player registry entry. */
export interface PlayerInfo {
  playerId: number;
  name: string;
  teamId: number;
  connectedAt: number;
}

/** Client -> server input for the vehicle driven by `playerId`. */
export interface PlayerInput {
  /** -1.0 (full left) .. 1.0 (full right) */
  steer: number;
  /** 0.0 .. 1.0 */
  throttle: number;
  /** 0.0 .. 1.0 */
  brake: number;
}

// ---------------------------------------------------------------------------
// Messages (JSON payloads, framed with the BN01 header, null terminated)
// ---------------------------------------------------------------------------

export interface HandshakeCommand {
  cmd: "handshake";
  name: string;
}

export interface InputCommand {
  cmd: "input";
  playerId: number;
  seq: number;
  /** server time the input is valid at (ms) */
  timestamp: number;
  input: PlayerInput;
}

export interface ChatCommand {
  cmd: "chat";
  playerId: number;
  text: string;
}

export interface HeartbeatCommand {
  cmd: "heartbeat";
  playerId: number;
  timestamp: number;
}

export type ClientCommand = HandshakeCommand | InputCommand | ChatCommand | HeartbeatCommand;

export interface WelcomeCommand {
  cmd: "welcome";
  serverTime: number;
  tick: number;
  playerId: number;
  players: PlayerInfo[];
  vehicles: VehicleState[];
}

export interface SnapshotCommand {
  cmd: "snapshot";
  serverTime: number;
  tick: number;
  players: PlayerInfo[];
  vehicles: VehicleState[];
}

export interface ChatMessage {
  cmd: "chat";
  playerId: number;
  name: string;
  text: string;
  timestamp: number;
}

export interface ErrorCommand {
  cmd: "error";
  message: string;
}

export type ServerCommand = WelcomeCommand | SnapshotCommand | ChatMessage | ErrorCommand;

export type Message = ClientCommand | ServerCommand;
