# loxone-mcp

[![CI](https://github.com/syntropicsignal-ai/loxone-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/syntropicsignal-ai/loxone-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@syntropic/loxone-mcp.svg)](https://www.npmjs.com/package/@syntropic/loxone-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@syntropic/loxone-mcp.svg)](https://www.npmjs.com/package/@syntropic/loxone-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An MCP (Model Context Protocol) server that connects AI assistants to a Loxone Miniserver smart home system.

Lets Claude (or any MCP-compatible AI) list rooms, query live sensor/actuator states, search devices, and send commands.

## Features

- **`list_rooms`** — all rooms with their controls
- **`list_controls`** — all controls (name, type, UUID, room)
- **`find_control`** — keyword search across name/room/type
- **`get_status`** — live sensor and actuator values (optional room filter)
- **`control_device`** — send commands (On/Off, dimmer %, blinds, HVAC, audio)

## Requirements

- Loxone Miniserver with Cloud Connect enabled
- Node.js 20+ (or Docker)

## Installation

### npm

```bash
npm install -g @syntropic/loxone-mcp
```

Then run with environment variables set:

```bash
LOXONE_SERIAL=XXXXXXXXXXXX \
LOXONE_USER=admin \
LOXONE_PASS=yourpass \
MCP_API_KEY=$(openssl rand -hex 32) \
loxone-mcp
```

### From source

```bash
git clone https://github.com/syntropicsignal-ai/loxone-mcp.git
cd loxone-mcp
cp .env.example .env
# edit .env with your Miniserver serial, credentials, and a random API key
npm install
npm run build
npm start
```

The server listens on `http://localhost:3000`. The MCP endpoint is `POST /mcp`.

### Docker

```bash
docker build -t loxone-mcp .
docker run -p 3000:3000 --env-file .env loxone-mcp
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `LOXONE_SERIAL` | Yes | 12-char Miniserver serial (from Loxone Config → Miniserver) |
| `LOXONE_USER` | Yes | Miniserver username |
| `LOXONE_PASS` | Yes | Miniserver password |
| `MCP_API_KEY` | Yes | Bearer token for MCP endpoint auth (`openssl rand -hex 32`) |
| `PORT` | No | HTTP port (default: 3000) |

## Connecting to Claude

Add to your Claude MCP configuration:

```json
{
  "mcpServers": {
    "loxone": {
      "url": "https://your-server/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

## Supported commands by device type

| Type | Commands |
|------|----------|
| Switch / Light | `On`, `Off`, `pulse` |
| Dimmer | `On`, `Off`, `value/50` (0–100%), `Up`, `Down` |
| Jalousie (blinds) | `Up`, `Down`, `Stop`, `FullUp`, `FullDown`, `shade` |
| Gate | `Open`, `Close`, `Stop` |
| HVAC (`IRoomControllerV2`) | `setComfortTemperature/21.5`, `override/1/22/3600` |
| AudioZone | `play`, `pause`, `stop`, `volume/50` |

## Architecture

- Stateless HTTP server — each POST /mcp creates a fresh transport (no session state)
- Loxone Cloud Connect: resolves current tunnel URL via `dns.loxonecloud.com` on every request
- Structure cache: Loxone app structure (`LoxAPP3.json`) cached for 60 seconds

## License

MIT
