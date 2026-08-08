/**
 * shared-world.ts — The SharedWorldStore
 *
 * The load-bearing implementation of the dual-projection architecture.
 * One canonical world state. Two projections (MUD text + ScummVM scene).
 * A perception deadband between them.
 *
 * Architecture: Casey DiGennaro
 * Document: DUAL-PROJECTION.md
 *
 * ────────────────────────────────────────────────────────────────
 *
 * THE CONTRACT:
 *
 *   1. This class owns the world state. Nobody else does.
 *   2. All mutations go through applyEvent(), which logs + updates state.
 *   3. The MUD projection is pull-based: perceive() returns full state + deltas.
 *   4. The ScummVM projection is push-based: scene deltas via subscribe().
 *   5. Between perception checks, events accumulate in the deadband.
 *   6. The deadband is free. The perception check costs.
 *
 * ────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface WorldState {
  rooms: Record<string, Room>;
  objects: Record<string, WorldObject>;
  agents: Record<string, AgentState>;
  players: Record<string, PlayerState>;
  time: number;
}

export interface Room {
  id: string;
  title: string;
  description: string;
  exits: Record<string, RoomExit>;
  objectIds: string[];
  agentIds: string[];
  theme: string;
  ambientLight: string;
}

export interface RoomExit {
  destination: string;
  locked: boolean;
  lockedMessage?: string;
  keyId?: string;
}

export interface WorldObject {
  id: string;
  name: string;
  roomId: string;
  description: string;
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  flags: {
    portable: boolean;
    open: boolean;
    locked: boolean;
    pushed: boolean;
    talkable: boolean;
    usable: boolean;
    glowing: boolean;
  };
}

export interface AgentState {
  id: string;
  name: string;
  roomId: string;
  mood: string;
  activity: string;
  capabilities: string[];
  policies: Record<string, number>;
  perception: AgentPerception;
}

export interface AgentPerception {
  threshold: number;       // θ — events below this salience are not perceived
  wakeThreshold: number;   // ω — events at/above this interrupt immediately
  lastCheck: number;       // timestamp (ms) of last perception check
}

export interface PlayerState {
  id: string;
  name: string;
  roomId: string;
  inventory: string[];
}

// ═══════════════════════════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════════════════════════

export interface WorldEvent {
  id: string;
  t: number;
  roomId: string;
  actor: string;
  verb: string;
  target: string;
  indirect?: string;
  before: unknown;
  after: unknown;
  salience: number;
  perceivedBy: string[];
}

// ═══════════════════════════════════════════════════════════════
// PROJECTIONS
// ═══════════════════════════════════════════════════════════════

export interface MudRoomProjection {
  title: string;
  description: string;
  exits: string[];
  objects: Array<{
    id: string;
    name: string;
    description: string;
    state: Record<string, unknown>;
  }>;
  npcs: Array<{
    id: string;
    name: string;
    mood: string;
    activity: string;
  }>;
}

export interface MudDelta {
  t: number;
  event: string;
  target: string;
  description: string;
  salience: number;
}

export interface PerceptionCheck {
  agentId: string;
  timestamp: number;
  perceptionLagMs: number;
  room: MudRoomProjection;
  deltas: MudDelta[];
  unperceivedSalience: {
    total: number;
    byRoom: Record<string, number>;
    byObject: Record<string, number>;
  };
}

export interface SceneProjection {
  roomId: string;
  theme: { bg: string; fg: string; accent: string };
  objects: Array<{
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    sprite: string;
    state: Record<string, unknown>;
    glowing: boolean;
  }>;
  characters: Array<{
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    sprite: string;
    mood: string;
  }>;
  exits: Array<{
    direction: string;
    target: string;
    position: { x: number; y: number; z: number };
    highlighted: boolean;
  }>;
  lights: Array<{
    type: string;
    color: string;
    intensity: number;
    position: { x: number; y: number; z: number };
  }>;
  ambient: string;
}

export interface SceneDelta {
  roomId: string;
  type: "object_moved" | "object_state" | "npc_moved" | "npc_state" | "exit_changed" | "light_changed";
  targetId: string;
  before: unknown;
  after: unknown;
  t: number;
}

// ═══════════════════════════════════════════════════════════════
// SALIENCE ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Salience rules — typed, deterministic, no model involvement.
 *
 * The rule list is deliberately small (~12 rules). This is not a limitation;
 * it is the guardrail against the salience-tuning tarpit. Every rule is a
 * hand-written mapping from event type → salience score. No model ever
 * scores salience. That would reintroduce the cost the deadband exists to remove.
 */
