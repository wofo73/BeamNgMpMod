# BeamNG.drive Multiplayer Mod — "Up to 255 Players"

A BeamNG.drive multiplayer mod core that brings authoritative online multiplayer
to BeamNG.drive (the game this was built against: v0.39/0.40 era, LuaJIT + LuaSocket
in the engine) and supports **up to 255 players per session**.

The mod implements the server's authoritative simulation, client input handling,
state snapshots, interpolation and lobby behaviour, using the same wire protocol
the BeamNG engine itself uses for its TCP multiplayer transport
(`BN01` frame header + little-endian length + null terminated JSON payload).

## Features

- **Authoritative server**: one server owns the vehicle simulation state; clients
  only send inputs and render server state.
- **Fixed tick loop**: 30 Hz authoritative simulation (`TICK_RATE`), snapshots at
  the same rate.
- **Interpolation**: clients interpolate between the last two snapshots
  (`InterpolationEngine`) before applying remote / own authoritative states.
- **Input protocol**: `input` messages with sequence numbers (`seq`) and timestamps;
  the server keeps the latest input per player and drops stale input.
- **Lobby / slots**: player slots are handed out per session, hard capped at
  **255 concurrent players** (`MAX_PLAYERS`).
- **Heartbeat / timeout**: clients send heartbeats; the server disconnects
  clients that stopped heartbeating (`HEARTBEAT_TIMEOUT_MS`).
- **Chat**: `chat` broadcast between session players.

## Architecture

```
                    TCP (BN01 framing)
  BeamNG client A <--------------------> [ BeamNG multiplayer server ]
                    TCP (BN01 framing)                    |
  BeamNG client B <-------------------->            authoritative simulation
                    TCP (BN01 framing)                    |
  BeamNG client C <-------------------->            snapshots @ 30 Hz
                    ...                                     |
                                                        v
                                             VehicleSim (server)
                                             Session / lobby
                                             GameServer (rooms, cap 255)
```

- `shared/src` — wire + domain types and the `BN01` frame codec (`encodeMessage`,
  `decodeMessage`, `drainFrames`).
- `server/src` — `GameServer` (TCP server, sessions, player slots, tick loop,
  heartbeat handling, broadcast), `Session` (lobby + snapshot generation),
  `VehicleSim` (authoritative vehicle state), `net/ServerNet` (framed TCP server).
- `client/src` — `BeamNgMpMod` (in-game multiplayer mod client: handshake, input
  send, snapshot consume, interpolation, apply), `NetworkClient` (framed TCP client),
  `InterpolationEngine` (remote state interpolation), `GameBridge` (the
  engine↔mod integration contract used by the Lua mod layer).
- `scripts/smoke.ts` — end-to-end smoke test (2 clients, input -> authoritative
  movement -> snapshot -> apply, chat round trip).
- `scripts/smoke-255.ts` — scale smoke test (255 clients join, 256th is rejected).

## Wire protocol (BN01)

Frame layout (mirrors the engine implementation in
`BeamNG.drive/lua/common/tcpServer.lua`):

```
+----------------+----------------+----------------+
| 4 bytes        | 4 bytes        | JSON + "\0"    |
| "BN01"         | LE uint32 len  |               |
+----------------+----------------+----------------+
```

Message commands:

| Direction | `cmd`        | Payload                                    |
|-----------|--------------|--------------------------------------------|
| client -> | `handshake`  | `{ name }`                                 |
| client -> | `input`      | `{ playerId, seq, timestamp, input }`     |
| client -> | `chat`       | `{ playerId, text }`                      |
| client -> | `heartbeat`  | `{ playerId, timestamp }`                |
| server -> | `welcome`    | `{ serverTime, tick, playerId, players, vehicles }` |
| server -> | `snapshot`   | `{ serverTime, tick, players, vehicles }` |
| server -> | `chat`       | `{ playerId, name, text, timestamp }`    |
| server -> | `error`      | `{ message }`                             |

## Running

```bash
cd beamng-drive-multiplayer-mod
npm install
npm run server            # authoritative server on 0.0.0.0:4444 (max 255 players)
npm run client           # in-game mod client (CLI stand-in) --host 127.0.0.1 --port 4444
npm run smoke            # 2-client end-to-end smoke test
npm run smoke-255        # 255-player scale smoke test + overflow rejection
```

## The "up to 255 players" guarantee

- `MAX_PLAYERS = 255` — the session/player-slot cap of the mod.
- Server rejects the join of any client beyond the cap with
  `{ cmd: "error", message: "session_full_max_players_255" }`.
- Player ids / vehicle ids are dense per session (slots `0..254`).

## Integrating into BeamNG.drive

The TypeScript core above is the multiplayer engine of the mod. The in-game side is
wired through the `BeamNgGameBridge` (see `client/src/GameBridge.ts`) implemented by
the game's Lua mod layer:

- poll `getLocalInput()` once per server tick and feed `sendInput()`,
- apply server snapshots to the engine world via `applyVehicleState(vehicleId, state)`,
- react to `onChat` messages,
- run the mod's `start()` once per frame/tick from the Lua mod entry script.

The authoritative simulation itself lives in the engine (`be:physics*`, vehicle
controllers); `server/src/VehicleSim.ts` is the drop-in reference implementation used
by the server to advance state and produce snapshots.
