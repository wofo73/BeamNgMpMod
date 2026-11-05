import type { PlayerInput, VehicleState } from "../../shared/src/types";

const VEHICLE_MASS = 1200; // kg, reference mass used by the reference simulation
const ENGINE_FORCE = 14_000; // N, rough peak engine force
const BRAKE_FORCE = 26_000; // N
const LINEAR_DECELERATION = 0.9; // 1/s
const MAX_SPEED = 60; // m/s
const STEERING_TORQUE = 25; // rad/s^2 per unit of steer input

/**
 * Authoritative vehicle simulation used by the multiplayer server.
 *
 * The real BeamNG.drive simulation lives in the engine; this reference
 * implementation is used by the mod to authoritatively advance vehicle state
 * from the latest known inputs and produce snapshots. Swapping in the real
 * engine simulation is a drop-in replacement of {@link step}.
 */
export class VehicleSim {
  private vehiclesById = new Map<number, VehicleState>();
  private vehiclesByPlayerId = new Map<number, VehicleState>();
  private nextVehicleId = 1;

  createVehicle(playerId: number): VehicleState {
    const vehicleId = this.nextVehicleId++;
    const state: VehicleState = {
      vehicleId,
      playerId,
      pos: { x: 0, y: 1, z: 0 },
      rot: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      angVel: { x: 0, y: 0, z: 0 },
    };
    this.vehiclesById.set(vehicleId, state);
    this.vehiclesByPlayerId.set(playerId, state);
    return state;
  }

  getVehicleByPlayerId(playerId: number): VehicleState | undefined {
    return this.vehiclesByPlayerId.get(playerId);
  }

  getVehicleById(vehicleId: number): VehicleState | undefined {
    return this.vehiclesById.get(vehicleId);
  }

  getAll(): VehicleState[] {
    return Array.from(this.vehiclesById.values());
  }

  removeVehicleByPlayerId(playerId: number): void {
    const vehicle = this.vehiclesByPlayerId.get(playerId);
    if (vehicle) {
      this.vehiclesById.delete(vehicle.vehicleId);
      this.vehiclesByPlayerId.delete(playerId);
    }
  }

  /** Advances every vehicle by `dt` seconds using the latest inputs. */
  step(dt: number, inputs: Map<number, PlayerInput>): void {
    for (const vehicle of this.vehiclesById.values()) {
      const input = inputs.get(vehicle.playerId);

      const engineForce = (input?.throttle ?? 0) * ENGINE_FORCE;
      const brakeForce = (input?.brake ?? 0) * BRAKE_FORCE;
      const drag = LINEAR_DECELERATION * vehicle.vel.x;
      const acceleration = (engineForce - brakeForce - drag) / VEHICLE_MASS;
      vehicle.vel.x = Math.min(MAX_SPEED, Math.max(0, vehicle.vel.x + acceleration * dt));
      vehicle.pos.x += vehicle.vel.x * dt;

      const yawRate = (input?.steer ?? 0) * STEERING_TORQUE * dt;
      vehicle.angVel.y += yawRate;
      vehicle.rot.y += vehicle.angVel.y * dt;
    }
  }
}
