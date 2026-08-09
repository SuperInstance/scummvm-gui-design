// forgemaster-room-compiler.ts — Compile room JSON → ScummVM scene via Forgemaster

export interface RoomDefinition {
  id: string; title: string; description: string;
  theme: string; ambientLight: string;
  exits: Record<string, { destination: string; locked?: boolean }>;
  objects: Array<{ name: string; description: string }>;
}

export interface CompiledScene {
  roomId: string;
  background: { url: string; palette: string[]; prompt: string };
  walkboxes: Array<{ id: string; polygon: number[][]; zPriority: number }>;
  hotspots: Array<{ id: string; name: string; bbox: number[]; verbs: Record<string, string> }>;
  exits: Array<{ direction: string; target: string; position: { x: number; y: number }; highlighted: boolean }>;
  ambient: { url: string; mood: string };
  compileTime: number;
}

export function compileRoom(room: RoomDefinition): CompiledScene {
  const start = Date.now();
  const PALETTES: Record<string, string[]> = {
    harbor: ["#1a2a3a", "#2a4a6a", "#ffd700", "#8b4513", "#f4e4bc"],
    forge: ["#2a1a0a", "#4a2a0a", "#ff6644", "#880000", "#442200"],
    engine_room: ["#1a1a1a", "#2a2a2a", "#4488ff", "#666666", "#333333"],
    default: ["#0a0a1a", "#1a1a3a", "#ffd700", "#444444", "#222222"],
  };
  const POSITIONS: Record<string, { x: number; y: number }> = {
    north: { x: 160, y: 0 }, south: { x: 160, y: 199 },
    east: { x: 320, y: 100 }, west: { x: 0, y: 100 },
    forward: { x: 160, y: 0 }, aft: { x: 160, y: 199 },
    port: { x: 0, y: 100 }, starboard: { x: 320, y: 100 },
    up: { x: 160, y: 50 }, down: { x: 160, y: 150 },
  };
  const style = "1990s LucasArts adventure game, Monkey Island era, hand-painted pixel art, 256 colors";
  const spacing = 280 / Math.max(room.objects.length, 1);

  return {
    roomId: room.id,
    background: {
      url: `assets/rooms/${room.id}/background.png`,
      palette: PALETTES[room.theme] ?? PALETTES.default,
      prompt: `${room.description} ${style}. Lighting: ${room.ambientLight}.`,
    },
    walkboxes: [{ id: "main_floor", polygon: [[20, 120], [300, 120], [300, 199], [20, 199]], zPriority: 0 }],
    hotspots: room.objects.map((obj, i) => ({
      id: obj.name.toLowerCase().replace(/\s+/g, "_"),
      name: obj.name,
      bbox: [Math.round(20 + i * spacing), 100, Math.round(20 + i * spacing + 40), 140],
      verbs: {
        Look: obj.description,
        Use: `You interact with the ${obj.name}.`,
        Talk: `The ${obj.name} has nothing to say.`,
      },
    })),
    exits: Object.entries(room.exits).map(([direction, exit]) => ({
      direction, target: exit.destination,
      position: POSITIONS[direction] ?? { x: 160, y: 100 },
      highlighted: false,
    })),
    ambient: { url: "", mood: room.theme },
    compileTime: Date.now() - start,
  };
}