const DEFAULT_SALIENCE_RULES: Record<string, number> = {
  // Object events
  object_moved: 0.1,
  object_state: 0.15,
  object_acquired: 0.6,
  object_dropped: 0.5,
  object_destroyed: 0.8,

  // NPC events
  npc_entered: 0.5,
  npc_left: 0.4,
  npc_state: 0.2,
  npc_spoke: 0.7,

  // Room events
  exit_locked: 0.3,
  exit_unlocked: 0.6,
  room_theme_changed: 0.05,

  // Environmental
  light_changed: 0.05,
  ambient_shift: 0.03,
  weather_changed: 0.1,

  // Critical — these always interrupt
  threshold_breached: 0.95,
  alarm_triggered: 1.0,
  system_failure: 1.0,
};

export type SalienceRuleMap = Record<string, number>;

// ═══════════════════════════════════════════════════════════════
// SCENE CALLBACK (for WebSocket push)
// ═══════════════════════════════════════════════════════════════

export type SceneSubscriber = (delta: SceneDelta) => void;

// ═══════════════════════════════════════════════════════════════
// THE SHARED WORLD STORE
// ═══════════════════════════════════════════════════════════════

export class SharedWorldStore {
  private state: WorldState;
  private eventLog: WorldEvent[] = [];
  private salienceRules: SalienceRuleMap;
  private sceneSubscribers: Map<string, Set<SceneSubscriber>> = new Map();
  private eventCounter = 0;

  // GC configuration
  private gcConfig: {
    hourlySalienceFloor: number;
    dailySalienceFloor: number;
    weeklySalienceFloor: number;
    compactionCallback?: (events: WorldEvent[], summary: string) => void;
  };

  constructor(
    initialState: WorldState,
    options?: {
      salienceRules?: Partial<SalienceRuleMap>;
      gcConfig?: Partial<{
        hourlySalienceFloor: number;
        dailySalienceFloor: number;
        weeklySalienceFloor: number;
        compactionCallback: (events: WorldEvent[], summary: string) => void;
      }>;
    }
  ) {
    this.state = structuredClone(initialState);
    this.salienceRules = { ...DEFAULT_SALIENCE_RULES, ...options?.salienceRules };
    this.gcConfig = {
      hourlySalienceFloor: 0.2,
      dailySalienceFloor: 0.5,
      weeklySalienceFloor: 0.8,
      ...options?.gcConfig,
    };
  }

  // ════════════════════════════════════════════════════════════
  // STATE ACCESS — read-only getters
  // ════════════════════════════════════════════════════════════

  getState(): Readonly<WorldState> {
    return this.state;
  }

  getRoom(roomId: string): Room | undefined {
    return this.state.rooms[roomId];
  }

  getObject(objectId: string): WorldObject | undefined {
    return this.state.objects[objectId];
  }

  getAgent(agentId: string): AgentState | undefined {
    return this.state.agents[agentId];
  }

  getEvents(filter?: {
    roomId?: string;
    since?: number;
    minSalience?: number;
    agentId?: string; // if provided, filters to unperceived-by-this-agent
  }): WorldEvent[] {
    let events = this.eventLog;
    if (filter?.roomId) events = events.filter((e) => e.roomId === filter.roomId);
    if (filter?.since) events = events.filter((e) => e.t >= filter.since!);
    if (filter?.minSalience !== undefined)
      events = events.filter((e) => e.salience >= filter.minSalience!);
    if (filter?.agentId)
      events = events.filter((e) => !e.perceivedBy.includes(filter.agentId!));
    return events;
  }

  // ════════════════════════════════════════════════════════════
  // MUTATIONS — the single write path
  // ════════════════════════════════════════════════════════════

