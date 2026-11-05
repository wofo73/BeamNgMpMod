import type { Message } from "./types";

/**
 * BeamNG compatible TCP message framing.
 *
 * This mirrors the framing implemented in the game (`lua/common/tcpServer.lua`):
 *   - 4 byte identifier: "BN01"
 *   - 4 byte unsigned length (little endian), includes the trailing null byte
 *   - JSON encoded message + null terminator
 */

const IDENTIFIER = Buffer.from([0x42, 0x4e, 0x30, 0x31]); // "BN01"
const HEADER_SIZE = 8; // 4 byte identifier + 4 byte length

export interface DecodedMessage {
  message: Message;
  /** Offset just past the end of this frame in the buffer. */
  end: number;
}

export function encodeMessage(message: Message): Buffer {
  const json = JSON.stringify(message);
  const payload = Buffer.concat([Buffer.from(json, "utf8"), Buffer.from([0])]);
  const header = Buffer.alloc(HEADER_SIZE);
  IDENTIFIER.copy(header, 0);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

export function decodeMessage(buffer: Buffer, offset = 0): DecodedMessage | null {
  if (buffer.length - offset < HEADER_SIZE) {
    return null;
  }
  const identifier = buffer.toString("ascii", offset, offset + 4);
  if (identifier !== "BN01") {
    return null;
  }
  const length = buffer.readUInt32LE(offset + 4);
  const bodyStart = offset + HEADER_SIZE;
  const bodyEnd = bodyStart + length;
  if (bodyEnd > buffer.length) {
    return null;
  }
  const json = buffer.toString("utf8", bodyStart, bodyEnd - 1);
  const message = JSON.parse(json) as Message;
  return { message, end: bodyEnd };
}

/** Extracts and decodes all complete frames from `buffer`. Returns the leftover bytes. */
export function drainFrames(buffer: Buffer): { messages: Message[]; leftover: Buffer } {
  const messages: Message[] = [];
  let offset = 0;
  for (;;) {
    const decoded = decodeMessage(buffer, offset);
    if (!decoded) {
      break;
    }
    messages.push(decoded.message);
    offset = decoded.end;
  }
  const leftover = offset === 0 ? buffer : buffer.subarray(offset);
  return { messages, leftover };
}
