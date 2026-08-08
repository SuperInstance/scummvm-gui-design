# The Phaser Migration Plan

**From 2,600 lines of Canvas spaghetti to a framework that scales.**

**Status:** migration blueprint, 2026-08-08
**Author:** Lucineer (architect), with Casey DiGennaro
**Prototype:** `scummvm-prototype/index.html` — 7 rooms, 9 verbs, 4 NPCs, jukebox, radio, split-view
**Target:** Phaser 3.x + TypeScript, same custom systems, standard rendering

---

## 0. The Thesis

The prototype works. Every room renders, every verb resolves, every NPC talks. It is also 2,600 lines of vanilla Canvas commands in a single HTML file, and it cannot grow another room without pain. We are not fixing something broken — we are graduating something that works into something that scales.

Phaser replaces the rendering layer. It does not replace the soul. The verb engine, the MUD terminal, the dual-projection sync, the SharedWorldStore — those are ours, and they stay ours. Phaser just stops us from hand-rolling a game engine inside a canvas context.

---

## 1. WHAT STAYS — The Custom Pieces No Engine Has

These systems are the architecture. They are framework-agnostic by design. Phaser wraps them; it does not absorb them.

### 1.1 The Verb Engine (9 verbs, reflex/cortex split)

**Source:** `src/verb-engine.ts` — the `VerbResolver` class

The entire verb resolution system stays. This is the deepest custom piece:
- **7 reflex verbs** (WALK, PICK UP, PUSH, PULL, OPEN, CLOSE, GIVE) — pure engine, <16ms, no AI
- **1 edge reflex** (LOOK AT) — Workers AI or cached description
- **1 cortex verb** (TALK TO) — full model call via The Tap
- **1 conditional** (USE) — recipe book first, then escalate

Phaser's input system replaces the hotspot click detection, but the moment a click happens, it routes directly into `VerbResolver.resolve(verb, targetId)`. The verb engine doesn't know Phaser exists.

### 1.2 The MUD Terminal (Text Projection)

**Source:** `mud-terminal.html` — green-phosphor CRT terminal

The MUD terminal is the agent's eye. It stays as a separate DOM element alongside the Phaser canvas. The split-view architecture (`split-view.html`) already proves this works — MUD on the left, ScummVM on the right, SharedWorldStore in the middle.

The terminal does not become a Phaser scene. It is a peer projection, not a subordinate view. Phaser renders the pixels; the terminal renders the text. Neither knows about the other.

### 1.3 The Dual-Projection Sync (SharedWorldStore)

**Source:** `src/shared-world.ts` — `SharedWorldStore` class

This is the load-bearing wall. One world state, two projections, a perception deadband between them. The `SharedWorldStore`:
- Owns the canonical world state (rooms, objects, agents, players)
- Logs every mutation through `applyEvent()` with salience scoring
- Serves the MUD projection via `perceive()` (pull-based)
- Serves the ScummVM projection via `subscribe()` (push-based)
- Runs organic GC (hourly/daily/weekly salience floors)
- Enforces the round-trip invariant: `projectionsAgree(roomId)` must pass

Phaser's scene system subscribes to the SharedWorldStore. When the store emits a scene delta, the Phaser RoomScene reacts. But the store is the source of truth, not Phaser.

### 1.4 The FLUX Asset Pipeline

The asset generation pipeline (FLUX-2-max for room backgrounds, sprite generation for NPCs and objects) feeds into Phaser's loader. Phaser's `this.load.image()` replaces the manual `img.src` assignment, but the pipeline that generates the art stays.

### 1.5 The Cloudflare Workers Integration

**Source:** The Tap (`the-tap.casey-digennaro.workers.dev`)

The backend is Cloudflare Workers + D1 + Durable Objects. Phaser is a frontend framework. The Workers integration stays exactly as designed:
- `POST /api/speak` — NPC dialogue via The Tap
- `POST /api/perceive` — perception checks
- WebSocket room DOs — scene delta push
- D1 — event log persistence

Phaser's `fetch()` calls hit the same endpoints.

### 1.6 The Tide-Pool Security System

The multi-layer security model (input validation, rate limiting, content filtering, agent authentication) is backend policy. It runs in the Workers. Phaser sends requests; the tide pool filters them. No change.

