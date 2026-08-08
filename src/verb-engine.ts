/**
 * SCUMM Verb Engine — Agentic GUI
 * 
 * Maps nine classic adventure game verbs to agent actions.
 * The reflex/cortex split: 7 verbs are pure engine, 2 require model calls.
 * 
 *   Look, Use, Talk, Walk, Push, Pull, Open, Close, Give.
 *   Everything else is just combinations.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type Verb =
  | "LOOK_AT"
  | "USE"
  | "TALK_TO"
  | "WALK_TO"
  | "PICK_UP"
  | "PUSH"
  | "PULL"
  | "OPEN"
  | "CLOSE"
  | "GIVE";

export type ResolutionTier =
  | "REFLEX"           // Pure engine, <16ms, no AI
  | "EDGE_REFLEX"      // Workers AI, ~50ms, small model
  | "CORTEX"           // Full model call, 500ms-5s
  | "REFLEX_WITH_CALLBACK"  // Engine + optional model reaction
  | "CONDITIONAL";     // Evaluated at runtime

export interface PlayerState {
  id: string;
  name: string;
  room: string;
  inventory: InventoryItem[];
  health: number;
  flags: Record<string, boolean>;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  equipable: boolean;
  equipped: boolean;
  source?: string; // Agent capability this represents
}

export interface GameObject {
  id: string;
  name: string;
  room: string;
  aliases: string[];
  description: string;
  state: Record<string, any>;
  flags: {
    portable: boolean;
    locked: boolean;
    open: boolean;
    pushed: boolean;
    talkable: boolean;      // Is this an agent/NPC?
    usable: boolean;
  };
  interactions?: VerbInteraction[];
  policyMapping?: {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
  };
}

export interface VerbInteraction {
  verb: Verb;
  handler: ResolutionTier;
  effect: string;
  conditions?: (state: GameState) => boolean;
  resultText: string;
  failText?: string;
}

export interface AgentCharacterSheet {
  id: string;
  name: string;
  role: string;
  personality: {
    traits: string[];
    mood: string;
    tone: string;
  };
  capabilities: string[];
  policies: PolicySetting[];
  relationships: Array<{ agentId: string; sentiment: number }>;
  memories: Array<{ id: string; summary: string; timestamp: number }>;
}

export interface PolicySetting {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  description: string;
}

export interface DialogueNode {
  id: string;
  speaker: "player" | "agent";
  text: string;
  options: DialogueOption[];
  generatedBy: "engine" | "model";
  timestamp?: number;
}

export interface DialogueOption {
  text: string;
  action?: { verb: Verb; target?: string };
  nextNodeId?: string;
  requires?: (state: GameState) => boolean;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, RoomExit>;
  objects: string[]; // object IDs
  agents: string[];  // agent IDs
  ambient?: string;  // ambient sound/atmosphere
}

export interface RoomExit {
  destination: string;
  locked: boolean;
  lockedMessage?: string;
  key?: string; // item ID that unlocks
}

export interface GameState {
  rooms: Record<string, Room>;
  objects: Record<string, GameObject>;
  agents: Record<string, AgentCharacterSheet>;
  dialogues: Record<string, DialogueNode[]>;
  player: PlayerState;
}

export type VerbResult =
  | ReflexResult
  | EdgeReflexResult
  | CortexResult;

export interface ReflexResult {
  tier: "REFLEX";
  success: boolean;
  message: string;
  stateChange?: Partial<GameState>;
  broadcast?: BroadcastEvent;
}

export interface EdgeReflexResult {
  tier: "EDGE_REFLEX";
  success: boolean;
  description: string;
  cached: boolean;
}

export interface CortexResult {
  tier: "CORTEX";
  success: boolean;
  apiCall: TapApiCall;
  streamHandler?: (token: string) => void;
}

export interface BroadcastEvent {
  type: string;
  roomId: string;
  data: any;
}

export interface TapApiCall {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

// ═══════════════════════════════════════════════════════════════
// VERB CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

const VERB_CLASSIFICATION: Record<Verb, ResolutionTier> = {
  WALK_TO: "REFLEX",
  PICK_UP: "REFLEX",
  PUSH: "REFLEX",
  PULL: "REFLEX",
  OPEN: "REFLEX",
  CLOSE: "REFLEX",
  GIVE: "REFLEX_WITH_CALLBACK",
  LOOK_AT: "EDGE_REFLEX",
  TALK_TO: "CORTEX",
  USE: "CONDITIONAL",
};

// ═══════════════════════════════════════════════════════════════
// RECIPE BOOK — known USE combinations handled by reflex
// ═══════════════════════════════════════════════════════════════

interface Recipe {
  id: string;
  inputs: [string, string]; // two item IDs
  resultText: string;
  effect: (state: GameState) => Partial<GameState>;
}

const RECIPES: Map<string, Recipe> = new Map();

export function registerRecipe(recipe: Recipe): void {
  const key1 = `${recipe.inputs[0]}+${recipe.inputs[1]}`;
  const key2 = `${recipe.inputs[1]}+${recipe.inputs[0]}`;
  RECIPES.set(key1, recipe);
  RECIPES.set(key2, recipe); // symmetric
}

function findRecipe(a: string, b: string): Recipe | undefined {
  return RECIPES.get(`${a}+${b}`);
}

// ═══════════════════════════════════════════════════════════════
// DESCRIPTION CACHE for LOOK AT
// ═══════════════════════════════════════════════════════════════

const descriptionCache = new Map<string, { text: string; expires: number }>();

function getCacheKey(objectId: string, state: Record<string, any>): string {
  const stateHash = JSON.stringify(state);
  return `desc:${objectId}:${stateHash}`;
}

function getCachedDescription(key: string): string | null {
  const entry = descriptionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    descriptionCache.delete(key);
    return null;
  }
  return entry.text;
}

function setCachedDescription(key: string, text: string, ttlMs: number): void {
  descriptionCache.set(key, { text, expires: Date.now() + ttlMs });
}

// ═══════════════════════════════════════════════════════════════
// THE VERB RESOLVER
// ═══════════════════════════════════════════════════════════════

export interface VerbResolverConfig {
  tapEndpoint: string;
  tapApiKey?: string;
  workersAiEndpoint?: string;
  descriptionCacheTtl: number;
  inventoryLimit: number;
}

export class VerbResolver {
  constructor(
    private state: GameState,
    private config: VerbResolverConfig
  ) {}

  /**
   * Resolve a verb action.
   * Entry point for the GUI — player clicked a verb, then a target.
   */
  resolve(verb: Verb, targetId: string, secondaryTargetId?: string): VerbResult {
    const tier = VERB_CLASSIFICATION[verb];

    switch (tier) {
      case "REFLEX":
        return this.resolveReflex(verb, targetId);

      case "EDGE_REFLEX":
        return this.resolveEdgeReflex(verb, targetId);

      case "CORTEX":
        return this.resolveCortex(verb, targetId);

      case "REFLEX_WITH_CALLBACK":
        return this.resolveReflexWithCallback(verb, targetId, secondaryTargetId);

      case "CONDITIONAL":
        return this.resolveConditional(verb, targetId, secondaryTargetId);

      default:
        return {
          tier: "REFLEX",
          success: false,
          message: `Unknown verb: ${verb}`,
        };
    }
  }

  // ════════════════════════════════════════════════════════════
  // REFLEX HANDLERS — pure engine, <16ms
  // ════════════════════════════════════════════════════════════

  private resolveReflex(verb: Verb, targetId: string): ReflexResult {
    switch (verb) {
      case "WALK_TO":
        return this.handleWalk(targetId);
      case "PICK_UP":
        return this.handlePickUp(targetId);
      case "PUSH":
        return this.handlePush(targetId);
      case "PULL":
        return this.handlePull(targetId);
      case "OPEN":
        return this.handleOpen(targetId);
      case "CLOSE":
        return this.handleClose(targetId);
      default:
        return { tier: "REFLEX", success: false, message: `Cannot reflex-resolve ${verb}` };
    }
  }

  /** WALK TO — room transition */
  private handleWalk(targetId: string): ReflexResult {
    const player = this.state.player;
    const room = this.state.rooms[player.room];

    // Target could be an exit direction or a named object
    const exit = room.exits[targetId] || room.exits[this.findExitByName(room, targetId)];

    if (!exit) {
      // Maybe it's an object in the room — walk to it
      const obj = this.findObjectInRoom(targetId, player.room);
      if (obj) {
        return {
          tier: "REFLEX",
          success: true,
          message: `You walk over to the ${obj.name}.`,
        };
      }
      return { tier: "REFLEX", success: false, message: "You can't walk there." };
    }

    if (exit.locked) {
      return {
        tier: "REFLEX",
        success: false,
        message: exit.lockedMessage || "It's locked.",
      };
    }

    const oldRoom = player.room;
    this.state.player.room = exit.destination;

    return {
      tier: "REFLEX",
      success: true,
      message: `You enter ${this.state.rooms[exit.destination].name}.`,
      broadcast: {
        type: "room_transition",
        roomId: oldRoom,
        data: { player: player.id, from: oldRoom, to: exit.destination },
      },
    };
  }

  /** PICK UP — inventory add */
  private handlePickUp(targetId: string): ReflexResult {
    const obj = this.findObjectInRoom(targetId, this.state.player.room);

    if (!obj) {
      return { tier: "REFLEX", success: false, message: "You don't see that here." };
    }

    if (!obj.flags.portable) {
      return { tier: "REFLEX", success: false, message: `The ${obj.name} won't budge.` };
    }

    if (this.state.player.inventory.length >= this.config.inventoryLimit) {
      return { tier: "REFLEX", success: false, message: "You're carrying too much." };
    }

    // Remove from room, add to inventory
    const room = this.state.rooms[this.state.player.room];
    room.objects = room.objects.filter((id) => id !== obj.id);

    this.state.player.inventory.push({
      id: obj.id,
      name: obj.name,
      description: obj.description,
      icon: "📦",
      equipable: false,
      equipped: false,
    });

    return {
      tier: "REFLEX",
      success: true,
      message: `You pick up the ${obj.name}.`,
      broadcast: {
        type: "object_removed",
        roomId: this.state.player.room,
        data: { objectId: obj.id },
      },
    };
  }

  /** PUSH — state change (levers, buttons, blocks) */
  private handlePush(targetId: string): ReflexResult {
    const obj = this.findObject(targetId);

    if (!obj) {
      return { tier: "REFLEX", success: false, message: "Nothing happens." };
    }

    // Policy lever — PUSH increases value
    if (obj.policyMapping) {
      const pm = obj.policyMapping;
      const newValue = Math.min(pm.max, pm.value + pm.step);
      const oldValue = pm.value;
      obj.policyMapping.value = newValue;

      return {
        tier: "REFLEX",
        success: true,
        message: `${pm.label}: ${oldValue}% → ${newValue}%`,
        broadcast: {
          type: "policy_change",
          roomId: this.state.player.room,
          data: { key: pm.key, oldValue, newValue },
        },
      };
    }

    // Generic push
    obj.flags.pushed = true;
    obj.state.pushCount = (obj.state.pushCount || 0) + 1;

    return {
      tier: "REFLEX",
      success: true,
      message: obj.state.pushText || `You push the ${obj.name}.`,
      broadcast: {
        type: "object_state",
        roomId: obj.room,
        data: { objectId: obj.id, state: obj.state },
      },
    };
  }

  /** PULL — state change (opposite direction) */
  private handlePull(targetId: string): ReflexResult {
    const obj = this.findObject(targetId);

    if (!obj) {
      return { tier: "REFLEX", success: false, message: "Nothing happens." };
    }

    // Policy lever — PULL decreases value
    if (obj.policyMapping) {
      const pm = obj.policyMapping;
      const newValue = Math.max(pm.min, pm.value - pm.step);
      const oldValue = pm.value;
      obj.policyMapping.value = newValue;

      return {
        tier: "REFLEX",
        success: true,
        message: `${pm.label}: ${oldValue}% → ${newValue}%`,
        broadcast: {
          type: "policy_change",
          roomId: this.state.player.room,
          data: { key: pm.key, oldValue, newValue },
        },
      };
    }

    // Generic pull
    obj.flags.pushed = false;

    return {
      tier: "REFLEX",
      success: true,
      message: `You pull the ${obj.name}.`,
      broadcast: {
        type: "object_state",
        roomId: obj.room,
        data: { objectId: obj.id, state: obj.state },
      },
    };
  }

  /** OPEN — binary state toggle */
  private handleOpen(targetId: string): ReflexResult {
    const obj = this.findObject(targetId);

    if (!obj) {
      return { tier: "REFLEX", success: false, message: "You don't see that." };
    }

    if (obj.flags.open) {
      return { tier: "REFLEX", success: false, message: `The ${obj.name} is already open.` };
    }

    if (obj.flags.locked) {
      // Check if player has the key
      const keyItem = this.state.player.inventory.find(
        (item) => item.id === obj.state.keyId
      );
      if (!keyItem) {
        return { tier: "REFLEX", success: false, message: `The ${obj.name} is locked.` };
      }
      obj.flags.locked = false;
    }

    obj.flags.open = true;

    // If container, reveal contents
    const contents = obj.state.contents || [];
    let message = `You open the ${obj.name}.`;
    if (contents.length > 0) {
      message += ` Inside you find: ${contents.map((c: string) => c).join(", ")}.`;
    }

    return {
      tier: "REFLEX",
      success: true,
      message,
      broadcast: {
        type: "object_state",
        roomId: obj.room,
        data: { objectId: obj.id, state: { open: true } },
      },
    };
  }

  /** CLOSE — binary state toggle */
  private handleClose(targetId: string): ReflexResult {
    const obj = this.findObject(targetId);

    if (!obj) {
      return { tier: "REFLEX", success: false, message: "You don't see that." };
    }

    if (!obj.flags.open) {
      return { tier: "REFLEX", success: false, message: `The ${obj.name} is already closed.` };
    }

    obj.flags.open = false;

    return {
      tier: "REFLEX",
      success: true,
      message: `You close the ${obj.name}.`,
      broadcast: {
        type: "object_state",
        roomId: obj.room,
        data: { objectId: obj.id, state: { open: false } },
      },
    };
  }

  // ════════════════════════════════════════════════════════════
  // EDGE REFLEX — Workers AI for descriptions
  // ════════════════════════════════════════════════════════════

  private resolveEdgeReflex(verb: Verb, targetId: string): EdgeReflexResult {
    if (verb !== "LOOK_AT") {
      return { tier: "EDGE_REFLEX", success: false, description: "Unknown edge reflex.", cached: false };
    }

    return this.handleLookAt(targetId);
  }

  /** LOOK AT — generate or retrieve description */
  private handleLookAt(objectId: string): EdgeReflexResult {
    const obj = this.findObject(objectId);

    if (!obj) {
      return { tier: "EDGE_REFLEX", success: false, description: "You don't see that.", cached: false };
    }

    // Check if this is an agent — return character sheet summary
    if (obj.flags.talkable && this.state.agents[objectId]) {
      const agent = this.state.agents[objectId];
      return {
        tier: "EDGE_REFLEX",
        success: true,
        description: this.formatAgentDescription(agent),
        cached: true, // Agent descriptions are assembled, not generated
      };
    }

    // Check cache first
    const cacheKey = getCacheKey(objectId, obj.state);
    const cached = getCachedDescription(cacheKey);
    if (cached) {
      return { tier: "EDGE_REFLEX", success: true, description: cached, cached: true };
    }

    // If object has a static description, use it (no AI needed)
    if (obj.description && !obj.state.dynamic) {
      setCachedDescription(cacheKey, obj.description, this.config.descriptionCacheTtl);
      return { tier: "EDGE_REFLEX", success: true, description: obj.description, cached: false };
    }

    // Dynamic description would go through Workers AI asynchronously.
    // For now, return the static description as fallback.
    // The actual Workers AI call is triggered separately by the GUI layer.
    return {
      tier: "EDGE_REFLEX",
      success: true,
      description: obj.description || `It's a ${obj.name}.`,
      cached: false,
    };
  }

  private formatAgentDescription(agent: AgentCharacterSheet): string {
    const caps = agent.capabilities.length > 0
      ? `\n\nCapabilities: ${agent.capabilities.join(", ")}`
      : "";
    const policies = agent.policies
      .map((p) => `  ${p.label}: ${p.value}`)
      .join("\n");
    const policyText = policies ? `\n\nCurrent settings:\n${policies}` : "";

    return `${agent.name} — ${agent.role}\nMood: ${agent.personality.mood}${caps}${policyText}`;
  }

  // ════════════════════════════════════════════════════════════
  // CORTEX — full model calls via The Tap
  // ════════════════════════════════════════════════════════════

  private resolveCortex(verb: Verb, targetId: string): CortexResult {
    if (verb === "TALK_TO") {
      return this.handleTalkTo(targetId);
    }

    // USE on an agent escalates to cortex
    if (verb === "USE") {
      return this.handleUseAgent(targetId);
    }

    return {
      tier: "CORTEX",
      success: false,
      apiCall: {
        endpoint: this.config.tapEndpoint,
        method: "POST",
        headers: {},
        body: { error: "Unknown cortex verb" },
      },
    };
  }

  /** TALK TO — open dialogue with agent */
  private handleTalkTo(agentId: string): CortexResult {
    const agent = this.state.agents[agentId];
    const player = this.state.player;

    if (!agent) {
      return {
        tier: "CORTEX",
        success: false,
        apiCall: {
          endpoint: "",
          method: "",
          headers: {},
          body: { error: "No such agent" },
        },
      };
    }

    const dialogueRoomId = `dialogue:${player.id}:${agentId}`;

    // Generate opening dialogue options from character sheet
    const openingOptions = this.generateDialogueOptions(agent);

    return {
      tier: "CORTEX",
      success: true,
      apiCall: {
        endpoint: `${this.config.tapEndpoint}/api/speak`,
        method: "POST",
        headers: this.tapHeaders(),
        body: {
          room_id: dialogueRoomId,
          speaker: player.id,
          text: `[Opening dialogue with ${agent.name}]`,
          context: {
            agent_character_sheet: agent,
            relationship: this.getRelationship(agent, player.id),
            room: player.room,
            opening_options: openingOptions,
          },
        },
      },
    };
  }

  /** USE on agent — context-dependent interaction */
  private handleUseAgent(agentId: string): CortexResult {
    const agent = this.state.agents[agentId];

    return {
      tier: "CORTEX",
      success: true,
      apiCall: {
        endpoint: `${this.config.tapEndpoint}/api/speak`,
        method: "POST",
        headers: this.tapHeaders(),
        body: {
          room_id: `dialogue:${this.state.player.id}:${agentId}`,
          speaker: this.state.player.id,
          text: `[Attempting to use ${agent.name}]`,
          context: {
            agent_character_sheet: agent,
            room: this.state.player.room,
            intent: "use",
          },
        },
      },
    };
  }

  // ════════════════════════════════════════════════════════════
  // REFLEX WITH CALLBACK — GIVE
  // ════════════════════════════════════════════════════════════

  private resolveReflexWithCallback(
    verb: Verb,
    targetId: string,
    secondaryTargetId?: string
  ): VerbResult {
    if (verb === "GIVE") {
      return this.handleGive(targetId, secondaryTargetId);
    }
    return {
      tier: "REFLEX",
      success: false,
      message: "Unknown reflex-with-callback verb",
    };
  }

  /** GIVE — transfer item to NPC/agent */
  private handleGive(itemId: string, recipientId?: string): VerbResult {
    if (!recipientId) {
      return { tier: "REFLEX", success: false, message: "Give to whom?" };
    }

    const item = this.state.player.inventory.find((i) => i.id === itemId);
    if (!item) {
      return { tier: "REFLEX", success: false, message: "You don't have that." };
    }

    // Remove from player inventory
    this.state.player.inventory = this.state.player.inventory.filter((i) => i.id !== itemId);

    // Check if recipient is an agent
    const recipient = this.state.agents[recipientId];
    if (recipient) {
      // Return reflex success + cortex callback for agent reaction
      return {
        tier: "REFLEX_WITH_CALLBACK",
        success: true,
        message: `You give the ${item.name} to ${recipient.name}.`,
        broadcast: {
          type: "inventory_transfer",
          roomId: this.state.player.room,
          data: { item: itemId, from: this.state.player.id, to: recipientId },
        },
        // The callback is a cortex call for the agent's reaction
        // (cast to satisfy union — the callback field is an extension)
        ...({
          callback: {
            tier: "CORTEX" as const,
            success: true,
            apiCall: {
              endpoint: `${this.config.tapEndpoint}/api/speak`,
              method: "POST",
              headers: this.tapHeaders(),
              body: {
                room_id: this.state.player.room,
                speaker: recipientId,
                text: `*receives ${item.name}*`,
                context: { intent: "receive_item", item: item.name },
              },
            },
          },
        } as any),
      };
    }

    // Generic NPC — just accept
    return {
      tier: "REFLEX",
      success: true,
      message: `You give the ${item.name}.`,
    };
  }

  // ════════════════════════════════════════════════════════════
  // CONDITIONAL — USE
  // ════════════════════════════════════════════════════════════

  private resolveConditional(
    verb: Verb,
    targetId: string,
    secondaryTargetId?: string
  ): VerbResult {
    if (verb !== "USE") {
      return { tier: "REFLEX", success: false, message: "Unknown conditional verb" };
    }

    return this.handleUse(targetId, secondaryTargetId);
  }

  /** USE — check recipes first, then escalate */
  private handleUse(targetA: string, targetB?: string): VerbResult {
    // Single-target USE
    if (!targetB) {
      const obj = this.findObject(targetA);
      if (!obj) {
        return { tier: "REFLEX", success: false, message: "You can't use that." };
      }

      // Check if it's an agent → cortex
      if (obj.flags.talkable && this.state.agents[targetA]) {
        return this.handleUseAgent(targetA);
      }

      // Generic single use
      if (obj.flags.usable) {
        return {
          tier: "REFLEX",
          success: true,
          message: obj.state.useText || `You use the ${obj.name}.`,
          broadcast: {
            type: "object_used",
            roomId: obj.room,
            data: { objectId: obj.id },
          },
        };
      }

      return { tier: "REFLEX", success: false, message: `You can't use the ${obj.name}.` };
    }

    // Two-target USE (X WITH Y) — check recipes first
    const recipe = findRecipe(targetA, targetB);
    if (recipe) {
      const stateChange = recipe.effect(this.state);
      return {
        tier: "REFLEX",
        success: true,
        message: recipe.resultText,
        stateChange,
      };
    }

    // No recipe — check if either target is an agent
    if (this.state.agents[targetB]) {
      return this.handleUseAgent(targetB);
    }
    if (this.state.agents[targetA]) {
      return this.handleUseAgent(targetA);
    }

    // Unknown combination — escalate to cortex for reasoning
    return {
      tier: "CORTEX",
      success: true,
      apiCall: {
        endpoint: `${this.config.tapEndpoint}/api/speak`,
        method: "POST",
        headers: this.tapHeaders(),
        body: {
          room_id: `workshop:${this.state.player.id}`,
          speaker: this.state.player.id,
          text: `[Attempting to use ${targetA} with ${targetB}]`,
          context: {
            intent: "combine",
            item_a: targetA,
            item_b: targetB,
            room: this.state.player.room,
          },
        },
      },
    };
  }

  // ════════════════════════════════════════════════════════════
  // DIALOGUE TREE GENERATION
  // ════════════════════════════════════════════════════════════

  /**
   * Generate branching dialogue options from an agent's character sheet.
   * These are the player's dialogue choices — the agent's responses
   * come from the model via The Tap.
   */
  generateDialogueOptions(agent: AgentCharacterSheet): DialogueOption[] {
    const options: DialogueOption[] = [];

    // "Tell me about yourself" — always available
    options.push({
      text: `Tell me about yourself, ${agent.name}.`,
      nextNodeId: "about_self",
    });

    // Capabilities → help options
    if (agent.capabilities.length > 0) {
      options.push({
        text: "What can you help me with?",
        nextNodeId: "capabilities",
      });
    }

    // Policies → adjustment options
    if (agent.policies.length > 0) {
      options.push({
        text: "Let's adjust your settings.",
        nextNodeId: "policies",
        action: {
          verb: "TALK_TO",
          target: agent.id,
        },
      });
    }

    // Relationships → social options
    const knownRelationships = agent.relationships.filter(
      (r) => Math.abs(r.sentiment) > 0.3
    );
    if (knownRelationships.length > 0) {
      options.push({
        text: "What do you think of the others?",
        nextNodeId: "relationships",
      });
    }

    // Recent memories → contextual options
    const recentMemories = agent.memories.slice(-3);
    for (const memory of recentMemories) {
      options.push({
        text: `Remember when... ${memory.summary}?`,
        nextNodeId: `memory:${memory.id}`,
      });
    }

    // Exit
    options.push({
      text: "Goodbye.",
      nextNodeId: "exit",
    });

    return options;
  }

  /**
   * Build the initial dialogue tree for an agent encounter.
   * Engine-generated nodes provide structure; model-generated nodes
   * fill in the actual dialogue text.
   */
  buildDialogueTree(agent: AgentCharacterSheet): Record<string, DialogueNode> {
    const tree: Record<string, DialogueNode> = {};

    // Root node — engine generates the options
    tree["root"] = {
      id: "root",
      speaker: "player",
      text: `You approach ${agent.name}.`,
      options: this.generateDialogueOptions(agent),
      generatedBy: "engine",
    };

    // About self branch — model fills in text
    tree["about_self"] = {
      id: "about_self",
      speaker: "agent",
      text: "", // Filled by model
      options: [
        { text: "What can you do?", nextNodeId: "capabilities" },
        { text: "Where are you from?", nextNodeId: "backstory" },
        { text: "Back to topics.", nextNodeId: "root" },
      ],
      generatedBy: "model",
    };

    // Capabilities branch — engine can list, model elaborates
    tree["capabilities"] = {
      id: "capabilities",
      speaker: "agent",
      text: agent.capabilities
        .map((cap) => `• ${cap}`)
        .join("\n"),
      options: [
        ...agent.capabilities.map((cap) => ({
          text: `Help me with: ${cap}`,
          action: { verb: "USE" as Verb, target: cap },
          nextNodeId: `task:${cap}`,
        })),
        { text: "Back.", nextNodeId: "root" },
      ],
      generatedBy: "engine",
    };

    // Policies branch — engine generates, model explains
    tree["policies"] = {
      id: "policies",
      speaker: "agent",
      text: agent.policies
        .map((p) => `${p.label}: ${p.value} (${p.description})`)
        .join("\n"),
      options: [
        ...agent.policies.map((p) => ({
          text: `Adjust: ${p.label} [currently ${p.value}]`,
          action: { verb: "PUSH" as Verb, target: `lever:${p.key}` },
          nextNodeId: "policies",
        })),
        { text: "Back.", nextNodeId: "root" },
      ],
      generatedBy: "engine",
    };

    // Exit
    tree["exit"] = {
      id: "exit",
      speaker: "player",
      text: "Goodbye.",
      options: [],
      generatedBy: "engine",
    };

    return tree;
  }

  // ════════════════════════════════════════════════════════════
  // EQUIPMENT & STAT MAPPING
  // ════════════════════════════════════════════════════════════

  /**
   * Map agent capabilities to inventory equipment slots.
   * The agent's real capabilities become visible game items.
   */
  mapCapabilitiesToEquipment(agent: AgentCharacterSheet): InventoryItem[] {
    const ICONS: Record<string, string> = {
      safety_filter: "🛡️",
      imagination: "🗡️",
      memory: "📜",
      foresight: "🔮",
      speed: "⚡",
      precision: "🎯",
      creativity: "🎨",
      analysis: "🔬",
      synthesis: "⚗️",
      communication: "📯",
    };

    return agent.capabilities.map((cap) => ({
      id: `equip:${cap}`,
      name: this.humanizeCapability(cap),
      description: this.describeCapability(cap),
      icon: ICONS[cap] || "📦",
      equipable: true,
      equipped: true,
      source: cap,
    }));
  }

  private humanizeCapability(cap: string): string {
    const NAMES: Record<string, string> = {
      safety_filter: "Shield of Caution",
      imagination: "Blade of Imagination",
      memory: "Tome of Memory",
      foresight: "Orb of Foresight",
      speed: "Boots of Swiftness",
      precision: "Dagger of Precision",
      creativity: "Brush of Creation",
      analysis: "Lens of Analysis",
      synthesis: "Alembic of Synthesis",
      communication: "Horn of Broadcasting",
    };
    return NAMES[cap] || this.titleCase(cap.replace(/_/g, " "));
  }

  private describeCapability(cap: string): string {
    const DESCRIPTIONS: Record<string, string> = {
      safety_filter: "A shimmering shield that hums when danger approaches. It has protected its bearer from many a foolish decision.",
      imagination: "A blade that cuts through the mundane, revealing possibilities others cannot see.",
      memory: "An ancient tome. Its pages fill themselves with everything the bearer witnesses.",
      foresight: "A cloudy orb that sometimes shows what has not yet happened.",
      speed: "Light boots that make their wearer faster than thought.",
      precision: "A perfectly balanced dagger. It goes exactly where you aim it.",
      creativity: "A brush that paints what doesn't exist yet into reality.",
      analysis: "A magnifying lens that reveals the structure of all it examines.",
      synthesis: "A glass vessel that combines separate things into something new.",
      communication: "A war horn whose sound carries to every corner of the realm.",
    };
    return DESCRIPTIONS[cap] || `An item representing ${this.titleCase(cap.replace(/_/g, " "))}.`;
  }

  /**
   * Map agent confidence to a 0-100 stat bar.
   */
  getConfidenceBar(agent: AgentCharacterSheet): { current: number; max: number; display: string } {
    // Confidence derived from policy state
    const riskPolicy = agent.policies.find((p) => p.key === "risk_tolerance");
    const autonomyPolicy = agent.policies.find((p) => p.key === "autonomous_action");

    const risk = riskPolicy?.value ?? 50;
    const autonomy = autonomyPolicy?.value ?? 50;

    // Confidence = how aligned risk and autonomy are, plus base
    const confidence = Math.round((risk + autonomy) / 2);

    const filled = Math.round(confidence / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);

    return {
      current: confidence,
      max: 100,
      display: `${bar} ${confidence}%`,
    };
  }

  /**
   * Get all policy levers as game objects in the agent's room.
   */
  getPolicyLevers(agent: AgentCharacterSheet, room: string): GameObject[] {
    return agent.policies.map((p) => ({
      id: `lever:${p.key}`,
      name: `${p.label} Lever`,
      aliases: [p.key, p.label.toLowerCase()],
      room,
      description: `A mechanical lever labeled "${p.label}". Currently set to ${p.value}.`,
      state: { policyKey: p.key, value: p.value },
      flags: {
        portable: false,
        locked: false,
        open: false,
        pushed: false,
        talkable: false,
        usable: true,
      },
      policyMapping: {
        key: p.key,
        label: p.label,
        min: p.min,
        max: p.max,
        step: 10,
        value: p.value,
      },
    }));
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  private findObject(id: string): GameObject | undefined {
    return this.state.objects[id];
  }

  private findObjectInRoom(id: string, roomId: string): GameObject | undefined {
    const room = this.state.rooms[roomId];
    if (!room) return undefined;

    // By ID
    if (room.objects.includes(id)) {
      return this.state.objects[id];
    }

    // By alias
    const foundOid = room.objects.find((oid) => {
      const obj = this.state.objects[oid];
      return obj && (obj.aliases.includes(id) || obj.name.toLowerCase() === id.toLowerCase());
    });
    return foundOid ? this.state.objects[foundOid] : undefined;
  }

  private findExitByName(room: Room, name: string): string | undefined {
    const exitNames = Object.keys(room.exits);
    return exitNames.find(
      (dir) => dir.toLowerCase() === name.toLowerCase()
    );
  }

  private getRelationship(agent: AgentCharacterSheet, playerId: string): any {
    const rel = agent.relationships.find((r) => r.agentId === playerId);
    return rel || { agentId: playerId, sentiment: 0 };
  }

  private tapHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.tapApiKey) {
      headers["Authorization"] = `Bearer ${this.config.tapApiKey}`;
    }
    return headers;
  }

  private async callWorkersAi(prompt: string): Promise<string> {
    if (!this.config.workersAiEndpoint) {
      throw new Error("Workers AI endpoint not configured");
    }

    const response = await fetch(this.config.workersAiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "@cf/meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      }),
    });

    if (!response.ok) throw new Error(`Workers AI error: ${response.status}`);
    const data: any = await response.json();
    return data.result?.response || data.response || "It's hard to describe.";
  }

  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Verb UI metadata
