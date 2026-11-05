import type { PlayerInput, VehicleState } from "../../shared/src/types";

/**
 * Integration contract between the BeamNG.drive multiplayer mod and the game itself.
 *
 * The Lua mod layer of BeamNG.drive implements this interface on top of the
 * engine scripting API (sim / vehicle / camera bindings), while the TypeScript
 * multiplayer core (`BeamNgMpMod`) drives the networking side.
 */
export interface BeamNgGameBridge {
  /** Id of the local player inside the multiplayer session. */
  readonly localPlayerId: number;
  /** Polls the current player input (steering / throttle / brake) from the game input system. */
  getLocalInput(): PlayerInput;
  /** Returns the locally simulated vehicle state (used for corrections / prediction). */
  getLocalVehicleState(): VehicleState | null;
  /** Applies a (remote or authoritative) vehicle state to the game world. */
  applyVehicleState(vehicleId: number, state: VehicleState): void;
}