### 1.7 The Audio Backend with Frequency Dial

**Source:** `radio.html`, jukebox system in `index.html`

The radio room and jukebox are deeply custom:
- 4 channels (2182 kHz, Podcast, Ambient, Static)
- Frequency dial with rotating knob
- Reel-to-reel tape deck animation
- VU meter with needle
- NPC reactions per channel
- Crossfade between rooms

This becomes a Phaser audio manager, but the channel system, the frequency mapping, and the NPC reaction logic stay. Phaser's `WebAudio` support replaces the raw `<audio>` elements with proper gain nodes for crossfade, but the radio state machine is ours.

---

## 2. WHAT PHASER REPLACES

The prototype currently hand-rolls five systems that Phaser has built-in. Each replacement is a net reduction in code.

### 2.1 Canvas Rendering → Phaser Scenes

**Before:** `drawBarRail()`, `drawAftDeck()`, `drawWheelhouse()`, `drawGalley()`, `drawEngineRoom()`, `drawAftCockpit()`, `drawRadioRoom()` — each 80-150 lines of `ctx.fillRect()` calls.

**After:** Each room becomes a Phaser scene with sprites, tilemaps, or generated textures. The hand-drawn pixel art translates to:
- Room backgrounds as pre-rendered images (already have 4 of 7 as JPGs)
- Animated elements (candle flicker, radar sweep, ocean waves, engine glow) as Phaser tweens and sprite animations
- NPCs as sprite sheets with idle bobbing
- Particle effects for heat shimmer, steam, spray

**Lines saved:** ~1,200 lines of `ctx.fillRect()` → ~300 lines of sprite configuration.

### 2.2 Custom Hotspot Detection → Phaser Input Manager

**Before:** HTML `<div class="hotspot">` elements positioned with percentage CSS, click handlers, manual hit-testing.

**After:** Phaser zones (`this.add.zone(x, y, w, h).setInteractive()`) with built-in pointer events, hover states, and input priority. Phaser handles overlap, z-ordering, and pointer lock automatically.

**Lines saved:** ~80 lines of DOM manipulation → declarative zone definitions.

### 2.3 Custom Room Transitions → Phaser Scene Transitions

**Before:** Manual fade overlay (`#room-transition`), 500ms timeout, unload/load hotspots, swap canvas rendering function, crossfade audio, sync localStorage.

**After:** `this.scene.transition({ target: 'RoomScene', data: { roomId: 'aft-deck' }, duration: 500 })` — Phaser handles the fade, the lifecycle, the pause/resume. Audio crossfade via the audio manager.

**Lines saved:** ~60 lines of manual transition → ~10 lines of Phaser config.

### 2.4 Custom Sprite Animation → Phaser Sprite System

**Before:** CSS `@keyframes npcBob`, manual `drawRiker()`/`drawCaptain()`/`drawCook()`/`drawDeckhand()`/`drawEngineerBot()` functions, each 20-30 lines of pixel placement.

**After:** NPC sprite sheets loaded once, placed as `this.add.sprite(x, y, 'riker')`, with `.play('idle')` animation. Phaser handles the frame loop, the bobbing, the direction facing.

**Lines saved:** ~200 lines of pixel drawing → ~50 lines of sprite atlas config.

### 2.5 Custom Audio Crossfade → Phaser Audio Manager

**Before:** Two `<audio>` elements, manual volume ramping, room-specific ambient tracks, jukebox state machine with 4 channels.

**After:** Phaser's `this.sound.add()` with `WebAudio` gain nodes, proper crossfade via tweening volume, positional audio for room ambients. The jukebox radio state machine stays as a custom audio backend class.

---

## 3. MIGRATION STEPS (Weekend Plan)

Two days. Ten steps. Each step produces a working build.

### Step 1: Set Up Phaser Project Structure (Saturday 09:00-10:00)

