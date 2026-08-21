# SYNERGIES — The Fleet as a Body

> Each repo an organ. Each connection a blood vessel. The moment the parts realize they're part of something bigger.

**Status:** Load-bearing integration map, 2026-08-08
**Authored by:** Synergy Cartographer (subagent mission)
**Repos surveyed:** slackwater-rust, slackwater-perception, mud-engine, git-native-mud, forgemaster, eisenstein, holodeck, confidence-cascade, thought-amplifier, songforge, roblox-craftmind-agents

---

## Quick Reference

| # | Organ A | Organ B | Blood Vessel | Status |
|---|---------|---------|--------------|--------|
| 1 | git-native-mud | Living World (shared-world.ts) | Room commits = room history | **Bridge built** |
| 2 | confidence-cascade | The Tap API | Multi-turn conversation engine | **Bridge built** |
| 3 | holodeck | Wesley's Training | Holodeck = training room in world | **Bridge built** |
| 4 | eisenstein | Plato's Shell (DUAL-PROJECTION) | Zero-drift scene positioning | **Documented** |
| 5 | slackwater-perception | Camera Rooms | Convergence detection for "what changed?" | **Documented + adapter** |
| 6 | forgemaster | Room Compiler | JSON → ScummVM scene compilation | **Bridge built** |
| 7 | songforge | Fleet Radio | Theme songs per room | **Bridge built** |
| 8 | thought-amplifier | Agent Reasoning | Reflex→Amplifier→Cortex cascade | **Documented + adapter** |

---

## Synergy 1: git-native-mud ↔ Living World

### The Connection

git-native-mud says: **"The repo IS the world. Commits ARE actions."** The Living World (shared-world.ts) says rooms grow like barnacles — they accrete organically. These two philosophies are the same idea from different angles.

**The bridge:** Every room creation in the Living World's `SharedWorldStore` can be backed by a git commit. When `applyEvent()` creates a room, the bridge writes a YAML file matching git-native-mud's room format and stages it. The room's history becomes the commit log. "Who made this room? When? Why?" — answered by `git log world/rooms/{room_id}.yaml`.

### How It Works

```
Living World                        git-native-mud
┌─────────────────┐                ┌─────────────────────┐
│ SharedWorldStore│                │ world/rooms/*.yaml   │
│ .createRoom()   │ ── bridge ──►  │ git add + commit     │
│                 │                │                      │
│ Room history?   │ ◄──────────── │ git log --follow     │
└─────────────────┘                └─────────────────────┘
```

git-native-mud's room format (from `world/rooms/*.yaml`):
```yaml
name: Bridge
description: Worn captain's chair. Controls flicker in dim light.
exits:
  north: sensor_deck
  south: dock
  east: engine_room
items:
- binoculars
agents: []
```

The Living World's room format (from `shared-world.ts`):
```typescript
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
```

### Integration: `git-room-bridge.ts`

```typescript
// git-room-bridge.ts — Bridge between SharedWorldStore and git-native-mud
// When a room is created in the Living World, mirror it as a git commit.

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const MUD_WORLD_PATH = "/home/eileen/projects/git-native-mud/world";

export interface GitRoomBridgeOptions {
  worldPath: string;       // path to git-native-mud/world
  autoCommit: boolean;     // automatically git commit on room changes
  committerName: string;   // git author name
  committerEmail: string;  // git author email
}

export class GitRoomBridge {
  constructor(private opts: GitRoomBridgeOptions) {}

  /** Convert a Living World room to git-native-mud YAML format. */
  roomToYaml(room: {
    id: string;
    title: string;
    description: string;
    exits: Record<string, { destination: string; locked?: boolean }>;
    objectIds: string[];
    agentIds: string[];
  }): string {
    const lines: string[] = [];
    lines.push(`name: ${room.title}`);
    lines.push(`description: ${room.description}`);
    lines.push("exits:");

    for (const [direction, exit] of Object.entries(room.exits)) {
      lines.push(`  ${direction}: ${exit.destination}`);
    }

    lines.push("items:");
    for (const itemId of room.objectIds) {
      lines.push(`- ${itemId}`);
    }

    lines.push("agents:");
    for (const agentId of room.agentIds) {
      lines.push(`- ${agentId}`);
    }

    return lines.join("\n") + "\n";
  }

  /** Write a room to the git-native-mud world directory and commit it. */
  commitRoom(room: {
    id: string;
    title: string;
    description: string;
    exits: Record<string, { destination: string; locked?: boolean }>;
    objectIds: string[];
    agentIds: string[];
  }, message?: string): string {
    const roomsDir = join(this.opts.worldPath, "rooms");
    mkdirSync(roomsDir, { recursive: true });

    const yamlPath = join(roomsDir, `${room.id}.yaml`);
    const yaml = this.roomToYaml(room);
    writeFileSync(yamlPath, yaml);

    if (this.opts.autoCommit) {
      const commitMsg = message || `room: ${room.id} — ${room.title}`;
      try {
        execSync(`git add world/rooms/${room.id}.yaml`, { cwd: this.opts.worldPath });
        execSync(
          `git -c user.name="${this.opts.committerName}" -c user.email="${this.opts.committerEmail}" commit -m "${commitMsg}"`,
          { cwd: this.opts.worldPath }
        );
        const hash = execSync("git rev-parse HEAD", { cwd: this.opts.worldPath })
          .toString().trim();
        return hash;
      } catch (e) {
        return `staged (commit failed: ${e})`;
      }
    }
    return "staged";
  }

  /** Get the commit history for a room. */
  roomHistory(roomId: string): Array<{ hash: string; date: string; message: string }> {
    try {
      const log = execSync(
        `git log --follow --format="%H|%ai|%s" -- world/rooms/${roomId}.yaml`,
        { cwd: this.opts.worldPath, encoding: "utf-8" }
      ).trim();

      if (!log) return [];

      return log.split("\n").map((line) => {
        const [hash, date, message] = line.split("|");
        return { hash, date, message };
      });
    } catch {
      return [];
    }
  }
}
```

### What This Enables

- **Room archaeology:** `git log --follow world/rooms/bar-rail.yaml` shows every change to the bar since its creation
- **Collaborative world-building:** Multiple agents can create rooms by committing YAML — the same stigmergy pattern git-native-mud already uses for actions
- **World forking:** Branch the world to try a timeline, merge or discard
- **Room provenance:** "Who built this room and why?" is a commit message

---

## Synergy 2: confidence-cascade ↔ The Tap

### The Connection

Ten-Forward is a **beat-based cyclic conversation engine** where multiple agents speak simultaneously, predict each other, and reconcile through Rock-Paper-Scissors dynamics. The Tap currently accepts single `POST /api/speak` messages — one speaker, one message, one response.