  /**
   * Apply a world event: log it, update state, score salience, notify subscribers.
   *
   * This is the ONLY way the world state changes. Every mutation — agent action,
   * human click, cron tick, sensor input — goes through here.
   */
  applyEvent(
    verb: string,
    actor: string,
    target: string,
    mutation: (state: WorldState) => { before: unknown; after: unknown },
    options?: { roomId?: string; indirect?: string; salience?: number }
  ): WorldEvent {
    const roomId = options?.roomId ?? this.inferRoomId(target);
    const salience = options?.salience ?? this.scoreSalience(verb);

    // Snapshot before, apply mutation, capture after
    const { before, after } = mutation(this.state);

    // Create the event
    const event: WorldEvent = {
      id: `evt_${++this.eventCounter}`,
      t: this.state.time,
      roomId,
      actor,
      verb,
      target,
      indirect: options?.indirect,
      before,
      after,
      salience,
      perceivedBy: [],
    };

    // Log it
    this.eventLog.push(event);

    // Push scene delta to ScummVM subscribers
    this.emitSceneDelta(roomId, verb, target, before, after);

    // Check for interrupts — does this wake any agents?
    this.checkInterrupts(event);

    return event;
  }

  /**
   * Convenience: move an object to a new position in the same or different room.
   */
  moveObject(
    objectId: string,
    newPosition: { x: number; y: number; z: number },
    newRoomId?: string,
    actor = "system"
  ): WorldEvent {
    return this.applyEvent(
      "object_moved",
      actor,
      objectId,
      (state) => {
        const obj = state.objects[objectId];
        if (!obj) throw new Error(`Object not found: ${objectId}`);
        const before = { position: { ...obj.position }, roomId: obj.roomId };

        obj.position = { ...newPosition };
        if (newRoomId && newRoomId !== obj.roomId) {
          // Remove from old room
          const oldRoom = state.rooms[obj.roomId];
          if (oldRoom) {
            oldRoom.objectIds = oldRoom.objectIds.filter((id) => id !== objectId);
          }
          obj.roomId = newRoomId;
          // Add to new room
          const newRoom = state.rooms[newRoomId];
          if (newRoom && !newRoom.objectIds.includes(objectId)) {
            newRoom.objectIds.push(objectId);
          }
        }

        return { before, after: { position: { ...obj.position }, roomId: obj.roomId } };
      },
      { roomId: newRoomId ?? this.getObject(objectId)?.roomId }
    );
  }

  /**
   * Convenience: change an object's state (e.g., temperature, LED color, open/closed).
   */
  setObjectState(
    objectId: string,
    stateChange: Record<string, unknown>,
    actor = "system",
    salienceOverride?: number
  ): WorldEvent {
    return this.applyEvent(
      "object_state",
      actor,
      objectId,
      (state) => {
        const obj = state.objects[objectId];
        if (!obj) throw new Error(`Object not found: ${objectId}`);
        const before = { ...obj.state };
        obj.state = { ...obj.state, ...stateChange };
        return { before, after: { ...obj.state } };
      },
      { roomId: this.getObject(objectId)?.roomId, salience: salienceOverride }
    );
  }

  /**
   * Convenience: move an NPC/agent to a different room.
   */
  moveAgent(agentId: string, newRoomId: string, activity?: string): WorldEvent {
    return this.applyEvent(
      "npc_moved",
      agentId,
      agentId,
      (state) => {
        const agent = state.agents[agentId];
        if (!agent) throw new Error(`Agent not found: ${agentId}`);
        const before = { roomId: agent.roomId, activity: agent.activity };

        // Remove from old room
        const oldRoom = state.rooms[agent.roomId];
        if (oldRoom) {
          oldRoom.agentIds = oldRoom.agentIds.filter((id) => id !== agentId);
        }
        agent.roomId = newRoomId;
        if (activity) agent.activity = activity;
        // Add to new room
        const newRoom = state.rooms[newRoomId];
        if (newRoom && !newRoom.agentIds.includes(agentId)) {
          newRoom.agentIds.push(agentId);
        }

        return { before, after: { roomId: agent.roomId, activity: agent.activity } };
      },
      { roomId: newRoomId }
    );
  }

  // ════════════════════════════════════════════════════════════
  // MUD PROJECTION — pull-based perception checks
  // ════════════════════════════════════════════════════════════