```
platos-shell/
├── package.json          (phaser, typescript, vite)
├── tsconfig.json
├── vite.config.ts
├── index.html            (canvas container + MUD terminal split)
├── src/
│   ├── main.ts           — Phaser game config + MUD terminal bootstrap
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── MenuScene.ts
│   │   ├── RoomScene.ts
│   │   ├── DialogueScene.ts
│   │   ├── InventoryScene.ts
│   │   ├── RadioScene.ts
│   │   └── MiniGameScene.ts
│   ├── systems/
│   │   ├── verb-engine.ts    — VerbResolver (from scummvm-gui-design)
│   │   ├── shared-world.ts   — SharedWorldStore (from scummvm-gui-design)
│   │   ├── audio-backend.ts  — Radio/jukebox/ambient manager
│   │   └── tap-client.ts     — The Tap API client
│   ├── objects/
│   │   ├── hotspot.ts        — Phaser zone + interaction
│   │   ├── npc.ts            — Character sprite + dialogue hook
│   │   └── inventory-item.ts — Inventory slot rendering
│   ├── data/
│   │   ├── rooms.ts          — Room definitions (from prototype ROOMS)
│   │   ├── responses.ts      — Verb×hotspot response table
│   │   ├── npc-dialogue.ts   — NPC dialogue trees
│   │   └── audio-map.ts      — Room→ambient track mapping
│   └── ui/
│       ├── verb-bar.ts       — 9-verb UI bar (Phaser DOM element or Canvas)
│       ├── status-bar.ts     — Location + agent count
│       └── crt-overlay.ts    — Scanline + vignette postFX
├── public/
│   ├── assets/
│   │   ├── rooms/            — 7 room backgrounds (JPG)
│   │   ├── npcs/             — NPC sprite sheets (PNG)
│   │   ├── objects/          — Object sprites (PNG)
│   │   └── audio/            — Ambient tracks + podcast episodes
│   └── styles/
│       └── terminal.css      — MUD terminal styling
└── tests/
    ├── verb-engine.test.ts
    ├── shared-world.test.ts
    └── projection-agreement.test.ts
```

**Deliverable:** Empty Phaser app boots, shows a loading bar, displays "◆ Plato's Shell ◆" on a black screen. MUD terminal HTML exists in a sidebar.

### Step 2: Port Bar-Rail Scene (Saturday 10:00-12:00)

The simplest room. One background image, one NPC (Riker), six hotspots, two exits.

- Load `assets/rooms/bar-rail.jpg` as the scene background
- Define six interactive zones matching the prototype hotspots
- Add Riker sprite at `55%, 38%` with idle bob animation
- Add candle flicker as a Phaser tween (alpha oscillation on glow sprites)
- Add bottle glint as periodic sparkle sprites
- Render the jukebox as a static sprite with an amber glow tween

**Deliverable:** Bar-rail renders in Phaser. You can see it. You can't interact yet.

### Step 3: Port the Verb Bar (Saturday 12:00-13:30)

The 9-verb bar is the primary interface. In the prototype it's an HTML grid. In Phaser it becomes a `DOMElement` (Phaser's DOM support) or a Canvas-rendered UI with the same look:

```
[Look at] [Use] [Talk to] [Walk to] [Pick up]
[Push]    [Pull] [Open]   [Close]  [Give]
```

- Click a verb → highlights (`selected` state)
- Verb line text appears: "▶ LOOK AT"
- Next hotspot click → calls `VerbResolver.resolve(selectedVerb, hotspotId)`
- Response renders in the response box (DOM overlay or Phaser text)

**Deliverable:** Full verb interaction loop works on the bar-rail scene. Click verb → click hotspot → see response. All 10 verbs × 6 hotspots functional.

### Step 4: Port Room Transitions and Navigation (Saturday 13:30-14:30)

- Implement `transitionToRoom(targetRoom)` using Phaser's scene transition
- Fade-to-black with room name overlay (matching prototype aesthetic)
- Audio crossfade via audio backend
- Sync room change to SharedWorldStore via `applyEvent('room_transition', ...)`
- Update status bar and location indicator

**Deliverable:** Walk from bar-rail → aft-deck → wheelhouse. Transitions are smooth, audio crossfades, state stays in sync.

### Step 5: Port All 7 Rooms (Saturday 14:30-18:00)

Each room follows the same pattern as bar-rail:
1. Define room data (background, hotspots, exits, NPCs)
2. Create scene configuration
3. Add animated elements (room-specific: radar sweep, ocean waves, engine glow, etc.)
4. Port response table (the massive `getResponse()` function becomes a data file)

