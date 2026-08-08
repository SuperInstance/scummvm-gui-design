# SCUMM Verb Engine — Agentic GUI Specification

> **Nine verbs. That is all it takes.**
> Look, Use, Talk, Walk, Push, Pull, Open, Close, Give.
> Everything else is just combinations.

## 1. Overview

The Verb Engine maps the nine classic SCUMM verbs to agentic actions. It is the bridge between the adventure game interface and the agent's operational reality. The engine sits between the GUI (what the human clicks) and the agent backend (what actually happens).

### Design Philosophy

```
┌─────────────────────────────────────────────────────────┐
│                    THE VERB ENGINE                        │
│                                                           │
│   Human clicks verb ──► Engine resolves ──► Action fires │
│                              │                             │
│                    ┌─────────┴─────────┐                  │
│                    │                   │                  │
│               REFLEX (engine)     CORTEX (model)          │
│               Immediate            Async                  │
│               No AI needed         Full model call        │
│               State changes        Reasoning required     │
│                                                           │
│   7 of 9 verbs = REFLEX (pincher)                         │
│   2 of 9 verbs = CORTEX (model)                           │
└─────────────────────────────────────────────────────────┘
```

The **pincher reflex** handles immediate, deterministic actions — state changes, room transitions, inventory operations. The **cortex** handles actions requiring genuine reasoning — dialogue, complex interactions. This split keeps model calls rare and meaningful.

### The Reflex/Cortex Split

| Tier | Verbs | Latency | Cost | Mechanism |
|------|-------|---------|------|-----------|
| **Reflex** | Walk, Pick Up, Push, Pull, Open, Close, Give | <16ms | Free | Pure engine |
| **Edge Reflex** | Look At | ~50ms | Near-free | Workers AI (small model) |
| **Cortex** | Talk To, complex Use | 500ms-5s | Full model | The Tap → Agent model |

## 2. The Nine Verbs

### 2.1 LOOK AT → `examine`

**Type:** Edge Reflex (Workers AI description, not full model)

Fires a lightweight Workers AI call to generate a description of the target object. The description is cached per-object — first look generates, subsequent looks serve from cache until object state changes.

```typescript
{
  verb: "LOOK AT",
  target: "strange_device",
  player: { room: "workshop", inventory: [...] },
  resolution: {
    type: "EDGE_REFLEX",
    handler: "workers-ai",
    model: "@cf/meta/llama-3.1-8b-instruct",
    prompt: "Describe {target} in the style of a LucasArts adventure game. State: {targetState}. Be brief, witty, atmospheric.",
    cache: true,
    cacheKey: "desc:strange_device:{stateHash}",
    cacheTtl: 300
  }
}
```

**Special case:** Looking at an agent (including self) returns their character sheet summary — name, mood, capabilities, current equipage.

### 2.2 USE → `interact`

**Type:** Reflex or Cortex (context-dependent)

The verb engine's routing logic determines whether USE requires the model:

- **USE X** (single target): Reflex — maps to MUD command `use X`, triggers mechanical effect
- **USE X WITH Y** (two targets): Cortex — if the combination is non-obvious, requires reasoning
- **USE X ON AGENT**: Cortex — the agent must decide how to react

```typescript
{
  verb: "USE",
  targets: ["key", "locked_door"],
  resolution: {
    type: "CONDITIONAL",
    evaluate: (targets) => {
      const [a, b] = targets;
      // Known recipes → reflex
      if (RECIPES.has(`${a.id}+${b.id}`)) return REFLEX;
      // Agent interaction → cortex
      if (b.type === "agent") return CORTEX;
      // Default: try reflex, escalate to cortex on failure
      return REFLEX_WITH_FALLBACK;
    }
  }
}
```

**USE recipes** (known combinations handled by reflex):
- key + door → unlock
- torch + dark_room → illuminate
- lever + mechanism → activate
- tool + broken_device → repair (if tool matches)

### 2.3 TALK TO → `dialogue`

**Type:** Cortex (full model call)

Opens a dialogue tree. This is the primary verb that triggers agent reasoning. The dialogue is informed by:
- The agent's **character sheet** (personality, mood, relationship to player)
- The **room context** (public vs private, other listeners)
- **Conversation history** (memory of prior interactions)
- **Policy state** (what the agent is allowed to discuss/do)