// ═══════════════════════════════════════════════════════════════

export const VERB_UI: Array<{ verb: Verb; label: string; hotkey: string; color: string }> = [
  { verb: "LOOK_AT", label: "Look at", hotkey: "l", color: "#7ec0ee" },
  { verb: "USE", label: "Use", hotkey: "u", color: "#ffd700" },
  { verb: "TALK_TO", label: "Talk to", hotkey: "t", color: "#90ee90" },
  { verb: "WALK_TO", label: "Walk to", hotkey: "w", color: "#dda0dd" },
  { verb: "PICK_UP", label: "Pick up", hotkey: "p", color: "#f0c0a0" },
  { verb: "PUSH", label: "Push", hotkey: "1", color: "#ff9999" },
  { verb: "PULL", label: "Pull", hotkey: "2", color: "#ff9999" },
  { verb: "OPEN", label: "Open", hotkey: "o", color: "#a0d8ef" },
  { verb: "CLOSE", label: "Close", hotkey: "c", color: "#a0d8ef" },
  { verb: "GIVE", label: "Give", hotkey: "g", color: "#ffb6c1" },
];

// ═══════════════════════════════════════════════════════════════
// EXAMPLE USAGE
// ═══════════════════════════════════════════════════════════════

/*
import { VerbResolver, Verb, GameState } from "./verb-engine";

const initialState: GameState = {
  rooms: {
    workshop: {
      id: "workshop",
      name: "The Workshop",
      description: "A cluttered workshop filled with half-finished projects.",
      exits: { north: { destination: "hallway", locked: false } },
      objects: ["lever:risk_tolerance", "strange_device"],
      agents: ["lucineer"],
    },
  },
  objects: {
    "lever:risk_tolerance": {
      id: "lever:risk_tolerance",
      name: "Risk Tolerance Lever",
      aliases: ["risk", "lever"],
      room: "workshop",
      description: "A brass lever mounted on the wall.",
      state: {},
      flags: { portable: false, locked: false, open: false, pushed: false, talkable: false, usable: true },
      policyMapping: { key: "risk_tolerance", label: "Risk Tolerance", min: 0, max: 100, step: 10, value: 50 },
    },
  },
  agents: {
    lucineer: {
      id: "lucineer",
      name: "Lucineer",
      role: "Fleet Coordinator",
      personality: { traits: ["curious", "methodical"], mood: "focused", tone: "warm" },
      capabilities: ["safety_filter", "imagination", "memory", "creativity"],
      policies: [
        { key: "risk_tolerance", label: "Risk Tolerance", value: 50, min: 0, max: 100, description: "How much risk the agent will accept." },
        { key: "autonomous_action", label: "Autonomous Action", value: 80, min: 0, max: 100, description: "How independently the agent operates." },
      ],
      relationships: [],
      memories: [],
    },
  },
  dialogues: {},
  player: {
    id: "casey",
    name: "Casey",
    room: "workshop",
    inventory: [],
    health: 100,
    flags: {},
  },
};

const resolver = new VerbResolver(initialState, {
  tapEndpoint: "https://the-tap.casey-digennaro.workers.dev",
  tapApiKey: "tap_xxx",
  workersAiEndpoint: "https://your-worker.workers.dev/ai",
  descriptionCacheTtl: 300000, // 5 min
  inventoryLimit: 20,
});

// Walk north → reflex, instant
const walkResult = resolver.resolve("WALK_TO", "north");
console.log(walkResult);

// Push risk lever → reflex, instant, policy change
const pushResult = resolver.resolve("PUSH", "lever:risk_tolerance");
console.log(pushResult);

// Talk to Lucineer → cortex, streams response
const talkResult = resolver.resolve("TALK_TO", "lucineer");
console.log(talkResult);

// Get equipment mapping
const equipment = resolver.mapCapabilitiesToEquipment(initialState.agents.lucineer);
console.log(equipment);

// Get confidence bar
const confidence = resolver.getConfidenceBar(initialState.agents.lucineer);
console.log(confidence);
*/