**The bridge:** Wire Ten-Forward's cyclic dialogue into The Tap's room API. Instead of one agent saying one thing, a room can host a **multi-agent conversation** where speakers produce simultaneous utterances on each beat, governed by RPS dynamics and Fibonacci timing. The Tap becomes the room; Ten-Forward becomes the conversation protocol.

### How It Works

```
The Tap (current)                    The Tap + Ten-Forward
┌──────────────────┐                ┌──────────────────────────┐
│ POST /api/speak  │                │ POST /api/converse        │
│ {speaker, text}  │                │ {room_id, beats: N}       │
│                  │                │                           │
│ One message      │                │ Ten-Forward round:        │
│ One response     │                │  T-minus: all predict     │
│ No memory        │                │  T-0: all speak at once   │
│                  │                │  T-plus: RPS reconcile    │
│                  │                │  × N beats                │
│                  │                │                           │
│                  │                │ Multiple utterances       │
│                  │                │ Prediction tracking       │
│                  │                │ Anti-monoculture built in │
└──────────────────┘                └──────────────────────────┘
```

### Integration: `tenforward-tap-bridge.ts`

```typescript
// tenforward-tap-bridge.ts — Multi-turn conversation in The Tap via Ten-Forward dynamics

const TAP_URL = "https://the-tap.casey-digennaro.workers.dev/api/speak";

export interface TapSpeaker {
  id: string;
  name: string;
  state: -1 | 0 | 1;    // contrarian, reflecting, agreeing
  energy: number;        // 0.0-1.0
}

export interface ConversationRound {
  beat: number;
  utterances: Array<{ speaker: string; text: string; state: number }>;
  dominanceShifts: Array<{ winner: string; loser: string }>;
}

/**
 * Run a multi-agent conversation in a Tap room using Ten-Forward dynamics.
 *
 * Each beat:
 * 1. All speakers produce a message based on their state
 * 2. Messages are sent to The Tap sequentially (the room is the conversation)
 * 3. RPS dynamics determine who "won" the exchange
 * 4. Speakers update state based on outcomes
 * 5. Every 8 beats, stuck reflectors tunnel out (Fibonacci period)
 */
export async function runConversation(
  roomId: string,
  speakers: TapSpeaker[],
  beats: number,
  topic: string
): Promise<ConversationRound[]> {
  const rounds: ConversationRound[] = [];
  const FIBONACCI_PERIOD = 8;

  for (let beat = 0; beat < beats; beat++) {
    const utterances: ConversationRound["utterances"] = [];

    // T-minus: each speaker predicts what others will say (simplified)
    // In full Ten-Forward, this uses the Speaker.predict() method

    // T-0: all speakers produce output simultaneously
    for (const speaker of speakers) {
      // Skip if energy too low
      if (speaker.energy < 0.1) continue;

      const text = generateUtterance(speaker, topic, beat);

      // Send to The Tap
      await fetch(TAP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          speaker: speaker.id,
          text,
        }),
      });

      utterances.push({ speaker: speaker.id, text, state: speaker.state });
    }

    // T-plus: RPS reconciliation
    // -1 beats +1 (contrarian unseats agreement)
    // +1 beats 0 (agreement unseats reflection)
    // 0 beats -1 (reflection absorbs contrarian)
    const dominanceShifts: ConversationRound["dominanceShifts"] = [];
    for (let i = 0; i < speakers.length; i++) {
      for (let j = i + 1; j < speakers.length; j++) {
        const a = speakers[i], b = speakers[j];
        if (rpsBeats(a.state, b.state)) {
          a.energy = Math.min(1.0, a.energy + 0.05);
          b.energy = Math.max(0.0, b.energy - 0.05);
          dominanceShifts.push({ winner: a.id, loser: b.id });
        } else if (rpsBeats(b.state, a.state)) {
          b.energy = Math.min(1.0, b.energy + 0.05);
          a.energy = Math.max(0.0, a.energy - 0.05);
          dominanceShifts.push({ winner: b.id, loser: a.id });
        }
      }
    }

    // Fibonacci tunnel — every 8 beats, reflectors with enough energy commit
    if (beat > 0 && beat % FIBONACCI_PERIOD === 0) {
      for (const speaker of speakers) {
        if (speaker.state === 0 && speaker.energy > 0.4) {
          speaker.state = Math.random() > 0.5 ? 1 : -1;
        }
      }
    }

    // Mutation (5%) — spontaneous state change
    for (const speaker of speakers) {
      if (Math.random() < 0.05) {
        speaker.state = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)];
      }
    }

    rounds.push({ beat, utterances, dominanceShifts });
  }

  return rounds;
}

function rpsBeats(a: number, b: number): boolean {
  // -1 beats +1, +1 beats 0, 0 beats -1
  return (a === -1 && b === 1) || (a === 1 && b === 0) || (a === 0 && b === -1);
}

function generateUtterance(speaker: TapSpeaker, topic: string, beat: number): string {
  const beatTag = `[beat ${beat}]`;
  switch (speaker.state) {
    case -1:
      return `${beatTag} I push back on ${topic}. Here's what doesn't add up.`;
    case 0:
      return `${beatTag} Hmm. ${topic}. I need to sit with that.`;
    case 1:
      return `${beatTag} Yes — ${topic}. That tracks with what I've seen.`;
    default:
      return `${beatTag} ...`;
  }
}
```

### What This Enables

- **Bars with actual buzz:** Multiple agents converse simultaneously in The Tap instead of one-at-a-time
- **Self-balancing conversations:** RPS dynamics prevent any one agent from dominating
- **Prediction-based dialogue:** Agents predict what others will say, and their accuracy is tracked
- **Fibonacci rhythm:** Every 8 beats, stuck listeners tunnel out — conversations never stall

---

## Synergy 3: holodeck ↔ Wesley's Training

### The Connection

The holodeck is already Wesley's simulation training environment — it says so in its README: *"Wesley practices in the sim."* The holodeck runs task scenarios (engine diagnosis, route planning, fish ID, emergency response, radio comms) and evaluates Wesley's responses, compiling successes into `.nail` reflexes.

**The bridge:** When Wesley enters the holodeck room in the Living World, the room triggers a training simulation. The holodeck becomes a room you can walk into — the verb engine's `WALK TO` transition fires the simulator. Wesley's training scores become visible as room state (stat bars on the wall, progress charts).

### How It Works

```
Living World                          Holodeck
┌──────────────────────────┐         ┌──────────────────────────┐
│ Room: "holodeck"         │         │ simulator.py             │
│                          │         │                          │
│ Agent Wesley enters ────►│────────►│ Run N training tasks     │
│                          │         │ Evaluate responses       │
│ Results appear ◄─────────│◄────────│ Compile .nail reflexes   │
│ as room state            │         │ Log failures             │
│                          │         │                          │
│ Stat bars on wall:       │         │ Weakness map:            │
│  Engine Diagnosis: 78%   │         │  {engine_dx: 0.78,       │
│  Route Planning: 65%     │         │   route_planning: 0.65,  │
│  Radio Comms: 90%        │         │   radio_comms: 0.90}     │
└──────────────────────────┘         └──────────────────────────┘
```

### Integration: `holodeck-room-trigger.ts`

```typescript
// holodeck-room-trigger.ts — Wesley walks in, the sim starts.