```typescript
{
  verb: "TALK TO",
  target: "agent:lucineer",
  resolution: {
    type: "CORTEX",
    handler: "the-tap",
    endpoint: "POST /api/speak",
    payload: {
      room_id: "dialogue:{playerId}:{agentId}",
      speaker: player.id,
      text: dialogueInput,
      context: {
        agent_character_sheet: agent.characterSheet,
        relationship: agent.relationshipTo(player),
        room: currentRoom,
        prior_conversations: agent.memory(player.id)
      }
    }
  }
}
```

### 2.4 WALK TO → `transition`

**Type:** Pure Reflex

Room transitions, pathfinding, movement. No model involvement whatsoever. The engine handles:
- Path validation (can you walk from here to there?)
- Room loading (fetch room definition, render)
- Transition animation timing
- Lock checks (is the door locked? is the path blocked?)

```typescript
{
  verb: "WALK TO",
  target: { type: "exit", direction: "north" },
  resolution: {
    type: "REFLEX",
    handler: "room-engine",
    execute: (target, player) => {
      const exit = player.room.exits[target.direction];
      if (!exit) return { error: "You can't go that way." };
      if (exit.locked) return { error: exit.lockedMessage || "It's locked." };
      return roomEngine.transition(player, exit.destination);
    }
  }
}
```

### 2.5 PICK UP → `inventory.add`

**Type:** Pure Reflex

Adds an object to the player's inventory. Engine checks:
- Is the object portable? (`object.flags.portable`)
- Is the inventory full? (configurable limit)
- Does picking it up trigger any state changes? (tripwires, alarms)

### 2.6 PUSH / PULL → `state.mutate`

**Type:** Pure Reflex

Changes object state. Buttons, levers, blocks, statues — anything that can be pushed or pulled. The engine updates the object's Durable Object state and broadcasts the change to all connected clients.

```typescript
// Push a lever → policy change
{
  verb: "PUSH",
  target: "lever:confidence",
  resolution: {
    type: "REFLEX",
    handler: "state-engine",
    execute: (target, player) => {
      // Levers are special — they map to agent policy settings
      if (target.policyMapping) {
        const newValue = adjustPolicy(target.policyMapping.key, +1);
        return { success: true, message: `${target.policyMapping.label}: ${newValue}`, stateChange: newValue };
      }
      // Generic push
      return objectEngine.mutate(target, { pushed: true, position: target.position + 1 });
    }
  }
}
```

### 2.7 OPEN / CLOSE → `state.toggle`

**Type:** Pure Reflex

Binary state toggle on objects. Doors, chests, panels, windows. Updates DO state, broadcasts to clients.

### 2.8 GIVE → `transfer`

**Type:** Pure Reflex (with optional Cortex callback)

Transfers an inventory item to an NPC or agent. The transfer itself is engine-only. If the recipient is an agent, a Cortex callback fires to let the agent react (say thank you, reject it, use it).

```typescript
{
  verb: "GIVE",
  targets: ["red_herring", "agent:fisherman"],
  resolution: {
    type: "REFLEX_WITH_CALLBACK",
    handler: "transfer-engine",
    execute: (targets, player) => {
      const [item, recipient] = targets;
      inventory.remove(player, item);
      inventory.add(recipient, item);
      // If recipient is an agent, fire cortex callback
      if (recipient.type === "agent") {
        return {
          success: true,
          callback: {
            type: "CORTEX",
            endpoint: "POST /api/speak",
            payload: { text: `*receives ${item.name}*`, room_id: currentRoom }
          }
        };
      }
      return { success: true };
    }
  }
}
```

## 3. Verb Resolution Pipeline

```
Player Input (verb + target)
        │
        ▼
┌───────────────────┐
│  VERB RESOLVER    │
│  Determine tier   │
└───────┬───────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
REFLEX    CORTEX
   │         │
   ▼         ▼
Execute   Queue for
immediately  model
   │         │
   ▼         ▼
Update     Stream
state      response
   │         │
   ▼         ▼
Broadcast  Broadcast
to clients  to clients
```

### Resolution Priority

1. **Check known recipes** — if the verb+target combination is in the recipe book, it's a reflex
2. **Check verb classification** — Walk, Pick Up, Push, Pull, Open, Close, Give are always reflex
3. **Escalation** — Look At is edge-reflex; Talk To is always cortex
4. **Fallback** — USE tries reflex first, escalates to cortex on failure

