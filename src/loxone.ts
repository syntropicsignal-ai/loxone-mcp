const SERIAL = process.env.LOXONE_SERIAL!;
const USER   = process.env.LOXONE_USER!;
const PASS   = process.env.LOXONE_PASS!;

if (!SERIAL || !USER || !PASS) {
  console.error('Missing required env vars: LOXONE_SERIAL, LOXONE_USER, LOXONE_PASS');
  process.exit(1);
}

const AUTH_HEADER = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// Loxone Cloud Connect: the cloud proxy issues a fresh tunnel port per-request.
// We follow the redirect manually on every call so we always get the current port.
async function loxFetch(path: string): Promise<any> {
  const cloudUrl = `https://dns.loxonecloud.com/${SERIAL}${path}`;

  // Step 1: hit cloud DNS with no-auth to get the redirect Location
  const probe = await fetch(cloudUrl, { redirect: 'manual' });
  const location = probe.headers.get('location');

  let targetUrl: string;
  if (location) {
    // Redirect to direct miniserver URL — re-issue with auth
    targetUrl = location;
    console.log(`Loxone tunnel → ${new URL(location).host}`);
  } else if (probe.ok) {
    // No redirect — cloud proxy answered directly (shouldn't happen but handle it)
    targetUrl = cloudUrl;
  } else {
    throw new Error(`Loxone Cloud probe failed: HTTP ${probe.status} for ${path}`);
  }

  const res = await fetch(targetUrl, { headers: { Authorization: AUTH_HEADER } });
  if (!res.ok) throw new Error(`Loxone HTTP ${res.status} for ${path}`);
  return res.json();
}

// --- Structure cache (refresh every 60s) ---

export interface Control {
  name: string;
  type: string;
  uuidAction: string;
  room: string;
  states: Record<string, string>; // stateName → stateUuid
  subControls?: Record<string, Control>;
}

export interface Room {
  name: string;
  controls: Control[];
}

let cachedStructure: any = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function getStructure(): Promise<any> {
  if (cachedStructure && Date.now() - cacheTime < CACHE_TTL) return cachedStructure;
  cachedStructure = await loxFetch('/data/LoxAPP3.json');
  cacheTime = Date.now();
  return cachedStructure;
}

function resolveControl(raw: any, rooms: Record<string, any>): Control {
  return {
    name: raw.name,
    type: raw.type,
    uuidAction: raw.uuidAction,
    room: rooms[raw.room]?.name ?? 'Unknown',
    states: raw.states ?? {},
  };
}

// --- Public API ---

export async function listRooms(): Promise<Room[]> {
  const s = await getStructure();
  const roomMap: Record<string, Room> = {};

  for (const [uuid, r] of Object.entries<any>(s.rooms)) {
    roomMap[uuid] = { name: r.name, controls: [] };
  }

  for (const raw of Object.values<any>(s.controls)) {
    if (roomMap[raw.room]) {
      roomMap[raw.room].controls.push(resolveControl(raw, s.rooms));
    }
  }

  return Object.values(roomMap).filter(r => r.controls.length > 0);
}

export async function listControls(): Promise<Control[]> {
  const s = await getStructure();
  return Object.values<any>(s.controls).map(raw => resolveControl(raw, s.rooms));
}

export async function findControls(keyword: string): Promise<Control[]> {
  const kw = keyword.toLowerCase();
  const all = await listControls();
  return all.filter(c =>
    c.name.toLowerCase().includes(kw) ||
    c.room.toLowerCase().includes(kw) ||
    c.type.toLowerCase().includes(kw)
  );
}

export async function sendCommand(uuidAction: string, command: string): Promise<any> {
  const data = await loxFetch(`/jdev/sps/io/${uuidAction}/${command}`);
  return data.LL;
}

export async function getStatus(roomFilter?: string): Promise<Array<{
  control: string;
  room: string;
  type: string;
  uuid: string;
  states: Record<string, number | string>;
}>> {
  const [statusData, s] = await Promise.all([
    loxFetch('/jdev/sps/status'),
    getStructure(),
  ]);

  // Loxone wraps the state map in LL.value
  const stateValues: Record<string, number | string> = statusData?.LL?.value ?? statusData ?? {};

  const results = [];
  for (const raw of Object.values<any>(s.controls)) {
    const roomName: string = s.rooms[raw.room]?.name ?? 'Unknown';
    if (roomFilter && !roomName.toLowerCase().includes(roomFilter.toLowerCase())) continue;

    const states: Record<string, number | string> = {};
    for (const [stateName, stateUuid] of Object.entries<any>(raw.states ?? {})) {
      const val = stateValues[stateUuid as string];
      if (val !== undefined) states[stateName] = val;
    }

    if (Object.keys(states).length > 0) {
      results.push({ control: raw.name, room: roomName, type: raw.type, uuid: raw.uuidAction, states });
    }
  }

  return results;
}