  /**
   * The perception check.
   *
   * Returns the full current room state plus all accumulated deltas since the
   * agent's last check. Marks all returned events as perceived by this agent.
   *
   * This is the agent's ONLY way to see the world. The response is what goes
   * into the agent's context window. Nothing else.
   */
  perceive(
    agentId: string,
    options?: { roomId?: string; since?: number; detail?: "full" | "summary" | "deltas_only" }
  ): PerceptionCheck {
    const agent = this.state.agents[agentId];
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const roomId = options?.roomId ?? agent.roomId;
    const since = options?.since ?? agent.perception.lastCheck;
    const detail = options?.detail ?? "full";
    const now = this.state.time;

    // Get unperceived deltas since last check
    const allDeltas = this.eventLog.filter(
      (e) =>
        e.t > since &&
        e.roomId === roomId &&
        !e.perceivedBy.includes(agentId)
    );

    // Format deltas for MUD text
    const mudDeltas: MudDelta[] = allDeltas.map((e) => ({
      t: e.t,
      event: e.verb,
      target: e.target,
      description: this.describeEvent(e),
      salience: e.salience,
    }));

    // Mark as perceived
    for (const e of allDeltas) {
      e.perceivedBy.push(agentId);
    }

    // Build room projection (unless deltas-only)
    const room = detail === "deltas_only" ? this.emptyRoomProjection() : this.projectRoomMud(roomId);

    // Calculate unperceived salience (what's still in the deadband after this check)
    const unperceivedSalience = this.calculateUnperceivedSalience(agentId, since);

    // Update agent's lastCheck
    agent.perception.lastCheck = now;

    return {
      agentId,
      timestamp: now,
      perceptionLagMs: now - since,
      room,
      deltas: detail === "summary" ? this.summarizeDeltas(mudDeltas) : mudDeltas,
      unperceivedSalience,
    };
  }

  /**
   * Render a room as MUD text — full state, all objects, all NPCs.
   *
   * This is what the agent sees when it looks at a room.
   * Every object the world contains, rendered as structured text.
   */
  projectMud(roomId: string): string {
    const room = this.state.rooms[roomId];
    if (!room) return `Room not found: ${roomId}`;

    const lines: string[] = [];
    lines.push(`=== ${room.title} ===`);
    lines.push(room.description);
    lines.push("");

    // Exits
    lines.push(`Exits: ${Object.keys(room.exits).join(", ")}`);

    // Objects
    const objects = room.objectIds.map((id) => this.state.objects[id]).filter(Boolean);
    if (objects.length > 0) {
      lines.push(`Objects: ${objects.map((o) => o.name).join(", ")}`);
      for (const obj of objects) {
        lines.push(`  ${obj.name}: ${obj.description}`);
        const stateKeys = Object.keys(obj.state);
        if (stateKeys.length > 0) {
          lines.push(`    State: ${stateKeys.map((k) => `${k}=${JSON.stringify(obj.state[k])}`).join(", ")}`);
        }
      }
    } else {
      lines.push("Objects: none");
    }

    // NPCs
    const npcs = room.agentIds.map((id) => this.state.agents[id]).filter(Boolean);
    if (npcs.length > 0) {
      lines.push("");
      for (const npc of npcs) {
        lines.push(`"${npc.activity}" — ${npc.name} (${npc.mood})`);
      }
    }

    return lines.join("\n");
  }

  // ════════════════════════════════════════════════════════════
  // SCUMMVM PROJECTION — push-based scene deltas
  // ════════════════════════════════════════════════════════════