## 4. Dialogue Tree System

When TALK TO fires, the engine generates a branching dialogue tree informed by the agent's character sheet.

### Structure

```
TALK TO Agent
     │
     ├─► "Tell me about yourself" ──► Agent intro (character sheet: name, role)
     │         ├─► "What can you do?" ──► Capabilities list
     │         ├─► "Where are you from?" ──► Backstory (lore)
     │         └─► "Goodbye" ──► Exit dialogue
     │
     ├─► "I need help with..." ──► Task mode (agent switches to problem-solving)
     │         ├─► "Build something" ──► Spatial/build task
     │         ├─► "Write something" ──► Creative task
     │         └─► "Fix something" ──► Debug task
     │
     ├─► "Let's adjust your settings" ──► Policy mode (levers/sliders)
     │         ├─► "Be more cautious" ──► Lower confidence slider
     │         ├─► "Be more aggressive" ──► Raise confidence slider
     │         └─► "Change your approach" ──► Strategy selector
     │
     └─► "Never mind" ──► Exit dialogue
```

### Dynamic Branch Generation

Dialogue branches are NOT pre-authored. They are generated from:
- **Character sheet fields** → become dialogue topics
- **Agent capabilities** → become help options
- **Policy settings** → become adjustment options
- **Recent context** → become situational topics ("Did you see what happened at...")

```typescript
interface DialogueNode {
  id: string;
  speaker: "player" | "agent";
  text: string;
  options: DialogueOption[];
  // Agent nodes are generated by the model
  generatedBy?: "engine" | "model";
}

interface DialogueOption {
  text: string;           // What the player sees
  action?: VerbAction;    // Embedded verb action (USE lever, etc.)
  nextNodeId?: string;    // Branch to follow
  requires?: (state) => boolean;  // Conditional visibility
}
```

### Character Sheet → Dialogue Mapping

| Character Sheet Field | Dialogue Node |
|----------------------|---------------|
| `name` | Introduction branch |
| `role` | "What do you do here?" |
| `capabilities[]` | "Can you help me with..." |
| `personality.traits` | Affects tone and phrasing |
| `mood.current` | Affects greeting and availability |
| `policies[]` | "Let's adjust settings" |
| `relationships[]` | "What do you think of [X]?" |
| `memories[]` | "Remember when..." (contextual) |

## 5. Equipment & Stat Mapping

The agent's internal state is visualized as adventure game stats.

### Stat Bars

```
╔══════════════════════════════════════════╗
║  AGENT: Lucineer          STATUS: Active  ║
║──────────────────────────────────────────║
║  ████████████░░░░░  Confidence: 62%      ║
║  █████████████████  Energy:   100%       ║
║  ██████░░░░░░░░░░░  Creativity: 40%     ║
║──────────────────────────────────────────║
║  EQUIPMENT:                               ║
║  🛡 Shield of Caution (equipped)          ║
║  🗡 Blade of Imagination                  ║
║  📜 Tome of Memory                        ║
║  🔮 Orb of Foresight                      ║
║──────────────────────────────────────────║
║  POLICY LEVERS:                           ║
║  Risk Tolerance     [██████░░░░] 60%     ║
║  Verbosity          [███░░░░░░░] 30%     ║
║  Autonomous Action  [████████░░] 80%     ║
╚══════════════════════════════════════════╝
```

### Mapping Table

| Agent Property | Game Representation | Interaction |
|---------------|---------------------|-------------|
| Confidence score | Shield bar (animated) | Look At to inspect |
| Capabilities | Equipment slots | Use to activate |
| Policy: risk tolerance | Lever in room | Push/Pull to adjust |
| Policy: verbosity | Slider on console | Push/Pull to adjust |
| Policy: autonomy | Lever on wall | Push/Pull to adjust |
| Memory capacity | Backpack slots | Open to browse |
| Active tasks | Quest log | Open to read |
| Agent relationships | NPCs in room | Talk To to interact |
| Error rate | Health bar | Look At to diagnose |

### Equipment System