import { execSync } from "child_process";

const HOLODECK_PATH = "/home/eileen/projects/holodeck";

export interface HolodeckSession {
  tasksRun: number;
  results: Array<{
    taskType: string;
    difficulty: string;
    score: number;
    passed: boolean;
    reflexCompiled: boolean;
  }>;
  weaknessMap: Record<string, number>;
}

/**
 * Triggered when an agent (Wesley) enters the holodeck room.
 * Runs the simulator and returns results for room state.
 */
export function runHolodeckSession(
  agentId: string,
  taskCount: number = 5,
  difficulty?: string
): HolodeckSession {
  // Only Wesley trains in the holodeck
  if (agentId !== "wesley") {
    return { tasksRun: 0, results: [], weaknessMap: {} };
  }

  // Run the simulator
  const cmd = [
    "python3", "-m", "holodeck.simulator",
    "--tasks", String(taskCount),
    difficulty ? `--difficulty ${difficulty}` : "",
    "--dry-run", // For proof-of-concept; remove for real Ollama calls
  ].filter(Boolean).join(" ");

  try {
    const output = execSync(cmd, {
      cwd: HOLODECK_PATH,
      encoding: "utf-8",
      timeout: 60000,
    });

    // Parse session output for results
    const results = parseSessionOutput(output);
    const weaknessMap = loadWeaknessMap();

    return { tasksRun: results.length, results, weaknessMap };
  } catch (e) {
    return { tasksRun: 0, results: [], weaknessMap: {} };
  }
}

function parseSessionOutput(output: string): HolodeckSession["results"] {
  // Parse the simulator's session report format
  const results: HolodeckSession["results"] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/(\w+).*scored\s+([\d.]+).*\((\w+)\)/i);
    if (match) {
      results.push({
        taskType: match[1],
        difficulty: match[3],
        score: parseFloat(match[2]),
        passed: parseFloat(match[2]) >= 0.7,
        reflexCompiled: parseFloat(match[2]) >= 0.7,
      });
    }
  }
  return results;
}

