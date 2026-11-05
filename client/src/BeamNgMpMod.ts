import { NetworkClient } from "./NetworkClient";
import { InterpolationEngine } from "./InterpolationEngine";
import type { BeamNgGameBridge } from "./GameBridge";
import { TICK_RATE } from "../../shared/src/types";
import type { ChatMessage, ServerCommand, SnapshotCommand } from "../../shared/src/types";

export interface BeamNgMpModConfig {
  host: string;
  port: number;
  name: string;
  localPlayerId: number;
}

/**
 * BeamNG.drive multiplayer mod (client side).
 *
 * Drives the game <-> multiplayer session:
 *  - handshake on connect, welcome handling
 *  - periodic authoritative snapshot consumption + interpolation + application
 *  - input collection / sending at the server tick rate
 */
export class BeamNgMpMod {
  private client: NetworkClient;
  private interpolator = new InterpolationEngine();
  private connected = false;
  private latestSnapshot: SnapshotCommand | null = null;
  private serverTime = 0;
  private tick = 0;
  private inputSeq = 0;
  private lastInputSentAt = 0;
  private readonly inputSendIntervalMs: number;
  private readonly bridge: BeamNgGameBridge;
  private readonly config: BeamNgMpModConfig;
  onChat: ((message: ChatMessage) => void) | null = null;

  constructor(bridge: BeamNgGameBridge, config: BeamNgMpModConfig) {
    this.bridge = bridge;
    this.config = config;
    this.client = new NetworkClient();
    this.inputSendIntervalMs = 1000 / TICK_RATE;
  }

  async connect(): Promise<boolean> {
    this.client.onMessage = (message) => this.handleServerMessage(message);
    this.client.onClose = () => {
      this.connected = false;
      this.interpolator.clear();
    };
    await this.client.connect(this.config.host, this.config.port);
    this.client.send({ cmd: "handshake", name: this.config.name });

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 5000);
      this.client.onMessage = (message) => {
        if (message.cmd === "welcome") {
          finish(true);
        }
        this.handleServerMessage(message);
      };
      this.client.onClose = () => finish(false);
    });
  }

  /** Called once per game tick / frame by the mod integration layer. */
  start(): void {
    if (!this.connected) {
      return;
    }

    const now = Date.now();
    if (now - this.lastInputSentAt >= this.inputSendIntervalMs) {
      this.sendInput();
      this.lastInputSentAt = now;
    }

    const snapshot = this.latestSnapshot;
    if (snapshot) {
      this.applySnapshot(snapshot);
    }
  }

  stop(): void {
    this.client.close();
  }

  sendChat(text: string): void {
    if (!this.connected) {
      return;
    }
    this.client.send({ cmd: "chat", playerId: this.bridge.localPlayerId, text });
  }

  private sendInput(): void {
    this.inputSeq += 1;
    this.client.send({
      cmd: "input",
      playerId: this.bridge.localPlayerId,
      seq: this.inputSeq,
      timestamp: Date.now(),
      input: this.bridge.getLocalInput(),
    });
  }

  private handleServerMessage(message: ServerCommand): void {
    switch (message.cmd) {
      case "welcome": {
        this.connected = true;
        this.serverTime = message.serverTime;
        this.tick = message.tick;
        break;
      }
      case "snapshot": {
        this.latestSnapshot = message;
        this.serverTime = message.serverTime;
        this.tick = message.tick;
        this.applySnapshot(message);
        break;
      }
      case "chat": {
        this.onChat?.(message);
        break;
      }
      case "error": {
        console.warn(`[BeamNgMpMod] server error: ${message.message}`);
        break;
      }
      default: {
        break;
      }
    }
  }

  private applySnapshot(snapshot: SnapshotCommand): void {
    for (const vehicle of snapshot.vehicles) {
      const state = this.interpolator.push(vehicle.vehicleId, vehicle, snapshot.serverTime) ?? vehicle;
      const sampled = this.interpolator.sample(vehicle.vehicleId, Date.now()) ?? state;
      this.bridge.applyVehicleState(vehicle.vehicleId, sampled);
    }
  }
}