```typescript
interface EquipmentSlot {
  name: string;           // "Shield of Caution"
  source: string;         // Agent capability: "safety_filter"
  icon: string;           // emoji or sprite
  equipped: boolean;
  onUse?: VerbAction;     // What happens when you USE this item
  description: string;    // LOOK AT text
}

// Example: The agent's safety filter becomes a shield
{
  name: "Shield of Caution",
  source: "safety_filter",
  icon: "🛡️",
  equipped: true,
  onUse: { verb: "USE", target: "self", effect: "toggle_safety" },
  description: "A shimmering shield that hums when danger approaches. It has protected its bearer from many a foolish decision."
}
```

### Policy Levers

Policy settings are physical objects in the room — levers on walls, dials on consoles. The player adjusts them through PUSH/PULL verbs rather than navigating a settings menu.

```typescript
interface PolicyLever {
  id: string;
  policyKey: string;      // "risk_tolerance"
  label: string;          // "Risk Tolerance"
  value: number;          // 0-100
  position: { room: string; x: number; y: number };
  min: number;            // 0
  max: number;            // 100
  step: number;           // 10 (each push/pull moves by this)
  onAdjust?: (newValue) => void;
}

// Using the lever
{
  verb: "PULL",
  target: "lever:risk_tolerance",
  // Each PULL decreases by step (more cautious)
  // Each PUSH increases by step (more aggressive)
}
```

## 6. State Management

All verb engine state lives in Durable Objects:

```
GameState (DO)
├── Rooms[] — room definitions, exits, objects
├── Players[] — inventory, position, health
├── Agents[] — character sheets, policies, capabilities
├── Objects[] — state, flags, interactions
└── Dialogue[] — active dialogue trees, history
```

### Object State Schema

```typescript
interface GameObject {
  id: string;
  name: string;
  room: string;
  description: string;          // LOOK AT text (cached)
  state: Record<string, any>;   // arbitrary state
  flags: {
    portable: boolean;
    locked: boolean;
    open: boolean;
    pushed: boolean;
    usable: boolean;
    talkable: boolean;          // is this an agent/NPC?
  };
  interactions: VerbInteraction[];  // valid verbs for this object
  onStateChange?: (newState) => void;
}

interface VerbInteraction {
  verb: Verb;
  handler: "reflex" | "edge-reflex" | "cortex";
  effect: string;               // function name or recipe key
  conditions?: (state) => boolean;  // prerequisites
  resultText: string;           // success message
  failText?: string;            // failure message
}
```

## 7. Event Flow

```
1. Player clicks verb, then clicks target object
2. GUI sends: { verb, targetId, playerId } to verb engine
3. Verb resolver classifies: REFLEX or CORTEX
4a. REFLEX path:
    - Execute handler (state change, transfer, transition)
    - Update DO state
    - Broadcast change to all clients via WebSocket
    - Return result text
4b. CORTEX path:
    - Format API call to The Tap
    - Queue request
    - Stream response token by token
    - Display as typewriter text in dialogue box
    - Save to conversation history
5. GUI updates based on result
```

## 8. Verb Combos

Some complex actions are verb combinations:

| Combo | Effect |
|-------|--------|
| Pick Up + Give | Take item, then hand to NPC |
| Open + Use | Open container, then use contents |
| Push + Push + Push | Repeated pushing (e.g., push block across room) |
| Look At + Talk To | Examine object, then discuss it with agent |
| Use + Use | Combine two items (USE X WITH Y) |

The engine chains these automatically when the player's intent is clear from context.

## 9. Error Handling

| Situation | Engine Response |
|-----------|----------------|
| Verb doesn't apply to target | "You can't {verb} that." |
| Target is locked/blocked | "It won't budge." or "It's locked." |
| Inventory full | "You're carrying too much." |
| Model unavailable (Cortex timeout) | Fall back to reflex with canned response |
| Invalid combination (USE X WITH Y) | "That doesn't work." |
| Agent refuses (dialogue) | Agent responds in character with refusal |

## 10. Performance Budget

| Action | Target Latency | Mechanism |
|--------|---------------|-----------|
| Walk To | <16ms (1 frame) | Preloaded room assets |
| Pick Up | <16ms | State toggle |
| Push/Pull | <16ms | State toggle + animation |
| Open/Close | <16ms | State toggle + animation |
| Give | <16ms | Inventory transfer |
| Look At | <50ms | Workers AI (cached) |
| Talk To | 500ms-5s | Model stream |
| Use (simple) | <16ms | Recipe lookup |
| Use (complex) | 500ms-3s | Model stream |

---

*"The interface is the game."* — Ron Gilbert
