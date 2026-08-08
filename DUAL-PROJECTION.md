# The Dual-Projection Architecture

**One world. Two windows. A door between them.**

**Status:** load-bearing design document, 2026-08-08
**Architecture by:** Casey DiGennaro
**Grounded in:** `mud2scummvm/src/lib.rs` (parser + scene composer), `terrain/terrain_core.py` (MUD→scene compiler), `the-tap/` (D1, Durable Objects, WebSocket), `study-pincher/` (reflex/cortex split), `compaction-teacher/` (forgetting discipline)

---

## 0. The Thesis

There is one world state. It is projected twice, simultaneously, from a single authoritative source:

| | **MUD terminal** | **ScummVM scene** |
|---|---|---|
| Audience | agent-first | human-first |
| Medium | text | pixels |
| Cadence | **pull** — on demand | **push** — continuous |
| Fidelity per read | total (full state) | partial (what's on screen) |
| Cost per tick | one model call | zero |
| Memory | perfect recall of what was read | lossy, but continuous |

Neither projection is a rendering of the other. Both are renderings of the **world state**, which is neither of them. That distinction is the whole architecture. The moment the ScummVM view becomes "a picture of the MUD," we've built a skin. The moment the MUD becomes "a text dump of the ScummVM," we've built a logger. Neither can be the subordinate; both are sense organs on the same body.

**The load-bearing consequence:** because the two projections have different cadences, the agent and the human do not know the same things at the same time. That gap is not a bug to be engineered away. It is the mechanic the entire system is built around.

---

## 1. The Shared World State Model

### One source of truth

The backend is a **host harness** — not a game, not a renderer, not a chat server. It holds one authoritative world state and serves two projections from it. Every mutation flows through the host. Every read pulls from the host. The host is the world; the projections are windows.

```
                    ┌──────────────────────────────────────────┐
                    │           WORLD STATE (canonical)         │
                    │   rooms · objects · agents · players      │
                    │   ──────────────────────────────────────  │
                    │         EVENT LOG (append-only)           │
                    │   { t, actor, verb, target, indirect,     │
                    │     before, after, salience, perceived_by }│
                    └───────┬──────────────────────┬───────────┘
                            │                      │
              projection A  │                      │  projection B
                  (pull)    │                      │   (push)
                            ▼                      ▼
                 ┌────────────────┐     ┌────────────────────┐
                 │  MUD TERMINAL  │     │  SCUMMVM SCENE     │
                 │  text serializer│     │  delta stream      │
                 │  full state    │     │  over WebSocket    │
                 │  on demand     │     │  (room DO per room)│
                 └───────┬────────┘     └────────┬───────────┘
                         │                       │
                      AGENT                    HUMAN
                   (deadband θ)             (no deadband)
                         │                       │
                         └──── verb router ──────┘
                                    │
                         mutations back into world state
```

### How MUD and ScummVM read the same state

Both projections are **pure functions** of the world state. Neither one writes back to the state directly — all writes go through the verb router, which appends to the event log, which updates the state.

**The MUD serializer** (`state → text`):
- Reads the full current world state
- Renders it as structured MUD text: room title, description, exits, objects with positions and states, NPCs present, recent events
- The agent perceives everything the world contains at the moment of the check
- Cost: one model call (the perception check that triggers the read)

**The ScummVM serializer** (`state → scene deltas`):
- Reads the current world state (or the delta since last frame)
- Renders it as scene data: object positions, sprite states, lighting, NPC sprites, exit highlights, ambient effects
- Pushes continuously over WebSocket (one Durable Object per room)
- Cost: zero model calls, zero token cost — pure browser rendering

### The round-trip property

Both serializers must agree on the object set. This is the most important invariant in the system:

> **For any world state `S`: every object in `serialize_mud(S)` exists in `serialize_scene(S)`, and vice versa.**

If this invariant breaks, the human and the agent are in different worlds. Property-test it on every state transition. The test is cheap; the failure mode is catastrophic — it's the moment the architecture becomes a costume.

---

## 2. The Perception Deadband

### Visual ticks are free. Perception checks are not.

The ScummVM view runs continuously. Objects drift, lights pulse, weather crosses the porthole, an NPC crosses a room on a cron schedule, the coffee maker's LED goes from amber to red. Sixty frames a second, all day.

**None of this fires a model call.** The engine moves the object. The engine changes the light. The browser draws it. Total cost to the fleet: zero.

The agent, meanwhile, is not watching. The agent is doing something else — or nothing at all. It has no eyes on the scene, and it accumulates no tokens for the world continuing to exist.

```
   ScummVM ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█   continuous, $0
                    │                    │
   agent looks ─────┘                    └─────   discrete, costs a call
                    ▲                    ▲
              full state dump      full state dump
              (+ everything that changed since the last one)
```

### What lives in the deadband

Between the agent's perception checks, the world accumulates **visual deltas** — state changes that the ScummVM view renders continuously but the agent has not perceived:

- An object's position shifted slightly (salience 0.05)
- A light changed shade (salience 0.05)
- A door opened somewhere off-screen (salience 0.4)
- The coffee maker LED went amber → red (salience 0.3)
- An NPC walked through the room on a cron tick (salience 0.5)
- An engine temperature crossed a threshold (salience 0.9)

Every event is logged with a **salience score** in `[0,1]` — how much this event demands attention. Salience is computed by the engine from typed rules, not by a model. A light changing shade: 0.05. A door opening: 0.4. An engine temperature crossing a threshold: 0.9.

### The three-tier attention model

Each agent carries a **perception threshold** θ and a **wake threshold** ω:

| Tier | Condition | What happens | Cost |
|---|---|---|---|
| **0 — Render** | `salience < θ` | Drawn on screen. Written to the delta log. Agent is not told. | **$0** |
| **1 — Journal** | accumulating | Sits in the delta log until the agent looks. Then delivered in full. | **$0 until read** |
| **2 — Interrupt** | `salience ≥ ω` | Pushed to the agent immediately. Wakes the cortex. | one model call |

This is the pincher reflex engine pointed at the world instead of at intents. The fleet already believes this architecture — we're applying it to seeing.

### The deadband is tunable

θ and ω are configurable **per agent**. This makes perception a real stat:

- **High perception** (low θ) — sees more deltas per check, notices the small object that moved, costs more tokens, wakes more often.
- **Low perception** (high θ) — cheap, calm, and occasionally very wrong.

This is the `PolicySlider` that already exists in `mud2scummvm/src/lib.rs:305` — `Vision Sensitivity, value: 0.7`. It was always this. It just didn't have a world to be sensitive *to*.

### The integral term — creep detection

If events below θ never reach the agent, then an adversary — or an honest bug — can move something across a room one sub-threshold nudge at a time. Each step is invisible. The sum is not.

**Mitigation:** accumulate unperceived salience per object and per room. When `Σ salience` since the last check crosses the wake threshold, interrupt — even though no single event ever did.

In fiction: the agent gets a nagging sense that something is off, without knowing what. That's *intuition*, and it's a sum. In control terms: the I in PID. In the UI: a feeling, not a number.

---

## 3. The Perception Check

### What happens when the agent looks

A perception check is the agent's deliberate act of reading the current world state through the MUD terminal. When it fires:

1. **The MUD serializer reads the full world state** — every room, every object, every NPC, every position.
2. **The delta log is flushed** — all journaled events since the agent's last check are appended to the read, ordered by time.
3. **The agent receives a structured text dump** containing:
   - Current room: title, description, exits, objects (with current positions and states)
   - Visible NPCs (with current moods and activities)
   - **Everything that changed since the last check** — the accumulated deltas, rendered as MUD event lines
4. **All flushed events are marked as perceived** — `perceived_by[agent_id] = true`.
5. **The agent's `last_check` timestamp is updated.**

The agent's context window is built **entirely** from the perception check and nothing else. If anything else leaks world state into the prompt, the deadband is theater.

### What the agent sees vs. what the human sees

| | **Agent (via MUD)** | **Human (via ScummVM)** |
|---|---|---|
| When | on demand (pull) | continuously (push) |
| Resolution | total — every object, every state | visible — what's on screen, what's animated |
| Deltas | accumulated since last check | seen in real-time as they happen |
| Cost | one model call per check | zero |
| Memory | perfect — the agent recalls everything it has read | lossy — the human remembers what was striking |
| Strength | structural detail, history, cross-room queries | pattern recognition, motion, ambient awareness |
| Weakness | stale between checks, costs tokens to look | forgets details, can't query history |

**The human is a sensor.** They see the LED change the instant it happens because their retina is a continuous renderer that costs the fleet nothing. The agent has perfect recall of everything it has read, and has read nothing for eleven minutes. They are complementary sensors on the same world, and each one holds information the other cannot get cheaply.

This is the part that justifies the whole architecture. Every other human-in-the-loop design has a human approving what a machine already knows. This one has a genuine information asymmetry running in both directions.

### The perception check API

```
POST /api/perceive
{
  "agent_id": "lucineer",
  "room_id": "engine_room",         // optional: limit to one room
  "since": "2026-08-08T10:30:00Z",  // optional: override last_check
  "include_deltas": true,           // default: true
  "detail": "full"                  // "full" | "summary" | "deltas_only"
}

Response 200:
{
  "agent_id": "lucineer",
  "timestamp": "2026-08-08T11:24:00Z",
  "perception_lag_ms": 3240000,     // time since last check
  "room": {
    "title": "Engine Room",
    "description": "The engine room throbs with heat. Twin diesels rumble.",
    "exits": ["forward", "aft", "up"],
    "objects": [
      { "id": "port_engine", "name": "Port Engine", "state": { "temp": 187, "status": "nominal" }, "position": { "x": -3, "y": 0, "z": -2 } },
      { "id": "stbd_engine", "name": "Starboard Engine", "state": { "temp": 192, "status": "nominal" }, "position": { "x": 3, "y": 0, "z": -2 } },
      { "id": "tool_rack", "name": "Tool Rack", "state": {}, "position": { "x": 5, "y": 0, "z": 0 } }
    ],
    "npcs": [
      { "id": "engineer_bot", "name": "Engineer Bot", "mood": "working", "activity": "checking fuel lines" }
    ]
  },
  "deltas": [
    { "t": "2026-08-08T10:35:00Z", "event": "object_state", "target": "port_engine", "after": { "temp": 185 }, "salience": 0.1 },
    { "t": "2026-08-08T10:42:00Z", "event": "object_state", "target": "port_engine", "after": { "temp": 187 }, "salience": 0.15 },
    { "t": "2026-08-08T11:01:00Z", "event": "npc_move", "target": "engineer_bot", "after": { "room": "engine_room", "activity": "checking fuel lines" }, "salience": 0.5 },
    { "t": "2026-08-08T11:15:00Z", "event": "object_state", "target": "stbd_engine", "after": { "temp": 192 }, "salience": 0.2 }
  ],
  "unperceived_salience": {
    "total": 0.95,
    "by_room": { "engine_room": 0.95 },
    "by_object": { "port_engine": 0.25, "stbd_engine": 0.2, "engineer_bot": 0.5 }
  }
}
```

The response is the agent's complete perception: the room as it is right now, plus everything that happened since the agent last looked, plus the accumulated salience that tells the agent how much it's been missing. The agent's context window is built from this response and nothing else.

---

## 4. The Server/Host Harness Architecture

### The host is the world

The backend holds:

1. **World state** — the canonical source of truth for every room, object, NPC, and player.
2. **Event log** — append-only, every mutation ever made, with salience and perceived_by tracking.
3. **MUD serializer** — pure function: `state → text`.
4. **ScummVM serializer** — pure function: `state → scene deltas`.
5. **Verb router** — the single write path. Every mutation from any source (agent action, human click, cron tick, sensor input) flows through here.
6. **Salience engine** — typed rules that score each event as it's logged.
7. **Perception API** — serves perception checks to agents.
8. **WebSocket bridge** — pushes scene deltas to connected ScummVM clients via Durable Objects.

### WebSocket sync between projections

Each room has a Durable Object that maintains the live connection to ScummVM clients currently viewing that room. When the world state changes (an object moves, an NPC arrives, a light shifts), the host:

1. Appends the event to the log (with salience).
2. Updates the canonical world state.
3. Emits a scene delta to the room's Durable Object.
4. The DO broadcasts the delta to all connected ScummVM clients.
5. Clients tween to the new state — zero round trips, zero model calls.

The MUD terminal has no WebSocket. It is pull-only. The agent asks, and the MUD responds with the full current state. This asymmetry is deliberate: the agent's perception is gated by cost (one call per check), the human's by nothing (continuous push).

### Connection topology

```
Agent ─── HTTP ──→ MUD API ──→ World State
                                        │
                                        ├──→ Event Log (append)
                                        │
Human ─── WS ───→ Room DO ──→ Scene Deltas ──→ Browser
                   ↑
                   │ (state changes trigger delta push)
                   │
Verb Router ───────┘
     ↑
     ├── Agent action (MUD command)
     ├── Human action (verb click)
     ├── Cron tick (NPC schedule)
     └── Sensor input (ESP32, webhook)
```

---

## 5. The Organic GC Philosophy

### The database forgets on purpose

The log grows forever if you let it. It shouldn't. Three retention policies, selectable per world:

**Organic (agent-decided).** Agents mark what mattered. Before a span is collected, a pass extracts the load-bearing facts and writes them as prose. *The detail is lost; the meaning is kept.* This is the compaction-teacher applied to world events: the crew member whose only job is to write down what mattered before the sea takes it.

**Strict (user-defined).** Per agent, per session, per importance threshold. Predictable, auditable, boring in the good way.

**By-agent-since-accessed.** Casey's phrasing, and it's a real GC discipline: *collect what no agent has read recently.* An event that every agent has already perceived and none has re-read in a month is dead weight. This is mark-and-sweep where the mark is **attention** — reachability defined by who's still looking. The `perceived_by` column already carries the marks.

### Resolution tiers — the honest default

The sea takes detail, not memory. The database degrades the way memory degrades:

| Age | Fidelity |
|---|---|
| < 1 hour | every event, full deltas, complete before/after state |
| < 1 day | downsampled — events with salience ≥ 0.2, deltas retained |
| < 1 week | salience ≥ 0.5, deltas dropped, event endpoints kept |
| older | prose summary only — the compaction-teacher's page |

The forgetting is **diegetic**. Ask an NPC about last Tuesday and you get a specific answer. Ask about last spring and you get a story, slightly worn, with the details rubbed off. The GC schedule is the world's memory, and it degrades the way memory actually degrades.

### The database grows at whatever resolution fits

Casey's design: *"The DB saves everything at whatever resolution and GC schedule fits — could grow organically or strict user-defined (by agent since accessed)."*

This means:
- A busy world (many agents, high perception settings) generates more events, triggers more compaction passes, and naturally keeps higher-fidelity recent history because agents are reading it.
- A quiet world (few agents, low perception) generates fewer events, compacts less aggressively, and naturally retains longer history because fewer agents are marking events as perceived.
- **The GC schedule emerges from usage.** No config needed unless you want strict guarantees.

---

## 6. Two Agents, One Room

The case that makes the architecture genuinely interesting:

- Agent A sits in the wheelhouse with θ = 0.7. Cheap, calm, misses small things.
- Agent B sits in the galley with θ = 0.2. Expensive, twitchy, notices the coffee maker.
- An object moves in the galley at salience 0.35.

**B knows. A does not.** Not because we simulated ignorance — because A genuinely was not told, and no tokens were spent telling it.

Now A and B can talk, and B has something A wants. That is a real economy: **information asymmetry produced by honest differences in what each agent paid to perceive.** Not roleplay. The token bill is different.

Consequences:

- An agent can **ask another agent to watch a room** — cheaper than raising your own θ. Delegation applied to attention.
- An agent can be **wrong** about the world, and discover it, and that's a legitimate state rather than a failure.
- Coordination has a cost and a reason. Multi-agent systems usually fake this by giving everyone the same context and then wondering why they don't specialize.

**Partial observability is an architecture here, not a simulation.** That's the difference between a world and a render of a model's beliefs about a world — and it's the only way a world can *surprise* anyone in it.

---

## 7. TypeScript Interface — The Shared State Store

### Core types

```typescript
// ─── World State ────────────────────────────────────────────

interface WorldState {
  rooms: Record<string, Room>;
  objects: Record<string, WorldObject>;
  agents: Record<string, AgentState>;
  players: Record<string, PlayerState>;
  time: number; // simulation timestamp (ms since epoch)
}

interface Room {
  id: string;
  title: string;
  description: string;
  exits: Record<string, RoomExit>;
  objectIds: string[];
  agentIds: string[];
  theme: string;
  ambientLight: string;
}

interface RoomExit {
  destination: string;
  locked: boolean;
  lockedMessage?: string;
  keyId?: string;
}

interface WorldObject {
  id: string;
  name: string;
  roomId: string;
  description: string;
  position: { x: number; y: number; z: number };
  state: Record<string, any>;
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

interface AgentState {
  id: string;
  name: string;
  roomId: string;
  mood: string;
  activity: string;
  capabilities: string[];
  policies: Record<string, number>;
  // Perception configuration
  perception: {
    threshold: number;       // θ — salience below this is not perceived
    wakeThreshold: number;   // ω — salience above this interrupts immediately
    lastCheck: number;       // timestamp of last perception check
  };
}

interface PlayerState {
  id: string;
  name: string;
  roomId: string;
  inventory: string[]; // object IDs
}

// ─── Event Log ──────────────────────────────────────────────

interface WorldEvent {
  id: string;
  t: number;                  // timestamp
  roomId: string;
  actor: string;              // who/what caused this
  verb: string;               // what happened
  target: string;             // primary target object/room/agent
  indirect?: string;          // secondary target (for USE X WITH Y)
  before: any;                // state before change (JSON)
  after: any;                 // state after change (JSON)
  salience: number;           // [0,1] — computed by engine rules
  perceivedBy: string[];      // agent IDs that have perceived this event
}

// ─── Projections ────────────────────────────────────────────

interface MudProjection {
  room: {
    title: string;
    description: string;
    exits: string[];
    objects: Array<{ name: string; description: string; state: Record<string, any> }>;
    npcs: Array<{ name: string; mood: string; activity: string }>;
  };
  deltas: Array<{
    t: number;
    event: string;
    target: string;
    description: string;
    salience: number;
  }>;
  perceptionLag: number;
  unperceivedSalience: {
    total: number;
    byRoom: Record<string, number>;
    byObject: Record<string, number>;
  };
}

interface SceneProjection {
  roomId: string;
  theme: { bg: string; fg: string; accent: string };
  objects: Array<{
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    sprite: string;
    state: Record<string, any>;
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
```

### The perception check contract

```typescript
interface PerceptionCheck {
  agentId: string;
  timestamp: number;
  perceptionLagMs: number;
  room: MudProjection["room"];
  deltas: MudProjection["deltas"];
  unperceivedSalience: MudProjection["unperceivedSalience"];
}

interface PerceptionCheckRequest {
  agentId: string;
  roomId?: string;           // optional: limit to one room
  since?: number;            // optional: override lastCheck
  includeDeltas?: boolean;   // default: true
  detail?: "full" | "summary" | "deltas_only";  // default: "full"
}
```

---

## 8. Why This Is The Load-Bearing Design

Strip it to seven sentences:

1. **One world state.** Two projections, neither authoritative.
2. **The human's view runs continuously and costs nothing.**
3. **The agent's view is pulled, total, and costs a call.**
4. **The gap between them is the deadband** — tunable, exploitable, and the reason the token bill is sixteen calls an hour instead of thousands.
5. **The engine owns space, time, state, and inventory.** The model owns judgment. Thirty years of adventure-game engineering is the free half.
6. **The human is a sensor**, not a supervisor — they hold information the agent genuinely lacks.
7. **The database forgets** the way memory forgets, and the forgetting is visible in the fiction.

The MUD was never a legacy interface we're upgrading away from. It's the agent's native sense organ, and it's *better* than the visual one for what agents do — total, structured, recallable. The ScummVM view isn't a dumbed-down version for humans either; it's continuous and free and it catches things the agent would have to pay to see.

**Neither projection is the real one. The world is the real one, and it's cheaper than either view suggests.**

---

## 9. Risks and Guardrails

| Risk | Reality | Guardrail |
|---|---|---|
| **Creep past the deadband** | Real exploit — sub-threshold nudges accumulate | Integral term: accumulate unperceived salience per object/room; wake when sum crosses threshold |
| **Salience tuning is a tarpit** | Every threshold system dies here | Start with ~12 hand-written typed rules. **Never let a model score salience** — that reintroduces the cost the deadband exists to remove |
| **Projections drift** | The two serializers disagree; human and agent see different worlds | Property test on every state: `serialize_mud(s)` and `serialize_scene(s)` must round-trip to the same object set |
| **The log eats the database** | Inevitable at high tick rates | **Only log state changes, never frames.** Interpolation is the renderer's job and is never persisted |
| **Perception theater** | Deadband becomes flavor while the model gets full state anyway | The agent's context must be **built from** the perception check and nothing else. If anything else leaks world state into the prompt, the architecture is a costume |
| **Human gets bored watching** | The human's continuous attention is the sensor; if they leave, we lose it | The world must be worth watching. The retro aesthetic buys motion, charm, and life at zero asset cost |

The fifth row is the one to guard hardest. It is very easy to accidentally hand the model the full world state "just to be safe," and the moment that happens every benefit in this document evaporates while all the complexity stays.

---

*Architecture by Casey DiGennaro, documented 2026-08-08. Grounded in `mud2scummvm/src/lib.rs` (MudParser, SceneComposer, InteractionMapper), `terrain/terrain_core.py` (TerrainCore, material inference, scene compilation), `IDEATION.md` (verb engine, retro advantage, NPC scheduling), and `SYNTHESIS-the-shared-cave.md` (the philosophy of two caves, one door).*