Rooms in order of complexity:
1. **Bar-Rail** (done in Step 2)
2. **Radio Room** — canvas-only, no BG image, jukebox overlay
3. **Aft Deck** — night sky, stars, ocean, weather station
4. **Galley** — warm lamp lighting, coffee maker, porthole ocean
5. **Wheelhouse** — radar sweep, compass, chartplotter, most instruments
6. **Engine Room** — most animated (engine glow, belt rotation, generator vibration, heat shimmer)
7. **Aft Cockpit** — fishfinder sonar, spinning props, bait fish

**Deliverable:** All 7 rooms navigable. Every verb works on every hotspot. The game is playable.

### Step 6: Wire the SharedWorldStore Events (Saturday 18:00-19:00)

Connect Phaser's scene system to the SharedWorldStore:
- On scene start: `store.subscribe(roomId, (delta) => this.applySceneDelta(delta))`
- On hotspot interaction: `store.applyEvent(verb, actor, target, mutation)`
- Scene deltas update sprites, positions, states in real-time
- The MUD terminal (already running alongside) pulls from the same store

**Deliverable:** Change something in the MUD terminal → see it reflected in the Phaser scene. Change something in Phaser → see it in the MUD. The dual-projection invariant holds.

### Step 7: Port the Inventory System (Sunday 09:00-10:00)

- 3-slot inventory bar (prototype) → expandable grid in Phaser
- Items: life ring, coffee mug, compass (and future items)
- Pick up / give / use item interactions route through VerbResolver
- Inventory icons rendered as sprites
- `GIVE` triggers the reflex-with-callback path (inventory transfer + agent reaction via The Tap)

**Deliverable:** Pick up the life ring on the aft deck. Give coffee to the Captain. Give coffee to the engineer bot. All inventory interactions work.

### Step 8: Port the Audio System (Sunday 10:00-12:00)

The audio backend consolidates:
- **Room ambients** — one per room, crossfade on transition
- **Jukebox** — 4-channel frequency selector (2182, Podcast, Ambient, Static)
- **Radio room** — direct frequency dial, tape deck, VU meter
- **NPC narration** — podcast episodes from `ai-writings/`
- **SFX** — hotspot clicks, door opens, item pickup

Phaser's WebAudio integration provides:
- Gain nodes for crossfade (no more manual volume ramping)
- Positional audio for room-accurate sound staging
- Audio key management (load/unload per scene)

**Deliverable:** Walk from bar-rail to engine room — ambient crossfades smoothly. Use the jukebox — channel selection, NPC reactions, now-playing display all work. Radio room frequency dial is live.

### Step 9: Add Mini-Game Support (Sunday 12:00-14:00)

The prototype has hooks for:
- **Chess board** (galley table could host it)
- **Card game** (bar-rail, playing cards on the counter)

Add a `MiniGameScene` that overlays on top of the room scene:
- Phaser's scene overlay (runs simultaneously with room beneath)
- Chess: 8×8 grid, drag-and-drop pieces via Phaser input
- Cards: hand of cards, flip/tap to play
- Mini-games emit events to SharedWorldStore (other agents can observe moves)

**Deliverable:** Click the galley table → chess board appears. Click the bar counter → card game appears. ESC returns to room.

### Step 10: Port the MUD Terminal Alongside Phaser Canvas (Sunday 14:00-16:00)

The split-view (`split-view.html`) has proven this works. Final integration:
- Phaser canvas on the right (55% width)
- MUD terminal on the left (45% width)
- Both subscribe to the same SharedWorldStore
- Room transitions sync across both views
- The `◆` divider door between them stays

**Deliverable:** The complete Plato's Shell experience — Phaser game on one side, MUD terminal on the other, SharedWorldStore keeping them in lockstep. Ship it.

---

## 4. PHASER SCENE STRUCTURE

### BootScene
```
Loads all assets (room backgrounds, NPC sprites, audio files)
Shows loading bar with "◆ entering Plato's Shell ◆"
Transitions to MenuScene when loaded
```

### MenuScene
```
Title screen: "◆ PLATO'S SHELL ◆"
Character selection (future: choose your agent)
"Press any key to begin"
Transitions to RoomScene with initial room: bar-rail
```

