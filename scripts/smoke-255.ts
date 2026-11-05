import { GameServer } from "../server/src/GameServer.js";
import { NetworkClient } from "../client/src/NetworkClient.js";
import { MAX_PLAYERS } from "../shared/src/types.js";
import type { ServerCommand, WelcomeCommand } from "../shared/src/types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectWelcome(client: NetworkClient, name: string): Promise<WelcomeCommand> {
  return new Promise<WelcomeCommand>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for welcome from ${name}`));
    }, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      client.onMessage = () => undefined;
      client.onClose = () => undefined;
    };
    const onMessage = (message: ServerCommand) => {
      if (message.cmd === "welcome") {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(message as WelcomeCommand);
      }
    };
    const onClose = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`connection closed before welcome from ${name}`));
    };
    client.onMessage = onMessage;
    client.onClose = onClose;
    client.send({ cmd: "handshake", name });
  });
}

function expectError(client: NetworkClient, name: string, prefix: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for error from ${name}`));
    }, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      client.onMessage = () => undefined;
      client.onClose = () => undefined;
    };
    const onMessage = (message: ServerCommand) => {
      if (message.cmd === "error") {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(message.message);
      }
    };
    const onClose = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`connection closed before error from ${name}`));
    };
    client.onMessage = onMessage;
    client.onClose = onClose;
    client.send({ cmd: "handshake", name });
  });
}

async function main(): Promise<void> {
  const port = 4598;
  const server = new GameServer({ port, maxPlayers: MAX_PLAYERS, tickRate: 30, heartbeatTimeoutMs: 60_000 });
  server.start(port);
  await sleep(300);

  const clients: NetworkClient[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const client = new NetworkClient();
    await client.connect("127.0.0.1", port);
    const welcome = await expectWelcome(client, `Player${i}`);
    console.log(`SMOKE255 OK: player ${i} joined as slot ${welcome.playerId}`);
    clients.push(client);
  }

  const overflow = new NetworkClient();
  await overflow.connect("127.0.0.1", port);
  const errorMessage = await expectError(overflow, "Player255", "session_full");
  console.log(`SMOKE255 OK: overflow client rejected with: ${errorMessage}`);

  for (const client of clients) {
    client.close();
  }
  overflow.close();
  server.stop();
  await sleep(300);
  console.log("SMOKE255 COMPLETED SUCCESSFULLY");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