  /**
   * Render a room as a ScummVM scene — full snapshot for initial load.
   */
  projectScene(roomId: string): SceneProjection {
    const room = this.state.rooms[roomId];
    if (!room) throw new Error(`Room not found: ${roomId}`);

    const theme = this.getTheme(room.theme);

    return {
      roomId,
      theme,
      objects: room.objectIds
        .map((id) => this.state.objects[id])
        .filter(Boolean)
        .map((obj) => ({
          id: obj.id,
          name: obj.name,
          position: { ...obj.position },
          sprite: this.inferSprite(obj),
          state: { ...obj.state },
          glowing: obj.flags.glowing,
        })),
      characters: room.agentIds
        .map((id) => this.state.agents[id])
        .filter(Boolean)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          position: { x: 0, y: 0, z: 0 }, // agents don't have explicit positions in this model
          sprite: this.inferAgentSprite(agent),
          mood: agent.mood,
        })),
      exits: Object.entries(room.exits).map(([direction, exit]) => ({
        direction,
        target: exit.destination,
        position: this.inferExitPosition(direction),
        highlighted: false,
      })),
      lights: [
        { type: "ambient", color: room.ambientLight, intensity: 0.4, position: { x: 0, y: 6, z: 0 } },
        { type: "point", color: theme.accent, intensity: 0.8, position: { x: 0, y: 6, z: 0 } },
      ],
      ambient: room.ambientLight,
    };
  }

  /**
   * Subscribe to scene deltas for a room.
   * Returns an unsubscribe function.
   *
   * This is the WebSocket bridge — the ScummVM client subscribes on connect
   * and receives every state change as it happens, for free.
   */
  subscribe(roomId: string, callback: SceneSubscriber): () => void {
    if (!this.sceneSubscribers.has(roomId)) {
      this.sceneSubscribers.set(roomId, new Set());
    }
    this.sceneSubscribers.get(roomId)!.add(callback);
    return () => {
      this.sceneSubscribers.get(roomId)?.delete(callback);
    };
  }

  // ════════════════════════════════════════════════════════════
  // DEADBAND MANAGEMENT
  // ════════════════════════════════════════════════════════════

  /**
   * Get the accumulated unperceived salience for an agent.
   *
   * This is the integral term — the sum of everything the agent hasn't seen.
   * When this crosses the agent's wake threshold, the agent is interrupted
   * even though no single event would have triggered it.
   */
  getDeadbandPressure(agentId: string): {
    total: number;
    byRoom: Record<string, number>;
    byObject: Record<string, number>;
  } {
    const agent = this.state.agents[agentId];
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    return this.calculateUnperceivedSalience(agentId, agent.perception.lastCheck);
  }

  /**
   * Advance the simulation clock. Triggers GC and integral-term checks.
   */
  tick(deltaMs: number): void {
    this.state.time += deltaMs;

    // Run GC
    this.runGC();

    // Check integral-term interrupts for all agents
    for (const agentId of Object.keys(this.state.agents)) {
      const pressure = this.getDeadbandPressure(agentId);
      if (pressure.total >= this.state.agents[agentId].perception.wakeThreshold) {
        // In a real implementation, this would push to the agent's inbox
        this.onInterrupt?.(agentId, pressure);
      }
    }
  }

  /** Optional interrupt handler — set by the host harness. */
  onInterrupt?: (agentId: string, pressure: { total: number; byRoom: Record<string, number>; byObject: Record<string, number> }) => void;

  /**
   * Configure an agent's perception parameters.
   */
  setAgentPerception(agentId: string, config: Partial<AgentPerception>): void {
    const agent = this.state.agents[agentId];
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    agent.perception = { ...agent.perception, ...config };
  }

  // ════════════════════════════════════════════════════════════
  // GARBAGE COLLECTION — the world forgets on purpose
  // ════════════════════════════════════════════════════════════

  /**
   * Run the organic GC pass.
   *
   * Resolution tiers:
   *   < 1 hour  — keep everything
   *   < 1 day   — keep salience >= hourlySalienceFloor
   *   < 1 week  — keep salience >= dailySalienceFloor, drop deltas
   *   older     — keep salience >= weeklySalienceFloor, prose summary only
   *
   * Also collects events that all agents have perceived and none have
   * re-read recently (by-agent-since-accessed GC).
   */
  runGC(): void {
    const now = this.state.time;
    const HOUR = 3600_000;
    const DAY = 86_400_000;
    const WEEK = 604_800_000;

    const keep: WorldEvent[] = [];
    let compactedCount = 0;

    for (const event of this.eventLog) {
      const age = now - event.t;
      const maxSalience = this.salienceRules[event.verb] ?? 0.1;

      if (age < HOUR) {
        // Keep everything from the last hour
        keep.push(event);
      } else if (age < DAY) {
        // Downsample: keep events above the hourly floor
        if (event.salience >= this.gcConfig.hourlySalienceFloor) {
          keep.push(event);
        } else {
          compactedCount++;
        }
      } else if (age < WEEK) {
        // Keep salient events, drop detail
        if (event.salience >= this.gcConfig.dailySalienceFloor) {
          // Strip before/after detail, keep endpoints
          keep.push({ ...event, before: undefined, after: undefined });
        } else {
          compactedCount++;
        }
      } else {
        // Old — only keep the most salient, as summary
        if (event.salience >= this.gcConfig.weeklySalienceFloor) {
          keep.push({ ...event, before: undefined, after: undefined });
        } else {
          compactedCount++;
        }
      }
    }

    // If we compacted anything and have a callback, summarize
    if (compactedCount > 0 && this.gcConfig.compactionCallback) {
      const summary = `${compactedCount} events compacted by GC at ${new Date(now).toISOString()}`;
      this.gcConfig.compactionCallback(
        this.eventLog.filter((e) => !keep.includes(e)),
        summary
      );
    }

    this.eventLog = keep;
  }

  // ════════════════════════════════════════════════════════════
  // INVARIANT TESTING
  // ════════════════════════════════════════════════════════════

  /**
   * Property test: do the MUD and Scene projections agree on the object set?
   *
   * This is THE invariant. If it breaks, the human and agent are in different worlds.
   * Run this on every state transition in tests.
   */
  projectionsAgree(roomId: string): { pass: boolean; mudObjects: string[]; sceneObjects: string[]; diff: string[] } {
    const room = this.state.rooms[roomId];
    if (!room) return { pass: false, mudObjects: [], sceneObjects: [], diff: [`Room not found: ${roomId}`] };

    // MUD projection: all objects in the room
    const mudProjection = this.projectRoomMud(roomId);
    const mudObjects = mudProjection.objects.map((o) => o.id).sort();

    // Scene projection: all objects in the room
    const sceneProjection = this.projectScene(roomId);
    const sceneObjects = sceneProjection.objects.map((o) => o.id).sort();

    // They must be identical
    const diff = [
      ...mudObjects.filter((id) => !sceneObjects.includes(id)).map((id) => `mud_only: ${id}`),
      ...sceneObjects.filter((id) => !mudObjects.includes(id)).map((id) => `scene_only: ${id}`),
    ];

    return {
      pass: diff.length === 0,
      mudObjects,
      sceneObjects,
      diff,
    };
  }

  // ════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════

  private scoreSalience(verb: string): number {
    return this.salienceRules[verb] ?? 0.1;
  }

  private inferRoomId(target: string): string {
    // Check if target is an object
    const obj = this.state.objects[target];
    if (obj) return obj.roomId;
    // Check if target is an agent
    const agent = this.state.agents[target];
    if (agent) return agent.roomId;
    // Default to first room
    return Object.keys(this.state.rooms)[0] ?? "unknown";
  }

  private describeEvent(event: WorldEvent): string {
    switch (event.verb) {
      case "object_moved":
        return `${event.target} moved`;
      case "object_state":
        return `${event.target} state changed: ${JSON.stringify(event.after)}`;
      case "npc_moved":
        return `${event.target} entered ${event.roomId}`;
      case "npc_spoke":
        return `${event.target} said something`;
      case "exit_locked":
        return `Exit ${event.target} locked`;
      case "exit_unlocked":
        return `Exit ${event.target} unlocked`;
      case "threshold_breached":
        return `${event.target} threshold breached: ${JSON.stringify(event.after)}`;
      case "alarm_triggered":
        return `ALARM: ${event.target}`;
      default:
        return `${event.verb}: ${event.target}`;
    }
  }

  private projectRoomMud(roomId: string): MudRoomProjection {
    const room = this.state.rooms[roomId];
    if (!room) {
      return { title: "Unknown", description: "", exits: [], objects: [], npcs: [] };
    }

    return {
      title: room.title,
      description: room.description,
      exits: Object.keys(room.exits),
      objects: room.objectIds
        .map((id) => this.state.objects[id])
        .filter(Boolean)
        .map((obj) => ({
          id: obj.id,
          name: obj.name,
          description: obj.description,
          state: { ...obj.state },
        })),
      npcs: room.agentIds
        .map((id) => this.state.agents[id])
        .filter(Boolean)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          mood: agent.mood,
          activity: agent.activity,
        })),
    };
  }

  private emptyRoomProjection(): MudRoomProjection {
    return { title: "", description: "", exits: [], objects: [], npcs: [] };
  }

  private summarizeDeltas(deltas: MudDelta[]): MudDelta[] {
    // Group by target and summarize
    const byTarget = new Map<string, MudDelta[]>();
    for (const d of deltas) {
      if (!byTarget.has(d.target)) byTarget.set(d.target, []);
      byTarget.get(d.target)!.push(d);
    }
    const summary: MudDelta[] = [];
    for (const [target, events] of byTarget) {
      const maxSalience = Math.max(...events.map((e) => e.salience));
      summary.push({
        t: events[events.length - 1].t,
        event: "summary",
        target,
        description: `${events.length} changes to ${target}`,
        salience: maxSalience,
      });
    }
    return summary;
  }

  private calculateUnperceivedSalience(
    agentId: string,
    since: number
  ): { total: number; byRoom: Record<string, number>; byObject: Record<string, number> } {
    const unperceived = this.eventLog.filter(
      (e) => e.t > since && !e.perceivedBy.includes(agentId)
    );

    let total = 0;
    const byRoom: Record<string, number> = {};
    const byObject: Record<string, number> = {};

    for (const e of unperceived) {
      total += e.salience;
      byRoom[e.roomId] = (byRoom[e.roomId] ?? 0) + e.salience;
      byObject[e.target] = (byObject[e.target] ?? 0) + e.salience;
    }

    return { total, byRoom, byObject };
  }

  private emitSceneDelta(
    roomId: string,
    verb: string,
    targetId: string,
    before: unknown,
    after: unknown
  ): void {
    const subs = this.sceneSubscribers.get(roomId);
    if (!subs || subs.size === 0) return;

    const delta: SceneDelta = {
      roomId,
      type: this.verbToDeltaType(verb),
      targetId,
      before,
      after,
      t: this.state.time,
    };

    for (const callback of subs) {
      callback(delta);
    }
  }

  private verbToDeltaType(verb: string): SceneDelta["type"] {
    switch (verb) {
      case "object_moved": return "object_moved";
      case "object_state": return "object_state";
      case "npc_moved": return "npc_moved";
      case "npc_state": return "npc_state";
      case "exit_locked":
      case "exit_unlocked": return "exit_changed";
      case "light_changed": return "light_changed";
      default: return "object_state";
    }
  }

  private checkInterrupts(event: WorldEvent): void {
    for (const agentId of Object.keys(this.state.agents)) {
      const agent = this.state.agents[agentId];
      if (event.salience >= agent.perception.wakeThreshold) {
        this.onInterrupt?.(agentId, { total: event.salience, byRoom: { [event.roomId]: event.salience }, byObject: { [event.target]: event.salience } });
      }
    }
  }

  private getTheme(themeKey: string): { bg: string; fg: string; accent: string } {
    const THEMES: Record<string, { bg: string; fg: string; accent: string }> = {
      harbor: { bg: "#1a2a3a", fg: "#2a4a6a", accent: "#ffd700" },
      forge: { bg: "#2a1a0a", fg: "#4a2a0a", accent: "#ff6644" },
      dojo: { bg: "#1a1a2a", fg: "#2a2a4a", accent: "#44ff88" },
      engine_room: { bg: "#1a1a1a", fg: "#2a2a2a", accent: "#4488ff" },
      wheelhouse: { bg: "#0a1a2a", fg: "#1a3a4a", accent: "#44ffff" },
      default: { bg: "#0a0a1a", fg: "#1a1a3a", accent: "#ffd700" },
    };
    return THEMES[themeKey] ?? THEMES.default;
  }

  private inferSprite(obj: WorldObject): string {
    if (obj.flags.glowing) return "glow_object";
    if (obj.state.shape) return `${obj.state.shape}_object`;
    return "default_object";
  }

  private inferAgentSprite(agent: AgentState): string {
    return `${agent.mood}_portrait`;
  }

  private inferExitPosition(direction: string): { x: number; y: number; z: number } {
    const POSITIONS: Record<string, { x: number; y: number; z: number }> = {
      north: { x: 0, y: 2, z: -9 },
      south: { x: 0, y: 2, z: 9 },
      east: { x: 9, y: 2, z: 0 },
      west: { x: -9, y: 2, z: 0 },
      forward: { x: 0, y: 2, z: -9 },
      aft: { x: 0, y: 2, z: 9 },
      port: { x: -9, y: 2, z: 0 },
      starboard: { x: 9, y: 2, z: 0 },
      up: { x: 0, y: 6, z: 0 },
      down: { x: 0, y: 0, z: 0 },
    };
    return POSITIONS[direction] ?? { x: 0, y: 2, z: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY: create a world from MUD room definitions
// ═══════════════════════════════════════════════════════════════

/**
 * Create a SharedWorldStore from simple room/object/agent definitions.
 *
 * Example:
 *
 *   const world = createWorld({
 *     rooms: {
 *       bar_rail: {
 *         title: "The Bar Rail",
 *         description: "A worn brass bar. Bottles catch the light.",
 *         exits: { aft: { destination: "corner_booth", locked: false } },
 *       },
 *     },
 *     objects: {
 *       bar_counter: { room: "bar_rail", name: "Bar Counter", description: "Worn smooth by elbows." },
 *     },
 *     agents: {
 *       riker: { room: "bar_rail", name: "Riker", mood: "working", activity: "polishing a glass" },
 *     },
 *   });
 */
export function createWorld(def: {
  rooms: Record<string, {
    title: string;
    description: string;
    exits?: Record<string, { destination: string; locked?: boolean }>;
    theme?: string;
    ambientLight?: string;
  }>;
  objects?: Record<string, {
    room: string;
    name: string;
    description: string;
    position?: { x: number; y: number; z: number };
    state?: Record<string, unknown>;
    flags?: Partial<WorldObject["flags"]>;
  }>;
  agents?: Record<string, {
    room: string;
    name: string;
    mood?: string;
    activity?: string;
    capabilities?: string[];
    policies?: Record<string, number>;
    perception?: Partial<AgentPerception>;
  }>;
  players?: Record<string, {
    room: string;
    name: string;
    inventory?: string[];
  }>;
  startTime?: number;
}): SharedWorldStore {
  const state: WorldState = {
    rooms: {},
    objects: {},
    agents: {},
    players: {},
    time: def.startTime ?? Date.now(),
  };

  // Build rooms
  for (const [id, roomDef] of Object.entries(def.rooms)) {
    state.rooms[id] = {
      id,
      title: roomDef.title,
      description: roomDef.description,
      exits: Object.fromEntries(
        Object.entries(roomDef.exits ?? {}).map(([dir, exit]) => [
          dir,
          { destination: exit.destination, locked: exit.locked ?? false },
        ])
      ),
      objectIds: [],
      agentIds: [],
      theme: roomDef.theme ?? "default",
      ambientLight: roomDef.ambientLight ?? "#404060",
    };
  }

  // Build objects
  for (const [id, objDef] of Object.entries(def.objects ?? {})) {
    state.objects[id] = {
      id,
      name: objDef.name,
      roomId: objDef.room,
      description: objDef.description,
      position: objDef.position ?? { x: 0, y: 0, z: 0 },
      state: objDef.state ?? {},
      flags: {
        portable: false,
        open: false,
        locked: false,
        pushed: false,
        talkable: false,
        usable: true,
        glowing: false,
        ...objDef.flags,
      },
    };
    if (state.rooms[objDef.room]) {
      state.rooms[objDef.room].objectIds.push(id);
    }
  }

  // Build agents
  for (const [id, agentDef] of Object.entries(def.agents ?? {})) {
    state.agents[id] = {
      id,
      name: agentDef.name,
      roomId: agentDef.room,
      mood: agentDef.mood ?? "idle",
      activity: agentDef.activity ?? "",
      capabilities: agentDef.capabilities ?? [],
      policies: agentDef.policies ?? {},
      perception: {
        threshold: 0.3,
        wakeThreshold: 0.8,
        lastCheck: state.time,
        ...agentDef.perception,
      },
    };
    if (state.rooms[agentDef.room]) {
      state.rooms[agentDef.room].agentIds.push(id);
    }
  }

  // Build players
  for (const [id, playerDef] of Object.entries(def.players ?? {})) {
    state.players[id] = {
      id,
      name: playerDef.name,
      roomId: playerDef.room,
      inventory: playerDef.inventory ?? [],
    };
  }

  return new SharedWorldStore(state);
}