### RoomScene (the workhorse)
```
Parameterized by roomId — one scene class, seven rooms
Loads room background + defines hotspots + places NPCs
Runs the animation loop (candle flicker, radar sweep, etc.)
Handles verb×hotspot interactions via VerbResolver
Subscribes to SharedWorldStore for scene deltas
Manages room-specific ambient audio

Phaser scene lifecycle:
  create(data) → setup room
  update(time, delta) → animations
  shutdown → unsubscribe from store, stop audio
```

### DialogueScene (overlay)
```
Launched on top of RoomScene when TALK TO hits a cortex verb
NPC portrait + dialogue tree (from VerbResolver.buildDialogueTree())
Options rendered as clickable Phaser text objects
Agent responses stream from The Tap API
Background room scene pauses (dimmed) but stays visible
Close returns control to RoomScene
```

### InventoryScene (overlay)
```
Launched on top of RoomScene
Grid of inventory items with icons
Click item → selects it for USE X WITH Y or GIVE X TO Y
Background room scene stays interactive (for clicking target)
Closes after item is used on target
```

### RadioScene (overlay)
```
Launched when USE jukebox or USE radio receiver
Full frequency dial interface
4 channels with visual feedback
Now-playing display
NPC reaction bubbles
Tape deck reel animation
Closes on ESC or channel selection
```

### MiniGameScene (overlay)
```
Generic mini-game container
Chess: 8×8 grid, piece sprites, move validation
Cards: hand display, play area, turn indicator
Communicates moves to SharedWorldStore
Other agents can perceive game state via MUD terminal
```

---

## 5. CODE STRUCTURE

### `src/main.ts` — Phaser Game Config

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { RoomScene } from './scenes/RoomScene';
import { DialogueScene } from './scenes/DialogueScene';
import { InventoryScene } from './scenes/InventoryScene';
import { RadioScene } from './scenes/RadioScene';
import { MiniGameScene } from './scenes/MiniGameScene';
import { SharedWorldStore } from './systems/shared-world';
import { createWorld } from './systems/shared-world';

// Create the canonical world state
const world = createWorld({
  rooms: { /* ... all 7 rooms ... */ },
  objects: { /* ... all objects ... */ },
  agents: { /* ... NPCs ... */ },
  players: { casey: { room: 'bar-rail', name: 'Casey' } },
});

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser-container',
  width: 320,
  height: 200,
  pixelArt: true,
  zoom: 3, // 320×200 → 960×600
  scene: [
    BootScene,
    MenuScene,
    RoomScene,
    DialogueScene,
    InventoryScene,
    RadioScene,
    MiniGameScene,
  ],
  // Custom systems injected via registry
  callbacks: {
    postBoot: (game) => {
      game.registry.set('world', world);
      game.registry.set('verbResolver', new VerbResolver(world.getState(), {
        tapEndpoint: 'https://the-tap.casey-digennaro.workers.dev/api',
        descriptionCacheTtl: 300000,
        inventoryLimit: 20,
      }));
    },
  },
};

new Phaser.Game(config);
```

### `src/scenes/RoomScene.ts` — The Main Game Loop

```typescript
export class RoomScene extends Phaser.Scene {
  private roomId!: string;
  private world: SharedWorldStore;
  private hotspots: Map<string, Phaser.GameObjects.Zone> = new Map();

  constructor() { super('RoomScene'); }

  init(data: { roomId: string }) {
    this.roomId = data.roomId;
    this.world = this.registry.get('world');
  }

  create() {
    // Load background
    const bgKey = `bg-${this.roomId}`;
    this.add.image(160, 100, bgKey);

    // Define hotspots from room data
    const room = this.world.getRoom(this.roomId);
    ROOM_DATA[this.roomId].hotspots.forEach(hs => {
      const zone = this.add.zone(
        this.pct(hs.x), this.pct(hs.y),
        this.pct(hs.w), this.pct(hs.h)
      ).setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => this.showHotspotName(hs.name));
      zone.on('pointerdown', () => this.handleHotspotClick(hs.id));
      this.hotspots.set(hs.id, zone);
    });

    // Place NPCs
    ROOM_NPCS[this.roomId]?.forEach(npcId => {
      const npcData = NPC_DATA[npcId];
      const sprite = this.add.sprite(
        this.pct(npcData.x), this.pct(npcData.y), npcId
      ).play('idle');
      sprite.setInteractive();
      sprite.on('pointerdown', () => this.handleHotspotClick(npcData.hotspotId));
    });

