import { GameServer } from "../server/src/GameServer";
import { BeamNgMpMod } from "../client/src/BeamNgMpMod";
import type { BeamNgGameBridge } from "../client/src/GameBridge";
import type { ChatMessage, PlayerInput, VehicleState } from "../shared/src/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SmokeBridge implements BeamNgGameBridge {
  readonly localPlayerId: number;
  input: PlayerInput = { steer: 0, throttle: 0, brake: 0 };
  applied = new Map<number, VehicleState>();

  constructor(localPlayerId: number) {
    this.localPlayerId = localPlayerId;
  }

  getLocalInput(): PlayerInput {
    return this.input;
  }

  getLocalVehicleState(): VehicleState | null {
    return null;
  }

  applyVehicleState(vehicleId: number, state: VehicleState): void {
    this.applied.set(vehicleId, state);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`SMOKE TEST FAILED: ${message}`);
  }
  console.log(`SMOKE OK: ${message}`);
}

const PORT = 4599;

async function main(): Promise<void> {
  const server = new GameServer({ port: PORT, maxPlayers: 255, tickRate: 30, heartbeatTimeoutMs: 10_000 });
  server.start(PORT);
  await sleep(300);

  const bridgeA = new SmokeBridge(0);
  const mpA = new BeamNgMpMod(bridgeA, { host: "127.0.0.1", port: PORT, name: "Alice", localPlayerId: 0 });
  const connectedA = await mpA.connect();
  assert(connectedA, "client A connected and received welcome");

  const bridgeB = new SmokeBridge(1);
  const mpB = new BeamNgMpMod(bridgeB, { host: "127.0.0.1", port: PORT, name: "Bob", localPlayerId: 1 });
  const connectedB = await mpB.connect();
  assert(connectedB, "client B connected and received welcome");

  // Let the server tick a few times so snapshots flow to both clients.
  for (let i = 0; i < 10; i++) {
    mpA.start();
    mpB.start();
    await sleep(60);
  }

  // Client A throttles the engine -> authoritative server should move vehicle 0.
  bridgeA.input = { steer: 0, throttle: 1, brake: 0 };
  for (let i = 0; i < 15; i++) {
    mpA.start();
    await sleep(30);
  }

  const appliedA = bridgeA.applied.get(1); // vehicleId 1 belongs to playerId 0
  assert(appliedA !== undefined, "client A received an authoritative snapshot for its own vehicle");
  if (appliedA) {
    assert(appliedA.pos.x > 0, `client A authoritative vehicle moved forward (pos.x=${appliedA.pos.x})`);
  }
  const appliedB = bridgeB.applied.get(2); // vehicleId 2 belongs to playerId 1
  assert(appliedB !== undefined, "client B received an authoritative snapshot for player B's vehicle");

  // Chat round trip: A -> B.
  const chatMessages: unknown[] = [];
  mpB.onChat = (message: ChatMessage) => chatMessages.push(message);
  mpA.sendChat("hello from alice");
  await sleep(300);
  assert(chatMessages.length === 1, "chat message from A was delivered to B");
  const chat = chatMessages[0] as { cmd: string; text: string; name: string };
  assert(chat.text === "hello from alice" && chat.name === "Alice", "chat payload is correct");

  // Disconnect cleanup.
  mpA.stop();
  await sleep(700);
  mpB.stop();

  server.stop();
  await sleep(200);
  console.log("SMOKE TEST COMPLETED SUCCESSFULLY");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