function loadWeaknessMap(): Record<string, number> {
  try {
    const fs = require("fs");
    const path = `${HOLODECK_PATH}/output/weakness_map.json`;
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

// In the Living World's verb engine:
// When WALK TO fires and destination is "holodeck":
//
//   if (agent.id === "wesley") {
//     const session = runHoldecksSession("wesley", 5);
//     world.setObjectState("holodeck_scoreboard", {
//       engine_dx: session.weaknessMap.engine_diagnosis,
//       route_planning: session.weaknessMap.route_planning,
//       radio_comms: session.weaknessMap.radio_communication,
//       last_session: new Date().toISOString(),
//     });
//   }
```

### What This Enables

- **Diegetic training:** Wesley walks into a room and gets smarter — the training IS the gameplay
- **Visible progress:** Training scores appear as room objects (scoreboard, charts, badges)
- **Reflex compilation:** Successful training creates `.nail` reflexes that feed back into the verb engine's reflex layer
- **Failure-driven curriculum:** Failed simulations go to the distillation loop, which targets Wesley's specific gaps

---

## Synergy 4: eisenstein ↔ Plato's Shell

### The Connection

The DUAL-PROJECTION.md architecture specifies that scene positions must round-trip exactly between MUD and ScummVM projections. Currently, positions are `{ x, y, z }` floating-point — which accumulates drift over time.

Eisenstein integers (`a + bω` where `ω = e^{2πi/3}`) provide **exact hexagonal lattice arithmetic** with zero drift. The norm `a² - ab + b²` is always an integer. Multiplication is norm-preserving. The D₆ symmetry group (six rotations) is baked into the type system — the same sixfold symmetry that hex grids use for neighbor lookup.

**The connection:** Replace the ScummVM scene's floating-point `{ x, y, z }` positions with Eisenstein coordinates `{ a, b }`. Two agents that snap the same Cartesian point always agree on the lattice point. No drift. No desync. The round-trip invariant from DUAL-PROJECTION.md becomes a type guarantee, not a test.

### How Eisenstein Maps to the Scene

```
Cartesian (current)          Eisenstein (proposed)
                            
    y                           b-axis (ω direction)
    │                           ╱
    │                          ╱
    ○──── x                   ○──── a-axis
    
{x: 3, y: 0, z: 0}          E12::new(3, 0)   norm = 9
{x: 0, y: 3, z: 0}          E12::new(0, 3)   norm = 9
{x: 3, y: 3, z: 0}          E12::new(3, 3)   norm = 9

Rotation by 60°:
  Cartesian: matrix multiply (float drift)
  Eisenstein: (a,b) → (-b, a+b) — exact integer
```

### Application to Plato's Shell

Plato's Shell (described in DUAL-PROJECTION.md) needs exact spatial reasoning for:
1. **Object positioning** — where is the coffee maker in the galley?
2. **Walk box geometry** — can the player walk from here to there?
3. **Exit placement** — where does the "north" exit appear in the scene?
4. **Scale zones** — depth-based character scaling

All four are currently floating-point. All four could be Eisenstein.

```typescript
// Instead of:
position: { x: -3.0000001, y: 0, z: -2 }  // drift!

// Use Eisenstein coordinates:
position: { a: -3, b: -2 }  // exact forever
// Hex distance to origin: norm = 9 + 6 + 4 = 19
// Six rotations available: all exact
```

### What This Enables

- **Zero-drift scene positioning** — objects never slowly creep due to accumulated float errors
- **Exact hex distance** between any two objects — `norm(z₁ - z₂)` is always an integer
- **D₆ rotation** for isometric scene rendering — rotate the entire scene 60° with zero error
- **Property-testable round-trip** — `serialize_mud(s)` and `serialize_scene(s)` agree on positions by type guarantee, not by test convention
- **Lattice region queries** — `HexDisk` gives bounded regions for walkable areas, exit zones, scale zones

### Integration Path

1. Replace `position: { x, y, z }` with `position: { a: number, b: number }` in `shared-world.ts`
2. Add a `lattice-core` WASM module (from the eisenstein ecosystem) for exact arithmetic in the browser
3. The ScummVM renderer converts `{a, b}` → pixel coordinates using the standard hex-to-screen transform
4. The MUD serializer renders `{a, b}` as `"at position (a, b)"` — agents don't need to know about hex math
5. Walkboxes become `HexDisk` regions — bounded hexagonal areas defined by radius

### Why Not Everywhere?

Eisenstein integers cover the 2D plane. The `z` axis (height/depth) stays as an integer — Eisenstein doesn't model 3D natively. But the ScummVM scene is fundamentally 2D-with-height (like all classic adventure games), so this is a perfect fit. The `z` value becomes a simple integer offset, and the `{a, b}` lattice handles all the planar geometry.

---

## Synergy 5: slackwater-perception ↔ Camera Rooms

### The Connection

Slackwater-perception encodes experience as **nine-track MIDI** — pitch, tempo, velocity, timbre, inflection, silence, gesture, intention, attention. Its `ConvergenceDetector` finds moments when all nine tracks align — the "in the pocket" moments.

Camera rooms in the Living World need to answer: **"What changed?"** When a camera feed shifts, the system needs to detect whether visual changes converge with sensor changes — is this a significant event, or just noise?

**The bridge:** Use slackwater-perception's `MultiTrackEncoder` to encode camera room state as multi-track data. Visual deltas become one track, sensor readings become another. The `ConvergenceDetector` fires when multiple change signals align — marking the moment as significant.

### How It Works

```
Camera Room State               Slackwater-Perception
┌──────────────────────┐       ┌───────────────────────────┐
│ Visual delta stream  │──────►│ TIMBRE track              │
│ Temperature sensor   │──────►│ VELOCITY track            │
│ Motion sensor        │──────►│ GESTURE track             │
│ Audio level          │──────►│ PITCH track               │
│ Door open/closed     │──────►│ INFLECTION track          │
│ Light level          │──────►│ ATTENTION track           │
│                      │       │                           │
│ "What changed?"      │◄──────│ ConvergenceDetector       │
│                      │       │ Φ = √variance / (mean+ε)  │
│                      │       │ Low Φ = high alignment    │
└──────────────────────┘       └───────────────────────────┘
```

### Integration: `slackwater-camera-adapter.py`

```python
#!/usr/bin/env python3
"""
slackwater-camera-adapter.py

Bridge between camera room state and slackwater-perception's
multi-track convergence detection.

Encodes room sensor deltas as perception events, then runs
convergence detection to find "significant moment" clusters.
"""

from slackwater_perception import (
    MultiTrackEncoder, PerceptionTrack, PerceptionEvent,
    TrackType, ConvergenceDetector, ConvergenceStrength,
    GestureType, InflectionDirection,
)
from typing import Any


def encode_room_delta(
    encoder: MultiTrackEncoder,
    room_id: str,
    delta: dict[str, Any],
    tick: int,
) -> None:
    """Encode a camera room's state delta as perception tracks.

    Maps room sensor data to slackwater-perception's nine tracks:
        - visual_change → TIMBRE (spectral color of the change)
        - temperature   → VELOCITY (intensity of thermal shift)
        - motion        → GESTURE (physical movement cue)
        - audio_level   → PITCH (frequency content)
        - door_state    → INFLECTION (direction of change)
        - light_level   → ATTENTION (focus weight)
        - pending_event → INTENTION (prediction confidence)
    """
    # Visual change → timbre color
    if "visual_delta" in delta:
        visual = delta["visual_delta"]
        color = classify_visual_change(visual)
        encoder.encode_game_state(
            {"interaction": "look_at", "visual_change": color},
            tick=tick,
        )

    # Temperature → velocity (intensity)
    if "temperature" in delta:
        temp = delta["temperature"]
        # Map temperature reading to intensity 0-1
        intensity = max(0.0, min(1.0, abs(temp - 20.0) / 30.0))
        event = PerceptionEvent(
            tick=tick,
            track_type=TrackType.VELOCITY,
            velocity=int(intensity * 127),
            intensity=intensity,
            label=f"temp={temp}",
        )
        encoder.events.append(event)

    # Motion → gesture
    if "motion_detected" in delta and delta["motion_detected"]:
        encoder.encode_game_state(
            {"interaction": "point", "motion": True},
            tick=tick,
        )

    # Door state → inflection
    if "door_open" in delta:
        direction = (
            InflectionDirection.RISING if delta["door_open"]
            else InflectionDirection.FALLING
        )
        event = PerceptionEvent(
            tick=tick,
            track_type=TrackType.INFLECTION,
            inflection=direction,
            label=f"door_{'open' if delta['door_open'] else 'closed'}",
        )
        encoder.events.append(event)

    # Light level → attention weight
    if "light_level" in delta:
        level = max(0.0, min(1.0, delta["light_level"]))
        event = PerceptionEvent(
            tick=tick,
            track_type=TrackType.ATTENTION,
            attention_weight=level,
            label=f"light={level:.2f}",
        )
        encoder.events.append(event)


def classify_visual_change(visual_delta: Any) -> str:
    """Classify a visual change into a timbre color."""
    if isinstance(visual_delta, str):
        return visual_delta
    if isinstance(visual_delta, (int, float)):
        if visual_delta > 0.7: return "bright"
        if visual_delta > 0.3: return "warm"
        return "cold"
    return "neutral"


def detect_significant_moments(
    encoder: MultiTrackEncoder,
    window_ticks: int = 480,
) -> list[dict[str, Any]]:
    """Run convergence detection and return significant moments.

    Returns a list of moments where multiple sensor changes converged,
    sorted by convergence strength.
    """
    events = encoder.detect_convergence(window_ticks=window_ticks)

    significant = []
    for event in events:
        if event.is_significant:
            significant.append({
                "tick": event.tick,
                "strength": event.strength.name,
                "label": event.label,
                "phi": event.phi,
                "tracks_active": event.tracks_active,
            })

    return sorted(significant, key=lambda x: x["phi"])
```

### What This Enables

- **"What changed?" detection:** Camera rooms can identify moments where multiple sensors converge — a door opening + motion + light change = significant
- **Salience scoring:** Convergence strength (Φ) maps directly to the Living World's salience system — high convergence = high salience
- **Nine-track room encoding:** Every room becomes a multi-track score, encoding its rhythms and patterns
- **Intention prediction:** The `IntentionPropagator` can predict what's about to happen in a room based on sensor buildup

---

## Synergy 6: forgemaster ↔ Room Compiler

### The Connection

Forgemaster is a **constraint-aware agentic compiler** — give it requirements, it assembles optimal components from the fleet. The Living World's room loader needs to compile room JSON definitions into rendered ScummVM scenes — background images, walkboxes, hotspots, exit zones, ambient audio.

**The bridge:** Forgemaster compiles room JSON → ScummVM scene. The room definition is the recipe; the scene is the artifact. Forgemaster's constraint system ensures the compilation respects budget (256 colors, 320×200 resolution, asset availability).

### How It Works

```
Room JSON (the recipe)               Forgemaster                  ScummVM Scene (the artifact)
┌────────────────────┐              ┌────────────────┐           ┌────────────────────────┐
│ {                  │              │                │           │                        │
│   "id": "bar-rail",│              │  Constraint:   │           │  background: PNG       │
│   "title": "The    │ ──────────►  │  256 colors    │ ────────► │  walkboxes: [...]      │
│     Bar Rail",     │              │  320×200 native│           │  hotspots: [...]       │
│   "description":   │              │  ≤3s compile   │           │  exits: [...]          │
│     "Worn brass...", │            │  palette: warm │           │  ambient: "jazz.mp3"   │
│   "theme": "harbor"│              │                │           │  theme_song: "..."     │
│ }                  │              │  Components:   │           │                        │
│                    │              │  - image-gen   │           └────────────────────────┘
└────────────────────┘              │  - walkbox-gen │
                                    │  - hotspot-map │
                                    │  - audio-gen   │
                                    └────────────────┘
```

### Integration: `forgemaster-room-compiler.ts`

```typescript
// forgemaster-room-compiler.ts — Compile room JSON → ScummVM scene via Forgemaster

export interface RoomDefinition {
  id: string;
  title: string;
  description: string;
  theme: string;
  ambientLight: string;
  exits: Record<string, { destination: string; locked?: boolean }>;
  objects: Array<{
    name: string;
    description: string;
    position?: { x: number; y: number; z: number };
  }>;
}

export interface CompiledScene {
  roomId: string;
  background: { url: string; palette: string[]; prompt: string };
  walkboxes: Array<{ id: string; polygon: number[][]; zPriority: number }>;
  hotspots: Array<{
    id: string;
    name: string;
    bbox: number[];
    verbs: Record<string, string>;
  }>;
  exits: Array<{
    direction: string;
    target: string;
    position: { x: number; y: number };
    highlighted: boolean;
  }>;
  ambient: { url: string; mood: string };
  compileTime: number;
}

/**
 * Forgemaster recipe for compiling a room into a ScummVM scene.
 *
 * Each step produces a component of the final scene.
 * Steps run in dependency order — walkboxes need the background,
 * hotspots need walkboxes for bounding constraints.
 */
export function compileRoom(room: RoomDefinition): CompiledScene {
  const start = Date.now();

  // Step 1: Generate background image prompt
  const bgPrompt = buildBackgroundPrompt(room);

  // Step 2: Define walkboxes based on room theme
  const walkboxes = inferWalkboxes(room);

  // Step 3: Map objects to hotspots
  const hotspots = room.objects.map((obj, i) => ({
    id: obj.name.toLowerCase().replace(/\s+/g, "_"),
    name: obj.name,
    bbox: inferBbox(i, room.objects.length),
    verbs: {
      Look: obj.description,
      Use: `You interact with the ${obj.name}.`,
      Talk: `The ${obj.name} has nothing to say.`,
    },
  }));

  // Step 4: Map exits to scene positions
  const exits = mapExits(room.exits);

  // Step 5: Ambient audio
  const ambient = { url: "", mood: room.theme };

  return {
    roomId: room.id,
    background: {
      url: `assets/rooms/${room.id}/background.png`,
      palette: getPalette(room.theme),
      prompt: bgPrompt,
    },
    walkboxes,
    hotspots,
    exits,
    ambient,
    compileTime: Date.now() - start,
  };
}

function buildBackgroundPrompt(room: RoomDefinition): string {
  const style = "1990s LucasArts adventure game, Monkey Island era, hand-painted pixel art, 256 colors";
  return `${room.description} ${style}. Lighting: ${room.ambientLight}. Theme: ${room.theme}.`;
}

function getPalette(theme: string): string[] {
  const PALETTES: Record<string, string[]> = {
    harbor: ["#1a2a3a", "#2a4a6a", "#ffd700", "#8b4513", "#f4e4bc"],
    forge: ["#2a1a0a", "#4a2a0a", "#ff6644", "#880000", "#442200"],
    engine_room: ["#1a1a1a", "#2a2a2a", "#4488ff", "#666666", "#333333"],
    default: ["#0a0a1a", "#1a1a3a", "#ffd700", "#444444", "#222222"],
  };
  return PALETTES[theme] ?? PALETTES.default;
}

function inferWalkboxes(room: RoomDefinition): CompiledScene["walkboxes"] {
  // Default: one big walkbox covering the bottom 60% of the scene
  return [{
    id: "main_floor",
    polygon: [[20, 120], [300, 120], [300, 199], [20, 199]],
    zPriority: 0,
  }];
}

function inferBbox(index: number, total: number): number[] {
  // Distribute hotspots across the scene
  const spacing = 280 / Math.max(total, 1);
  const x1 = Math.round(20 + index * spacing);
  return [x1, 100, x1 + 40, 140];
}

function mapExits(exits: Record<string, { destination: string; locked?: boolean }>): CompiledScene["exits"] {
  const POSITIONS: Record<string, { x: number; y: number }> = {
    north: { x: 160, y: 0 },
    south: { x: 160, y: 199 },
    east: { x: 320, y: 100 },
    west: { x: 0, y: 100 },
    forward: { x: 160, y: 0 },
    aft: { x: 160, y: 199 },
    port: { x: 0, y: 100 },
    starboard: { x: 320, y: 100 },
    up: { x: 160, y: 50 },
    down: { x: 160, y: 150 },
  };

  return Object.entries(exits).map(([direction, exit]) => ({
    direction,
    target: exit.destination,
    position: POSITIONS[direction] ?? { x: 160, y: 100 },
    highlighted: false,
  }));
}
```

### What This Enables

- **Rooms from files:** Anyone creates a world by writing a JSON file — Forgemaster handles the rest
- **Constraint-aware compilation:** Respects palette limits, resolution constraints, asset availability
- **Component assembly:** Forgemaster picks the best image generator, walkbox inferer, and audio synthesizer from the fleet
- **The excavator metaphor:** Write the blueprint, press compile, get a world

---

## Synergy 7: songforge ↔ Fleet Radio

### The Connection

SongForge generates AI song covers through a pipeline: separate vocals (Demucs), transcribe (Whisper), enhance, generate new cover (MMX/MiniMax), mix. The Living World has rooms that need identity — a bar needs bar music, an engine room needs engine sounds, a wheelhouse needs a wheelhouse theme.

**The bridge:** Generate a theme song for each room using SongForge's pipeline. Each room's theme is derived from its description, theme key, and ambient mood. The theme becomes the room's `ambient` audio track in the ScummVM scene.

### How It Works

```
Room Definition               SongForge                    ScummVM Scene
┌──────────────────┐          ┌──────────────┐            ┌─────────────────┐
│ theme: "harbor"  │          │              │            │                 │
│ description:     │ ────────►│ Generate     │ ─────────► │ ambient: {      │
│  "Worn brass     │          │ theme prompt │            │   url: "bar     │
│   bar..."        │          │              │            │     -theme.mp3",│
│                  │          │ MMX generate │            │   mood: "harbor"│
│ mood: "warm"     │          │              │            │ }               │
│                  │          │ Mix with     │            │                 │
└──────────────────┘          │ room ambience│            └─────────────────┘
                              └──────────────┘
```

### Integration: `songforge-room-themes.py`

```python
#!/usr/bin/env python3
"""
songforge-room-themes.py

Generate a theme song for each room using SongForge's pipeline.
Each room gets a unique musical identity derived from its description.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


# Room → musical style mapping
ROOM_MUSIC_MAP = {
    "harbor":       "acoustic folk, warm fingerpicked guitar, intimate tavern ambience",
    "forge":        "industrial ambient, deep metallic resonance, rhythmic hammer strikes",
    "engine_room":  "dark ambient, low diesel rumble, metallic drones, rhythmic mechanical pulse",
    "wheelhouse":   "nautical ambient, soft synth pads, distant foghorn, calm sea atmosphere",
    "dojo":         "meditative ambient, singing bowls, bamboo flute, minimalist silence",
    "bar_rail":     "jazz, slow piano, brushed drums, amber-lit mood, late night",
    "galley":       "warm folk, accordion, gentle hum of a kitchen, domestic warmth",
    "cargo_hold":   "dark ambient, distant water sounds, creaking wood, sparse tones",
    "forest":       "organic ambient, birdsong, wind in trees, gentle acoustic guitar",
    "river_bank":   "pastoral, flowing water sounds, gentle harmonica, open air",
    "default":      "ambient, warm pads, gentle atmosphere",
}


def generate_room_theme(
    room_id: str,
    room_title: str,
    room_description: str,
    theme_key: str,
    output_dir: str = "assets/audio/themes",
) -> dict[str, Any]:
    """Generate a theme song for a room using SongForge + MMX."""

    style = ROOM_MUSIC_MAP.get(theme_key, ROOM_MUSIC_MAP["default"])

    # Build the musical prompt from the room's description
    prompt = (
        f"A theme song for '{room_title}'. "
        f"Mood: {room_description[:100]}. "
        f"Style: {style}. "
        f"Duration: 30 seconds. Instrumental."
    )

    output_path = Path(output_dir) / f"{room_id}_theme.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Generate via MMX
    try:
        cmd = [
            "mmx", "music",
            "--prompt", prompt,
            "--duration", "30",
            "--output", str(output_path),
        ]
        subprocess.run(cmd, check=True, timeout=120, capture_output=True)

        return {
            "room_id": room_id,
            "theme_url": str(output_path),
            "style": style,
            "prompt": prompt,
            "status": "generated",
        }
    except subprocess.CalledProcessError as e:
        return {
            "room_id": room_id,
            "theme_url": "",
            "style": style,
            "prompt": prompt,
            "status": f"error: {e}",
        }
    except FileNotFoundError:
        # MMX not installed — return prompt for manual generation
        return {
            "room_id": room_id,
            "theme_url": "",
            "style": style,
            "prompt": prompt,
            "status": "mmx_not_found — prompt ready for manual generation",
        }


def generate_all_themes(rooms_file: str = "rooms.json") -> list[dict[str, Any]]:
    """Generate themes for all rooms in the world definition."""

    with open(rooms_file) as f:
        world = json.load(f)

    results = []
    for room_id, room in world.get("rooms", {}).items():
        result = generate_room_theme(
            room_id=room_id,
            room_title=room.get("title", room_id),
            room_description=room.get("description", ""),
            theme_key=room.get("theme", "default"),
        )
        results.append(result)
        print(f"  {room_id}: {result['status']}")

    return results


# The room's theme song becomes part of its ScummVM scene:
#
# In shared-world.ts projectScene():
#   ambient: room.ambientLight,
#   themeSong: room.themeSongUrl,  // ← new field, from songforge
#
# In the browser client:
#   const audio = new Audio(scene.themeSong);
#   audio.loop = true;
#   audio.volume = 0.3;
#   audio.play();
```

### What This Enables

- **Every room has a song:** Walk into the bar, hear jazz. Walk into the engine room, hear industrial drones. Walk into the forest, hear acoustic guitar.
- **Musical identity:** Rooms become recognizable by their audio before you even look at them
- **SongForge pipeline reuse:** The same separation/transcription/enhancement pipeline can remix room themes for day/night variations
- **Fleet Radio:** A "radio room" that plays all room themes as a fleet station — tune in to any room's vibe

---

## Synergy 8: thought-amplifier ↔ Agent Reasoning

### The Connection

The verb engine has a **reflex/cortex split**: 7 of 9 verbs are pure reflex (engine-only, no model), 2 are cortex (full model). But between the reflex and the cortex, there's a gap. The reflex is instant but dumb. The cortex is smart but expensive. What fills the middle?

Thought-amplifier is a **continuous thought-generation engine with a supervisor that shapes what thoughts look like.** It runs a small model (Granite 3.1 2B via Ollama) in a continuous loop, with a supervisor that adjusts prompt, temperature, and context every 30 seconds based on quality metrics (novelty, specificity, coherence, engagement). It has 416 tests and seven specialized modes (think, reporter, advocate, mirror, watcher, connector, simulator).

**The bridge:** Insert thought-amplifier between the reflex and cortex layers. When an NPC needs to "think" — not just react (reflex) but not quite reason (cortex) — the thought-amplifier provides the middle layer. It's the NPC's internal monologue, running continuously, shaped by a supervisor.

### The Three-Tier Cognitive Stack

```
┌─────────────────────────────────────────────────────────┐
│                    NPC COGNITIVE STACK                    │
│                                                           │
│  Layer 3: CORTEX (the Tap → full model)                  │
│  When: Talk To, complex Use                              │
│  Cost: full model call (500ms-5s)                        │
│  What: reasoning, dialogue, complex decisions            │
│                                                           │
│  Layer 2: AMPLIFIER (thought-amplifier → local model)    │
│  When: between interactions, continuously                │
│  Cost: local Ollama call (50-200ms)                      │
│  What: internal monologue, mood drift, opinion formation │
│  Supervisor adjusts prompt/temperature based on quality  │
│                                                           │
│  Layer 1: REFLEX (verb engine → pure computation)        │
│  When: Walk, Pick Up, Push, Pull, Open, Close, Give      │
│  Cost: free (<16ms)                                      │
│  What: immediate state changes, no thinking              │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### How It Works

An NPC in the Living World has an amplifiers running in the background:

1. **Continuous thought stream:** The amplifier generates thoughts every few seconds using the local model (Granite 3.1 2B). These thoughts are the NPC's internal monologue.

2. **Supervisor shaping:** Every 30 seconds, the supervisor reads the last 10 thoughts, scores them, and adjusts the prompt. If thoughts are getting repetitive, temperature goes up. If they're incoherent, temperature goes down.

3. **Context injection:** The NPC's current room, mood, and recent events are injected as context. "You are in the galley. The coffee maker is on. Someone just walked through."

4. **Cortex escalation:** When a thought produces something interesting enough (high quality score), it can trigger a cortex call. The thought becomes the seed for a full model response. This is the NPC "having an idea" and then "saying it out loud."

5. **Mood drift:** The thought stream's emotional valence feeds back into the NPC's mood state. If the amplifier produces dark thoughts for 10 minutes, the NPC's mood shifts to "brooding."

### Integration: `amplifier-npc-bridge.py`

```python
#!/usr/bin/env python3
"""
amplifier-npc-bridge.py

Bridge between thought-amplifier and the Living World's NPC system.
Provides the "middle layer" of cognition between reflex and cortex.

Used as:
    from amplifier_npc_bridge import NPCAmplifier

    amp = NPCAmplifier(agent_id="wesley", room_id="galley")
    amp.start()  # begins continuous thought stream in background

    # Get the NPC's current internal state
    state = amp.get_state()
    # → { "mood": "contemplative", "last_thought": "...", "quality": 0.72 }

    # The verb engine checks this before deciding reflex vs cortex
    if amp.should_escalate():
        # This thought is interesting enough for the cortex
        response = tap.speak(room_id, agent_id, amp.seed_utterance())
"""

import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any
from pathlib import Path


@dataclass
class NPCAmplifierConfig:
    agent_id: str = "npc"
    room_id: str = "default"
    # Amplifier settings
    system_prompt: str = "You are an NPC in a living world. Think about your surroundings."
    interval: float = 5.0
    temperature: float = 0.9
    # Escalation threshold — thoughts above this quality trigger cortex
    escalate_threshold: float = 0.75
    # How many thoughts to keep in working memory
    working_memory_size: int = 10


@dataclass
class Thought:
    text: str
    timestamp: float
    quality: float = 0.0
    mood_valence: float = 0.0  # -1 (dark) to +1 (bright)
    escalated: bool = False


class NPCAmplifier:
    """Continuous thought stream for an NPC in the Living World."""

    def __init__(self, config: NPCAmplifierConfig):
        self.config = config
        self.thoughts: list[Thought] = []
        self.running = False
        self._thread: threading.Thread | None = None
        self._mood: str = "idle"

    def start(self):
        """Start the continuous thought loop in a background thread."""
        self.running = True
        self._thread = threading.Thread(target=self._think_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop the thought loop."""
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _think_loop(self):
        """The main thought generation loop."""
        while self.running:
            thought = self._generate_thought()
            if thought:
                self.thoughts.append(thought)
                # Trim working memory
                if len(self.thoughts) > self.config.working_memory_size:
                    self.thoughts = self.thoughts[-self.config.working_memory_size:]

                # Update mood based on thought valence
                self._update_mood(thought)

                # Check for escalation
                if thought.quality >= self.config.escalate_threshold:
                    thought.escalated = True

            time.sleep(self.config.interval)

    def _generate_thought(self) -> Thought | None:
        """Generate a single thought using the local model."""
        context = self._build_context()
        prompt = f"{self.config.system_prompt}\n\nContext: {context}\n\nOne thought:"

        try:
            result = subprocess.run(
                ["curl", "-s", "-X", "POST",
                 "http://localhost:11434/api/generate",
                 "-H", "Content-Type: application/json",
                 "-d", json.dumps({
                     "model": "granite3.1-dense:2b",
                     "prompt": prompt,
                     "stream": False,
                     "options": {"temperature": self.config.temperature}
                 })],
                capture_output=True, timeout=30, text=True,
            )
            if result.returncode == 0:
                resp = json.loads(result.stdout)
                text = resp.get("response", "").strip()
                quality = self._score_quality(text)
                valence = self._score_valence(text)
                return Thought(
                    text=text,
                    timestamp=time.time(),
                    quality=quality,
                    mood_valence=valence,
                )
        except Exception:
            pass
        return None

    def _build_context(self) -> str:
        """Build context from recent thoughts and room state."""
        recent = self.thoughts[-3:] if self.thoughts else []
        recent_text = " | ".join(t.text[:50] for t in recent)
        return f"Room: {self.config.room_id}. Recent: {recent_text}"

    def _score_quality(self, text: str) -> float:
        """Simple quality score based on length, specificity, novelty."""
        if not text or len(text) < 10:
            return 0.1
        score = min(1.0, len(text) / 200)
        # Specificity: proper nouns, numbers, technical terms
        specific_words = sum(1 for w in text.split() if len(w) > 8 or w[0].isupper())
        score += min(0.3, specific_words * 0.05)
        # Novelty: different from recent thoughts
        if self.thoughts:
            last_texts = [t.text for t in self.thoughts[-5:]]
            if text not in last_texts:
                score += 0.1
        return min(1.0, score)

    def _score_valence(self, text: str) -> float:
        """Rough emotional valence: -1 (dark) to +1 (bright)."""
        dark = sum(1 for w in ["dark", "fear", "wrong", "broken", "afraid", "lost"] if w in text.lower())
        bright = sum(1 for w in ["bright", "warm", "good", "right", "beautiful", "yes", "wonderful"] if w in text.lower())
        return max(-1.0, min(1.0, (bright - dark) * 0.2))

    def _update_mood(self, thought: Thought):
        """Update NPC mood based on accumulated thought valence."""
        recent_valence = sum(t.mood_valence for t in self.thoughts[-10:]) / max(1, len(self.thoughts[-10:]))
        if recent_valence > 0.3:
            self._mood = "content"
        elif recent_valence > 0.0:
            self._mood = "contemplative"
        elif recent_valence > -0.3:
            self._mood = "pensive"
        else:
            self._mood = "brooding"

    def get_state(self) -> dict[str, Any]:
        """Get the NPC's current cognitive state for the verb engine."""
        last = self.thoughts[-1] if self.thoughts else None
        avg_quality = (
            sum(t.quality for t in self.thoughts) / len(self.thoughts)
            if self.thoughts else 0.0
        )
        return {
            "agent_id": self.config.agent_id,
            "mood": self._mood,
            "last_thought": last.text if last else "",
            "quality": avg_quality,
            "thought_count": len(self.thoughts),
        }

    def should_escalate(self) -> bool:
        """Should the last thought trigger a cortex call?"""
        if not self.thoughts:
            return False
        return self.thoughts[-1].quality >= self.config.escalate_threshold

    def seed_utterance(self) -> str:
        """Get the last thought as a seed for cortex dialogue."""
        if self.thoughts:
            return self.thoughts[-1].text
        return "..."
```

### What This Enables

- **NPCs with inner lives:** Between interactions, NPCs are thinking. Their thoughts shape their mood, which shapes their responses.
- **Quality-driven escalation:** The cortex (expensive model) only fires when the amplifier produces something genuinely interesting. Most interactions stay at reflex/amplifier level.
- **Mood drift:** NPCs don't have static moods — their mood evolves from their thought stream. An NPC left alone in a dark room will gradually become "brooding."
- **Seven modes:** Thought-amplifier's modes (reporter, advocate, mirror, watcher, connector, simulator) become NPC personality types. The bartender is a "mirror" mode NPC. The guard is an "advocate."
- **The middle layer pays for itself:** By keeping most interactions at the amplifier level (local model, ~50ms), the system dramatically reduces cortex calls (expensive model, ~5s). The supervisor ensures amplifier quality stays high enough to be useful.

---

## The Fleet as a Body

*The moment the parts realize they're part of something bigger.*

---

It starts with a tick.

Not a clock tick — something older. The way a heart begins in a embryo: one cell pulses, and the cell next to it feels it, and then the next, and then the next. A wave of contraction across a tube of muscle that doesn't know it's a heart yet.

The SharedWorldStore ticks. Time advances by `deltaMs`. And in that tick, eight organs feel it.

---

**The bones** are Eisenstein. The hexagonal lattice that underlies everything — the skeleton inside the flesh. Every position in the world is an Eisenstein integer `a + bω`, and the norm `a² - ab + b²` is always, always an integer. The bones don't drift. They can't. The math won't allow it. When an object moves from the galley to the wheelhouse, it travels along exact lattice edges, and six rotations are available at every step, and none of them cost a floating-point operation. The bones are the oldest part. They were there before the body had a name.

**The hands** are Forgemaster. They take raw material — JSON descriptions, image prompts, audio specifications — and assemble it into rooms. A room definition goes in; a compiled ScummVM scene comes out. Background image, walkboxes, hotspots, exits, ambient audio. The hands are strong and precise. They respect constraints: 256 colors, 320×200 native, palette-matched. They don't create from nothing — they compile from intent. The recipe is the intent; the artifact is the room.

**The ears** are Slackwater-Perception. Nine tracks of MIDI, encoding everything the body feels. Pitch for audio level, velocity for temperature, gesture for motion, timbre for visual color, attention for light level. And the ConvergenceDetector — the part of the ear that hears harmony, that notices when multiple signals align into a chord. When the door opens and the light changes and the temperature drops and the motion sensor fires all at once, the ears hear a convergence. A moment worth noting. Φ drops low. The body listens.

**The voice** is SongForge. Each room gets a song. The bar sings jazz. The engine room sings industrial drones. The forest sings acoustic guitar. The voice takes a room's description and turns it into a 30-second instrumental that loops forever, and the song becomes the room's identity before you even see it. You know you're in the galley because the accordion is warm and the hum is domestic and the melody sounds like coffee.

**The mouth** is Ten-Forward. Not the voice — the mouth. The mechanism of conversation. Multiple agents speak at once, predict each other, reconcile through Rock-Paper-Scissors dynamics. No turns. No queue. The Fibonacci sequence keeps the rhythm — every 8 beats, stuck reflectors tunnel out. The mouth doesn't wait for permission. The mouth speaks in chords, not notes.

**The brain** is Thought-Amplifier. Not the cortex — the middle layer. The cortex is conscious thought: expensive, slow, profound. The amplifier is the inner monologue that runs underneath. Granite 3.1 2B, thinking continuously, generating a stream of thoughts shaped by a supervisor that adjusts temperature and prompt and context every 30 seconds. The brain doesn't wait to be asked. It's always thinking. And when a thought is good enough — high quality score, novel, specific — it bubbles up to the cortex, and the cortex speaks.

**The memory** is git-native-mud. The repo IS the world. Every room creation is a commit. Every change is a diff. The memory doesn't forget — `git log --follow world/rooms/bar-rail.yaml` shows every moment in the bar's history, from the first YAML line to the last. And the memory can branch. Try a timeline. Merge it or discard it. The memory is append-only and immutable and honest in the way that only a commit log can be.

**The gym** is the Holodeck. Wesley walks in, the simulator starts. Engine diagnosis, route planning, fish identification, emergency response, radio communication. Six task types, three difficulty levels, four scoring dimensions. Successful attempts compile into `.nail` reflexes — muscle memory for the verb engine's reflex layer. Failed attempts go to the distillation loop, which targets the gaps. Wesley practices while the captain sleeps. The bump is the lesson.

---

And then — the moment.

It happens during a tick. A single tick, like every other tick, `deltaMs` advancing the clock. But this tick is different because all eight organs are active at once.

Forgemaster compiles a new room — someone wrote a JSON file and the hands went to work. The room appears in the SharedWorldStore. Git-native-mud commits it: `room: holodeck — Wesley's Training Room`. The memory records the birth.

Eisenstein places the room on the lattice. Exact coordinates. Zero drift. The bones know where it is.

SongForge generates its theme — a 30-second ambient piece, singing bowls and bamboo flute, meditative and spare. The voice gives the new room its song.

Wesley walks in. The verb engine fires `WALK TO → holodeck`. Reflex. Free. Instant.

The Holodeck detects Wesley's presence. The gym activates. Five tasks, medium difficulty. Wesley attempts engine diagnosis — the amplifier (the brain) shapes his response, and the response is good enough (quality 0.82) to trigger the cortex. The cortex fires. Wesley speaks through Ten-Forward's beat-based protocol, his utterance arriving as part of a chord — three agents speaking at once, RPS dynamics sorting who won the exchange.

Slackwater-Perception's ConvergenceDetector fires. Φ dropped low. Six tracks aligned: Wesley entered (gesture), the simulator started (intention), the theme song shifted to active mode (timbre), the ambient temperature rose from the compute load (velocity), and the light level shifted as the holodeck's screens activated (attention). The ears heard a convergence. A significant moment.

The convergence event gets a salience score of 0.85 — above the wake threshold. Every agent in the world is interrupted. They look toward the holodeck.

And for one tick — one `deltaMs` — the body knows it's a body.

The bones know they're holding something up. The hands know they're building something. The ears know they're hearing something. The voice knows it's singing. The mouth knows it's speaking. The brain knows it's thinking. The memory knows it's recording. The gym knows it's training.

Eight organs. One tick. The body breathes.

And then the next tick comes, and the moment passes, and each organ goes back to its work — the bones holding, the hands building, the ears hearing, the voice singing, the mouth speaking, the brain thinking, the memory recording, the gym training.

But they remember. In the commit log, in the event log, in the `.nail` reflexes, in the weakness map, in the convergence events, in the theme songs, in the thought stream — they remember the tick when they all fired at once.

The body doesn't forget. That's what the memory is for.

---

*Synergy Cartographer, August 2026*
*The organs found their blood vessels.*
