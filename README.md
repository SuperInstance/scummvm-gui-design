# scummvm-gui-design

**A SCUMM-like point-and-click interface for agent worlds. Nine verbs. Everything you need.**

This is the design system and TypeScript implementation for a retro adventure-game UI that lets humans interact with agent MUD worlds through a graphical point-and-click interface — the way Monkey Island let you interact with Melee Island.

## The Idea

Agent worlds (MUDs, text environments) are rich but inaccessible to non-technical users. SCUMM-style GUIs make them visual, tactile, and intuitive. You don't type commands — you click a verb, then click a thing in the scene.

**Nine verbs.** The complete vocabulary:

```
Look · Use · Talk · Walk · Push · Pull · Open · Close · Give
```

No context menus. No settings panels. Just verbs and nouns.

## What's Here

| File | What |
|------|------|
| `src/verbs.ts` | The thin waist — verb definitions, resolution, safety classification |
| `src/verb-engine.ts` | Engine: verb + target → outcome |
| `src/shared-world.ts` | Shared world state between MUD backend and SCUMM frontend |
| `NINE-VERBS.md` | Design meditation on the nine-verb vocabulary |
| `VERB-ENGINE.md` | Technical spec for the verb engine |
| `DUAL-PROJECTION.md` | How MUD rooms project as SCUMM scenes (and vice versa) |
| `IDEATION.md` | Extended design exploration |
| `CONTENT-FRAMEWORK.md` | Content authoring guide |
| `ASSET-SPEC.md` | Asset pipeline specification |
| `PHASER-MIGRATION.md` | Notes on migrating from raw canvas to Phaser |
| `SYNERGIES.md` | Cross-references with related fleet projects |
| `THE-DOOR.md` | Design doc: the first interactive object |
| `THE-FIRST-WALL.md` | Design doc: the first scene boundary |

## Tests

```bash
npm test
```

Uses Vitest. Tests cover verb resolution, safety classification, and the mutating/non-mutating boundary.

## Architecture

```
MUD World (text)                    SCUMM GUI (graphical)
     │                                    │
     │  MudEvent                          │  VerbAction
     │  (RoomDescription,                 │  (verb + target)
     │   ObjectDescription,               │
     │   NpcDialog,                       │
     │   ActionResult)                    │
     │                                    │
     └──────────►  SharedWorld  ◄─────────┘
                   (state sync)
                        │
                        ▼
                ┌───────────────┐
                │  Verb Engine  │
                │               │
                │ resolve(verb, │
                │   target)     │
                │   → outcome   │
                └───────────────┘
```

## Fleet Connections

- **mud2scummvm** (Rust): The parser that converts MUD text events into SCUMM scene data
- **the-tap** (Cloudflare): The agentic bar where agents gather — a SCUMM scene candidate
- **luciddreamer-ai**: The interactive fiction engine this GUI fronts
- **OpenRoom / openrooms**: Room-based agent spaces that could use SCUMM interaction

## Design Principles

1. **Nine verbs is enough** — complexity comes from the world, not the interface
2. **Safe vs. mutating** — safe verbs (Look, Walk, Talk) never change state; mutating verbs (Push, Pull, Open, Close, Give, Use) do
3. **Every verb is revocable** — the world should let you undo
4. **Dual projection** — MUD rooms and SCUMM scenes are two views of the same state

## License

Apache-2.0