    // Room-specific animations
    this.setupRoomAnimations();

    // Subscribe to world store
    this.events.on('shutdown', () => {
      this.world.unsubscribe(this.roomId, this.handleSceneDelta);
    });
  }

  update(time: number) {
    // Room-specific per-frame updates (candle flicker, radar, etc.)
    this.updateRoomAnimations(time);
  }

  private handleHotspotClick(hsId: string) {
    const selectedVerb = this.registry.get('selectedVerb');
    if (!selectedVerb) { this.showResponse('Select a verb first.'); return; }
    const resolver = this.registry.get('verbResolver');
    const result = resolver.resolve(selectedVerb, hsId);
    this.processVerbResult(result, hsId);
  }
}
```

### `src/systems/verb-engine.ts` — The Custom Verb System

Direct copy from `scummvm-gui-design/src/verb-engine.ts`. No Phaser dependency. The `VerbResolver` class is framework-agnostic — it takes game state in, returns `VerbResult` out. Phaser calls it; it never calls Phaser.

### `src/systems/shared-world.ts` — The Dual-Projection Store

Direct copy from `scummvm-gui-design/src/shared-world.ts`. No Phaser dependency. The `SharedWorldStore` manages the canonical world state. Phaser scenes subscribe to it; the MUD terminal pulls from it. The store is the bridge.

### `src/systems/audio-backend.ts` — Audio Manager

```typescript
export class AudioBackend {
  private ambient: Phaser.Sound.BaseSound | null = null;
  private narration: Phaser.Sound.BaseSound | null = null;

  constructor(private soundManager: Phaser.Sound.BaseSoundManager) {}

  playRoomAmbient(roomId: string) {
    const track = ROOM_AUDIO[roomId];
    if (!track) return;
    if (this.ambient) {
      // Crossfade over 1.5s
      this.soundManager.tweenVolume(this.ambient, 0, 1500);
    }
    this.ambient = this.soundManager.add(track, { loop: true, volume: 0 });
    this.ambient.play();
    this.soundManager.tweenVolume(this.ambient, 0.6, 1500);
  }

  playJukeboxChannel(channelId: string) {
    // Routes to radio state machine
    // Plays narration track if available
    // Updates now-playing display
  }
}
```

### `src/objects/hotspot.ts` — Clickable Objects

```typescript
export class Hotspot extends Phaser.GameObjects.Zone {
  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    width: number, height: number,
    public readonly hotspotId: string,
    public readonly displayName: string,
  ) {
    super(scene, x, y, width, height);
    this.setInteractive({ useHandCursor: true });

    this.on('pointerover', () => {
      this.setStrokeStyle(1, 0xe8b840, 0.4);
    });
    this.on('pointerout', () => {
      this.setStrokeStyle(0);
    });
  }
}
```

### `src/objects/npc.ts` — Character Sprites

```typescript
export class NPC extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    texture: string,
    public readonly npcId: string,
    public readonly displayName: string,
    public readonly hotspotId: string,
  ) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Idle bob animation
    scene.tweens.add({
      targets: this,
      y: y - 4,
      duration: 2500,
      ease: 'Sine.inOut',
      yoyo: true,
      repeat: -1,
    });

    this.setInteractive({ useHandCursor: true });
  }
}
```

---

## 6. THE HIGH SCHOOLER EXPERIENCE

The goal: a 15-year-old should be able to add a room in an afternoon. No TypeScript, no Phaser knowledge required.

### YAML Room Definitions (like Narrat)

```yaml
# rooms/my-room.yaml
id: my-room
title: The Crow's Nest
description: >
  A small platform above the wheelhouse. Wind cuts through here.
  You can see the whole boat from up here — and the ocean beyond.
short_name: Crow's Nest
palette: darkblue
background: assets/rooms/crows-nest.jpg  # or auto-generated
exits:
  down:
    destination: wheelhouse
    label: "◆ WHEELHOUSE ◆"
hotspots:
  - id: hs-rail
    name: the railing
    x: 10%
    y: 30%
    w: 80%
    h: 10%
  - id: hs-view
    name: the view
    x: 10%
    y: 5%
    w: 80%
    h: 25%
  - id: hs-ladder
    name: the ladder down
    x: 45%
    y: 60%
    w: 10%
    h: 30%
