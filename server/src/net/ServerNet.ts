import { createServer, type Socket } from "node:net";
import { decodeMessage, encodeMessage } from "../../../shared/src/protocol";
import type { ClientCommand, Message } from "../../../shared/src/types";

export interface ServerNetHandlers {
  onMessage: (socket: Socket, message: ClientCommand) => void;
  onClose: (socket: Socket) => void;
}

interface ClientEntry {
  socket: Socket;
  buffer: Buffer;
}

/**
 * Low level TCP server for the BeamNG.drive multiplayer mod.
 * Implements the game compatible framing:
 *   "BN01" | uint32 LE length (incl. null) | JSON + "\0"
 */
export class ServerNet {
  private server: ReturnType<typeof createServer> | null = null;
  private clients = new Map<Socket, ClientEntry>();
  private handlers: ServerNetHandlers;

  constructor(handlers: ServerNetHandlers) {
    this.handlers = handlers;
  }

  start(port: number): void {
    const server = createServer((socket) => {
      const entry: ClientEntry = { socket, buffer: Buffer.alloc(0) };
      this.clients.set(socket, entry);
      socket.on("data", (chunk: Buffer) => this.onData(socket, entry, chunk));
      socket.on("close", () => {
        this.clients.delete(socket);
        this.handlers.onClose(socket);
      });
      socket.on("error", () => {
        this.clients.delete(socket);
        this.handlers.onClose(socket);
      });
    });
    server.listen(port, "0.0.0.0");
    this.server = server;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    for (const entry of this.clients.values()) {
      entry.socket.destroy();
    }
    this.clients.clear();
  }

  /** Sends a single encoded message to a connected client. Returns false when the client is unknown. */
  send(socket: Socket, message: Message): boolean {
    const entry = this.clients.get(socket);
    if (!entry) {
      return false;
    }
    const encoded = encodeMessage(message);
    return entry.socket.write(encoded);
  }

  private onData(socket: Socket, entry: ClientEntry, chunk: Buffer): void {
    entry.buffer = Buffer.concat([entry.buffer, chunk]);
    for (;;) {
      const decoded = decodeMessage(entry.buffer);
      if (!decoded) {
        return;
      }
      entry.buffer = entry.buffer.subarray(decoded.end);
      this.handlers.onMessage(socket, decoded.message as ClientCommand);
    }
  }
}
