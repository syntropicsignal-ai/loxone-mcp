#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as loxone from './loxone.js';

const PORT = parseInt(process.env.PORT ?? '3000');
const API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
  console.error('MCP_API_KEY is not set');
  process.exit(1);
}

// Single shared MCP server instance (stateless transport — one per request)
const server = new McpServer({ name: 'loxone-mcp', version: '1.0.0' });

// ─── Tools ───

server.tool(
  'list_rooms',
  'List all rooms with their controls (name, type, UUID). Good starting point to explore the smart home.',
  {},
  async () => {
    const rooms = await loxone.listRooms();
    return { content: [{ type: 'text', text: JSON.stringify(rooms, null, 2) }] };
  }
);

server.tool(
  'list_controls',
  'List all controls across all rooms with name, type, room, and UUID.',
  {},
  async () => {
    const controls = await loxone.listControls();
    return { content: [{ type: 'text', text: JSON.stringify(controls, null, 2) }] };
  }
);

server.tool(
  'find_control',
  'Search for controls by keyword matching name, room, or type. Use this before control_device to find the UUID.',
  { keyword: z.string().describe('Search keyword — matches control name, room name, or control type') },
  async ({ keyword }) => {
    const results = await loxone.findControls(keyword);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No controls found matching "${keyword}"` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  'get_status',
  'Get current state values of all controls (or filtered by room). Returns live sensor/actuator values.',
  { room: z.string().optional().describe('Optional room name filter') },
  async ({ room }) => {
    const status = await loxone.getStatus(room);
    if (status.length === 0) {
      return { content: [{ type: 'text', text: 'No status data available' + (room ? ` for room "${room}"` : '') }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  }
);

server.tool(
  'control_device',
  [
    'Send a command to a Loxone device. Use find_control first to get the uuidAction.',
    'Command examples by type:',
    '  Switch/Light: On, Off, pulse',
    '  Dimmer: On, Off, value/50 (set to 50%), Up, Down',
    '  Jalousie (blinds): Up, Down, Stop, FullUp, FullDown, shade',
    '  Gate: Open, Close, Stop',
    '  HVAC (IRoomControllerV2): setComfortTemperature/21.5, override/1/22/3600',
    '  AudioZone: play, pause, stop, volume/50',
  ].join('\n'),
  {
    uuid: z.string().describe('uuidAction of the control (from find_control or list_controls)'),
    command: z.string().describe('Command string to send'),
  },
  async ({ uuid, command }) => {
    const result = await loxone.sendCommand(uuid, command);
    const ok = result?.Code === '200' || result?.Code === 200;
    return {
      content: [{
        type: 'text',
        text: ok
          ? `Command sent successfully.\n${JSON.stringify(result, null, 2)}`
          : `Command may have failed.\n${JSON.stringify(result, null, 2)}`,
      }],
    };
  }
);

// ─── Express app ───

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Single stateless MCP endpoint
app.post('/mcp', async (req, res) => {
  const queryKey = req.query.key as string | undefined;
  const headerKey = req.headers.authorization?.replace('Bearer ', '');
  if (queryKey !== API_KEY && headerKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const method = Array.isArray(req.body) ? req.body.map((m: any) => m.method).join(',') : req.body?.method;
  console.log(`POST /mcp rpc=${method ?? '-'}`);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Loxone MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
