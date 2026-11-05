import { connect, type Socket } from "node:net";
import { decodeMessage, encodeMessage } from "../../shared/src/protocol";
import type { ClientCommand, ServerCommand } from "../../shared/src/types";

/**
 * TCP client for the BeamNG.drive multiplayer mod, using the game compatible
 * "BN01" framing: "BN01" | uint32 LE length (incl. null) | JSON + "\0"
 */
export class NetworkClient {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private welcome: ServerCommand | null = null;
  private serverTime = 0;
  private tick = 0;
  private connected = false;
  onMessage: (message: ServerCommand) => void = () => {};
  onClose: () => void = () => {};

  connect(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = connect(port, host, () => {
        this.socket = socket;
        socket.on("data", (chunk: Buffer) => this.handleData(chunk));
        socket.on("close", () => {
          this.connected = false;
          this.onClose();
        });
        resolve();
      });
      socket.on("error", (error: Error) => {
        this.connected = false;
        reject(error);
      });
    });
  }

  send(message: ClientCommand): void {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.socket.write(encodeMessage(message));
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const decoded = decodeMessage(this.buffer);
      if (!decoded) {
        return;
      }
      this.buffer = this.buffer.subarray(decoded.end);
      this.onMessage(decoded.message as ServerCommand);
    }
  }
}
