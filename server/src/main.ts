import { GameServer } from "./GameServer";

const port = Number(process.argv[2] ?? 4444);

const server = new GameServer({
  port,
  maxPlayers: 255,
  tickRate: 30,
  heartbeatTimeoutMs: 10_000,
});

server.start(port);

function shutdown(): void {
  console.log("[GameServer] shutting down ...");
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[GameServer] BeamNG.drive multiplayer server listening on 0.0.0.0:${port} (max players: 255, tick rate: 30 Hz)`);
