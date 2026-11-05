import { BeamNgMpMod } from "./BeamNgMpMod";
import type { BeamNgGameBridge } from "./GameBridge";
import type { PlayerInput, VehicleState } from "../../shared/src/types";

/**
 * Standalone BeamNG.drive multiplayer mod client.
 *
 * In-game this class is instantiated by the Lua mod layer through the
 * `BeamNgGameBridge`; here it is exposed as a small CLI client for testing.
 */
class HeadlessBridge implements BeamNgGameBridge {
  readonly localPlayerId: number;
  private input: PlayerInput = { steer: 0, throttle: 0, brake: 0 };

  constructor(localPlayerId: number) {
    this.localPlayerId = localPlayerId;
  }

  getLocalInput(): PlayerInput {
    return this.input;
  }

  getLocalVehicleState(): VehicleState | null {
    return null;
  }

  applyVehicleState(_vehicleId: number, _state: VehicleState): void {
    // no-op for headless operation
  }
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value === undefined ? undefined : value;
}

const host = argValue("host") ?? "127.0.0.1";
const port = Number(argValue("port") ?? 4444);
const name = argValue("name") ?? "Player";
const localPlayerId = Number(argValue("localPlayerId") ?? 0);

const bridge = new HeadlessBridge(localPlayerId);
const mp = new BeamNgMpMod(bridge, { host, port, name, localPlayerId });

try {
  const connected = await mp.connect();
  if (!connected) {
    console.error("[Client] Could not connect to the BeamNG.drive multiplayer server.");
    process.exit(1);
  }
  console.log(`[Client] Connected to ${host}:${port} as ${name} (playerId ${localPlayerId})`);

  mp.start();
  setTimeout(() => {
    console.log("[Client] stopping");
    mp.stop();
    process.exit(0);
  }, 10_000);
} catch (error) {
  console.error("[Client] Connection failed:", error);
  process.exit(1);
}
