import type { VehicleState } from "../../shared/src/types";

interface Sample {
  time: number;
  state: VehicleState;
}

/**
 * Client side state interpolation between two consecutive server snapshots.
 */
export class InterpolationEngine {
  private history = new Map<number, Sample[]>();

  /** Stores a new sample and returns it. */
  push(vehicleId: number, state: VehicleState, time: number): VehicleState {
    const samples = this.history.get(vehicleId) ?? [];
    samples.push({ time, state });
    if (samples.length > 2) {
      samples.shift();
    }
    this.history.set(vehicleId, samples);
    return state;
  }

  /** Returns the vehicle state at `time`, interpolated between the last two samples. */
  sample(vehicleId: number, time: number): VehicleState | null {
    const samples = this.history.get(vehicleId);
    if (!samples || samples.length === 0) {
      return null;
    }
    const last = samples[samples.length - 1];
    if (samples.length === 1) {
      return last.state;
    }
    const previous = samples[0];
    const span = Math.max(Number.EPSILON, last.time - previous.time);
    const t = Math.min(1, Math.max(0, (time - previous.time) / span));
    return this.lerp(previous.state, last.state, t);
  }

  clear(): void {
    this.history.clear();
  }

  private lerp(a: VehicleState, b: VehicleState, t: number): VehicleState {
    const lerpValue = (from: number, to: number) => from + (to - from) * t;
    return {
      vehicleId: b.vehicleId,
      playerId: b.playerId,
      pos: {
        x: lerpValue(a.pos.x, b.pos.x),
        y: lerpValue(a.pos.y, b.pos.y),
        z: lerpValue(a.pos.z, b.pos.z),
      },
      rot: {
        x: lerpValue(a.rot.x, b.rot.x),
        y: lerpValue(a.rot.y, b.rot.y),
        z: lerpValue(a.rot.z, b.rot.z),
      },
      vel: {
        x: lerpValue(a.vel.x, b.vel.x),
        y: lerpValue(a.vel.y, b.vel.y),
        z: lerpValue(a.vel.z, b.vel.z),
      },
      angVel: {
        x: lerpValue(a.angVel.x, b.angVel.x),
        y: lerpValue(a.angVel.y, b.angVel.y),
        z: lerpValue(a.angVel.z, b.angVel.z),
      },
    };
  }
}