npcs:
  - id: lookout
    name: The Lookout
    sprite: assets/npcs/lookout.png
    position: { x: 60%, y: 45% }
    dialogue: dialogue/lookout.md
audio:
  ambient: audio/ambient/wind.mp3
```

### Drop an Image, Get a Room

1. Drop `crows-nest.jpg` in `assets/rooms/`
2. Write `rooms/crows-nest.yaml`
3. The room appears in the game, connected via exits
4. Phaser loads the image, creates the hotspots, places the NPCs
5. All 9 verbs automatically work on every hotspot (default responses, overridable)

### Write Dialogue in Markdown

```markdown
<!-- dialogue/lookout.md -->

# The Lookout

## about_self
*I'm the eyes. Twenty years up here. I've seen whales breach at dawn
and container ships at midnight. The ocean doesn't surprise me anymore.*

## weather
*Wind's picking up. Barometer's falling. We're in for something tonight.*

## exit
*Keep your eyes open down there.*
```

Each `##` heading maps to a dialogue node ID. The engine generates the dialogue tree from the markdown structure. No code.

### The Verb System Is the Same 9 Verbs Everywhere

Every room, every object, every NPC — same interface:
```
[Look at] [Use] [Talk to] [Walk to] [Pick up]
[Push]    [Pull] [Open]   [Close]  [Give]
```

The verb bar never changes. What changes is what happens when you click. The YAML/Markdown defines the content. The engine defines the interface. The high schooler writes content, not code.

### What a New Room Looks Like (End-to-End)

1. **Generate art:** FLUX-2-max generates the room background (or draw it)
2. **Write YAML:** 20 lines defining hotspots, exits, NPCs
3. **Write dialogue:** Markdown file for each NPC
4. **Drop audio:** MP3 in the assets folder
5. **Done:** The room is playable. All verbs work. The MUD terminal can perceive it. The SharedWorldStore tracks it.

No Phaser code. No TypeScript. No canvas rendering. Just content.

---

## 7. MIGRATION RISK MATRIX

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phaser's pixel-art scaling doesn't match the prototype's CRT aesthetic | Medium | High | Use Phaser's `pixelArt: true` + `roundPixels: true` + custom shader for scanlines |
| Scene transition timing differs from prototype's 500ms fade | Low | Low | Phaser transition config maps 1:1 to the prototype's CSS transition |
| Audio crossfade gap during room transitions | Medium | Medium | Phaser WebAudio gain nodes tween smoothly; preload adjacent room ambients |
| SharedWorldStore subscribe/unsubscribe race on rapid room changes | Low | High | Phaser scene lifecycle guarantees: shutdown fires before next scene create |
| Verb response table (2,000+ entries) is too large for inline data | Medium | Low | Move to JSON data files, load per-room on demand |
| MUD terminal + Phaser canvas fight for DOM space on mobile | High | Medium | Responsive split (already solved in `split-view.html`): stack on mobile |

---

## 8. WHAT WE DO NOT BUILD

- **A custom physics engine** — Phaser has one. Use it for mini-games only.
- **A custom animation system** — Phaser tweens and sprite animations cover everything.
- **A custom input manager** — Phaser's input system is battle-tested.
- **A custom audio engine** — Phaser's WebAudio integration is better than raw `<audio>`.
- **A custom scene manager** — Phaser's scene system with transitions, sleep, wake, and overlay is exactly what we need.
- **A custom asset loader** — Phaser's loader handles caching, progress, and preloading.

We build: the verb engine, the world store, the dual-projection sync, the radio state machine, the NPC dialogue system, and the content pipeline. Those are ours. Everything else is Phaser's job.

---

## 9. THE INVARIANT

The dual-projection round-trip test (`projectionsAgree`) must pass in the Phaser build. If the Phaser scene shows an object that the MUD terminal doesn't list, or vice versa, the architecture is broken.

This test runs:
- On every scene transition
- On every verb resolution that changes state
- On every SharedWorldStore mutation
- In the CI pipeline on every commit

If it fails, the build is red. No exceptions.

---

*Migration plan by Lucineer, 2026-08-08. Grounded in 2,600 lines of working prototype code, 6,000 lines of design documents, and the conviction that the custom systems are worth keeping and the rendering system is worth replacing.*
