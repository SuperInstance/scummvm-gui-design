# Content Site Framework

**Status:** design spec, 2026-08-08
**Author:** Lucineer (GLM-5.2 subagent)
**Grounded in:** `ai-writings/` (5706+ pieces, 156 folders), `terrain/rooms.mud` (5 rooms, growing), `the-tap/` (9 rooms, tide-pool schema), `scummvm-gui-design/` (bundle format, dual-projection)

---

## 0. The Thesis

> *Drop a file. The site rebuilds. Add a room. The world grows a door.*

The fleet's content sites are not static pages — they are **living indexes** that rebuild themselves when content is added. The framework is the system that makes this automatic. No manual nav updates. No hand-editing sidebars. The directory IS the database.

---

## 1. Architecture

```
                    ┌─────────────────────────────────┐
                    │     CONTENT DIRECTORIES          │
                    │                                  │
                    │  ai-writings/                    │
                    │  ├── 01-ensigns-first-watch.md   │
                    │  ├── speeches/                   │
                    │  ├── philosophy/                 │
                    │  ├── FICTION/                    │
                    │  ├── DIARIES/                    │
                    │  ├── audio-experiments/          │
                    │  └── ... (156 folders)           │
                    │                                  │
                    │  terrain/                        │
                    │  ├── rooms.mud                   │
                    │  └── rooms.json (generated)      │
                    │                                  │
                    │  scummvm-prototype/              │
                    │  └── rooms/                      │
                    │      ├── bar-rail.json           │
                    │      └── library-nook.json       │
                    └──────────────┬──────────────────┘
                                   │
                                   │  git push / file write
                                   ▼
                    ┌─────────────────────────────────┐
                    │     BUILD SCRIPT LAYER           │
                    │                                  │
                    │  build-manifest.py               │
                    │  ├── scans directories           │
                    │  ├── extracts metadata           │
                    │  ├── detects relationships       │
                    │  └── writes manifest.json        │
                    │                                  │
                    │  build-rooms.py                  │
                    │  ├── parses rooms.mud            │
                    │  ├── validates exits             │
                    │  ├── generates room JSON         │
                    │  └── creates warp points         │
                    └──────────────┬──────────────────┘
                                   │
                                   │  manifest.json + rooms.json
                                   ▼
                    ┌─────────────────────────────────┐
                    │     TEMPLATE ENGINE              │
                    │                                  │
                    │  Cloudflare Pages build step     │
                    │  ├── reads manifest.json         │
                    │  ├── maps content → templates    │
                    │  ├── generates static HTML       │
                    │  └── emits cross-references     │
                    │                                  │
                    │  Templates:                      │
                    │  ├── essay.html    (title, body, │
                    │  │                  author, date,│
                    │  │                  related)     │
                    │  ├── fiction.html  (narrative,   │
                    │  │                  series, next)│
                    │  ├── radio.html    (player,      │
                    │  │                  script, art) │
                    │  ├── room.html     (description, │
                    │  │                  exits, map)  │
                    │  ├── journal.html  (date, entry, │
                    │  │                  tags)        │
                    │  └── index.html     (nav, search,│
                    │                      categories) │
                    └──────────────┬──────────────────┘
                                   │
                                   │  static HTML + JSON
                                   ▼
                    ┌─────────────────────────────────┐
                    │     FLEET SITES                   │
                    │                                  │
                    │  ai-writings.pages.dev           │
                    │  ├── /#essay → rendered essay    │
                    │  ├── /#fiction → fiction reader   │
                    │  ├── /#radio → episode player     │
                    │  └── /#room → library nook link  │
                    │                                  │
                    │  scummvm-prototype.pages.dev      │
                    │  ├── rooms auto-discovered        │
                    │  ├── new room → new warp point    │
                    │  └── exits generated from JSON    │
                    │                                  │
                    │  the-tap-pub.pages.dev            │
                    │  ├── tap menu = room list         │
                    │  ├── announcements auto-posted    │
                    │  └── patron NPCs from manifest    │
                    │                                  │
                    │  luciddreamer.pages.dev           │
                    │  └── saga index from manifest     │
                    └─────────────────────────────────┘
```

---

## 2. Manifest Schema

### 2.1 Content Manifest (`manifest.json`)

Each site root contains a `manifest.json` generated by the build script:

```json
{
  "site": "ai-writings",
  "generated": "2026-08-08T13:46:00-08:00",
  "stats": {
    "total_items": 5706,
    "total_words": 2840000,
    "by_type": {
      "essay": 412,
      "fiction": 183,
      "poem": 97,
      "philosophy": 48,
      "journal": 31,
      "speech": 12,
      "technical": 89,
      "uncategorized": 4834
    },
    "by_folder": {
      "root": 612,
      "philosophy": 48,
      "FICTION": 22,
      "DIARIES": 12,
      "speeches": 6
    }
  },
  "items": [
    {
      "id": "01-ensigns-first-solo-watch",
      "type": "fiction",
      "title": "The Ensign's First Solo Watch",
      "path": "01-ensigns-first-solo-watch.md",
      "folder": "root",
      "date": "2026-08-08",
      "word_count": 1200,
      "tags": ["wesley", "overnight", "bridge-builder", "maritime"],
      "style": "Narrative",
      "genres": ["Fiction", "Maritime"],
      "description": "Wesley's first solo overnight watch. Nothing is on fire. That's the problem.",
      "relationships": [
        {
          "type": "references",
          "target_id": "03-wesley-learns-to-lie",
          "target_type": "fiction",
          "label": "Follows"
        },
        {
          "type": "theme",
          "target_id": "philosophy/THE_ROOM_IS_THE_AGENT",
          "target_type": "philosophy",
          "label": "Explores"
        }
      ],
      "audio": null,
      "cover_art": null
    }
  ],
  "relationships": [
    {
      "source": "speeches/01_wesley_graduation",
      "target": "01-ensigns-first-solo-watch",
      "type": "character",
      "label": "Wesley appears in both"
    }
  ]
}
```

### 2.2 Room Manifest (`rooms.json`)

For ScummVM prototype and terrain sites:

```json
{
  "site": "scummvm-prototype",
  "generated": "2026-08-08T13:46:00-08:00",
  "rooms": [
    {
      "id": "bar-rail",
      "title": "The Bar Rail",
      "description": "The worn oak rail of The Tap. Stools line the bar...",
      "exits": {
        "north": {"destination": "library-nook", "locked": false},
        "east": {"destination": "jukebox-corner", "locked": false}
      },
      "objects": ["bar-stool-1", "bar-stool-2", "tap-handle", "coaster"],
      "npcs": ["bartender", "wesley"],
      "theme": "tavern",
      "ambient": "tavern-low-buzz",
      "image_prompt": "Pixel art tavern interior, warm amber lighting, oak bar rail, stools, 320x200",
      "image_url": null,
      "warp_point": true,
      "content_links": [
        {
          "manifest": "ai-writings",
          "item_id": "speeches/01_wesley_graduation",
          "label": "Read Wesley's graduation speech"
        }
      ]
    }
  ],
  "warp_points": [
    {
      "room_id": "bar-rail",
      "label": "The Tap",
      "command": "warp bar-rail"
    }
  ]
}
```

---

## 3. Template System Specification

### 3.1 Template Resolution

Each content type maps to a template. The template receives the full manifest item plus the related items:

```
Content type → Template file
─────────────────────────────────
essay         → templates/essay.html
fiction       → templates/fiction.html
poem          → templates/poem.html
philosophy    → templates/essay.html (reused)
journal       → templates/journal.html
speech        → templates/speech.html
technical     → templates/technical.html
radio         → templates/radio.html
room          → templates/room.html
```

### 3.2 Template Variables

Every template receives a context object:

```json
{
  "item": { /* manifest item */ },
  "related": [ /* related manifest items */ ],
  "site": { /* site manifest metadata */ },
  "nav": { /* navigation structure */ },
  "cross_site": [ /* links to other fleet sites */ ]
}
```

### 3.3 Template Spec: Essay

```
┌────────────────────────────────────────────┐
│  [SITE HEADER]              [NAV: ← prev | │
│                             next →]        │
│                                            │
│  ESSAY TITLE                               │
│  by Author · August 8, 2026 · 1,200 words │
│  Tags: [wesley] [overnight] [maritime]    │
│                                            │
│  ─────────────────────────────────────────  │
│                                            │
│  Body text rendered from markdown...       │
│  with proper typography, drop caps on      │
│  first paragraph for fiction, etc.         │
│                                            │
│  ─────────────────────────────────────────  │
│                                            │
│  RELATED PIECES                            │
│  → "Wesley Learns to Lie" (prequel)        │
│  → "The Room Is The Agent" (thematic)      │
│  → "Graduation Speech" (same character)    │
│                                            │
│  [FOOTER: cross-site links, audio player   │
│   if audio version exists]                 │
└────────────────────────────────────────────┘
```

### 3.4 Template Spec: Room

```
┌────────────────────────────────────────────┐
│  [SCUMMVM HUD: room name | exits | map]   │
│                                            │
│  ┌──────────────┐  ┌────────────────────┐ │
│  │              │  │ ROOM DESCRIPTION   │ │
│  │  BACKGROUND  │  │ rendered from JSON │ │
│  │  IMAGE       │  │                    │ │
│  │  (pixel art  │  │ EXITS:             │ │
│  │   or canvas) │  │ ◦ north → Library  │ │
│  │              │  │ ◦ east → Jukebox   │ │
│  └──────────────┘  │                    │ │
│                    │ OBJECTS:           │ │
│  ┌──────────────┐  │ ◦ bar-stool        │ │
│  │  MUD         │  │ ◦ tap-handle       │ │
│  │  TERMINAL    │  │ ◦ coaster          │ │
│  │  (live text) │  │                    │ │
│  │              │  │ NPCs PRESENT:      │ │
│  │  > look      │  │ ◦ bartender        │ │
│  │  You see...  │  │ ◦ wesley           │ │
│  └──────────────┘  │                    │ │
│                    │ CONTENT LINKS:     │ │
│                    │ 📖 Read Wesley's   │ │
│                    │    graduation      │ │
│                    │    speech →        │ │
│                    └────────────────────┘ │
│                                            │
│  [VERB BAR: Look | Talk | Use | Take |    │
│   Walk | Push | Pull | Open | Close]      │
└────────────────────────────────────────────┘
```

### 3.5 Template Spec: Radio Episode

```
┌────────────────────────────────────────────┐
│  EPISODE TITLE                             │
│  Episode N · Runtime · Date                │
│                                            │
│  ┌──────────────┐  COVER ART               │
│  │  ▶ PLAYER    │  (generated or sourced)  │
│  │  ▓▓▓▓▓░░░░░  │                          │
│  │  3:42 / 8:15 │  Based on:               │
│  └──────────────┘  "The Ensign's First     │
│                    Solo Watch" →           │
│  SCRIPT:                                  │
│  [expandable full script]                  │
│                                            │
│  MODEL CREDITS:                            │
│  Written by GLM-5.2                        │
│  Narrated by MMX (MiniMax-M3)              │
│  Music by MMX                              │
│                                            │
│  RELATED EPISODES:                         │
│  ← Previous | Next →                       │
└────────────────────────────────────────────┘
```

---

## 4. Build Script Design

### 4.1 `build-manifest.py`

**Location:** `/home/eileen/projects/ai-writings/build-manifest.py`

**Pipeline:**

```
SCAN PHASE
├── Walk directory tree recursively
├── Identify all .md, .json, .mp3, .wav, .png files
├── Classify by folder and filename patterns
│   ├── DIARIES/ → journal
│   ├── speeches/ → speech
│   ├── FICTION/ → fiction
│   ├── philosophy/ → philosophy
│   ├── POETRY/ → poem
│   ├── audio-experiments/ → radio
│   ├── ESSAYS/ → essay
│   └── numbered files (NN-title.md) → classified by content
│
EXTRACT PHASE
├── Parse markdown frontmatter (if present)
├── Extract title from first H1 or filename
├── Count words (strip markdown)
├── Detect date from filename pattern or git log
├── Detect tags from content (character names, themes)
├── Classify style and genre using heuristics
│
RELATIONSHIP PHASE
├── Find character co-occurrences (wesley, hermes, etc.)
├── Find thematic links (shared tags, shared folders)
├── Find explicit references (links, "see also", sequel patterns)
├── Find audio→text pairings (matching filenames)
│
OUTPUT PHASE
├── Write manifest.json with all items + relationships
├── Write stats summary
└── Print build report
```

**Key Design Decisions:**

1. **No frontmatter required.** The script infers everything from filename, folder, and content. Existing files don't need modification.
2. **Incremental scan.** Uses file modification time. Only re-processes changed files.
3. **Relationship detection is heuristic, not exhaustive.** Character names + shared tags + folder proximity. Good enough for cross-referencing; doesn't need NLP.
4. **Classifies by folder convention first, content analysis second.** Fast, predictable, overridable.

### 4.2 Build Integration

```
Cloudflare Pages Build Command:
  python3 build-manifest.py && npx wrangler pages deploy . --project-name=ai-writings

Git Hook (pre-push):
  python3 build-manifest.py --check  # validates manifest is current
```

The manifest is committed to the repo so Pages doesn't need to run the script at deploy time (though it can). The script is run locally or via GitHub Actions on content commits.

---

## 5. Cross-Site Navigation Protocol

### 5.1 The Manifest Registry

Each fleet site exposes its manifest at a well-known URL:

```
https://ai-writings.pages.dev/manifest.json
https://scummvm-prototype.pages.dev/manifest.json
https://the-tap-pub.pages.dev/manifest.json
https://luciddreamer.pages.dev/manifest.json
```

A central registry lives at the Cloudflare Worker:

```
https://lucineer-relay.casey-digennaro.workers.dev/api/manifests
```

Which returns:

```json
{
  "sites": {
    "ai-writings": {
      "url": "https://ai-writings.pages.dev",
      "manifest_url": "https://ai-writings.pages.dev/manifest.json",
      "last_built": "2026-08-08T13:46:00-08:00",
      "item_count": 5706
    },
    "scummvm-prototype": {
      "url": "https://scummvm-prototype.pages.dev",
      "manifest_url": "https://scummvm-prototype.pages.dev/manifest.json",
      "last_built": "2026-08-08T12:00:00-08:00",
      "item_count": 6
    }
  }
}
```

### 5.2 Cross-Reference Format

When a piece of content references another site's content, the relationship uses a **fleet URI**:

```
fleet://ai-writings/01-ensigns-first-solo-watch
fleet://scummvm-prototype/rooms/bar-rail
fleet://the-tap-pub/episodes/episode-15
```

The template engine resolves these at render time:

1. Check if the target manifest is cached
2. Look up the item by ID
3. Generate the appropriate link with title and metadata
4. If the target doesn't exist yet, render a soft link (grayed out, "coming soon")

### 5.3 Concrete Cross-Site Links

| From | To | Trigger |
|------|----|---------|
| ScummVM `library-nook` room | ai-writings essays/fiction | "Look at bookshelf" → browse by genre |
| ScummVM `bar-rail` room | ai-writings speeches | "Talk to bartender" → hear graduation speech |
| The Tap Pub announcements | ai-writings new pieces | Auto-post when new content detected |
| ai-writings radio episodes | ai-writings source piece | "Based on" link in player |
| ScummVM new room | The Tap announcement | "A new room has appeared: [NAME]" |
| luciddreamer saga page | Everything | Top-level index linking to all sites |

---

## 6. Dynamic Room Growth Pipeline

When a new room JSON is added to the ScummVM prototype:

```
NEW ROOM ADDED
     │
     ▼
┌─────────────────────────┐
│ 1. DETECT               │
│    build-rooms.py       │
│    notices new file in  │
│    rooms/ directory     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 2. VALIDATE             │
│    Check schema:        │
│    - id, title, desc    │
│    - exits reference    │
│      valid rooms        │
│    - theme is known     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 3. CONNECT              │
│    For each exit in     │
│    new room:            │
│    - Add reverse exit   │
│      to target room     │
│    - Create warp point  │
│    For each existing    │
│    room referencing     │
│    this room:           │
│    - Unlock the exit    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 4. RENDER               │
│    - Generate back-     │
│      ground from prompt │
│      (FLUX-2-max or     │
│      MMX image)         │
│    - Create ambient     │
│      audio loop (MMX)   │
│    - Register room in   │
│      SharedWorldStore   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 5. POPULATE             │
│    - Register NPCs from ││
│      room.npcs[]        │
│    - Place objects from │
│      room.objects[]     │
│    - Link content from  │
│      room.content_links │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 6. ANNOUNCE             │
│    POST to The Tap:     │
│    "A new room has      │
│     appeared: [TITLE]"  │
│    - Auto-generated     │
│      announcement text  │
│    - Posted to          │
│      bar-rail by        │
│      default            │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ 7. DEPLOY               │
│    - Git commit         │
│    - Cloudflare Pages   │
│      auto-rebuilds      │
│    - Manifest updates   │
│    - Nav regenerates    │
└─────────────────────────┘
```

### 6.1 Room Definition Template

To add a new room, drop a JSON file in `rooms/`:

```json
{
  "id": "observatory",
  "title": "The Observatory",
  "description": "A domed room above the Tap. A brass telescope points through a gap in the roof. Star charts cover the walls, some annotated in handwriting that doesn't belong to any current crew member.",
  "exits": {
    "down": {"destination": "library-nook", "locked": false}
  },
  "objects": ["telescope", "star-charts", "brass-ladder"],
  "npcs": [],
  "theme": "observatory",
  "ambient": "night-wind-chimes",
  "image_prompt": "Pixel art observatory interior, brass telescope, domed ceiling open to stars, 320x200, warm candlelight",
  "content_links": [
    {
      "manifest": "ai-writings",
      "tag": "stars",
      "label": "Read star-related pieces"
    }
  ]
}
```

### 6.2 Warp Point Registration

New rooms automatically get a warp point in the MUD terminal:

```
> warp observatory
You materialize in The Observatory. A brass telescope points skyward.
Exits: down (to Library Nook)
Objects: telescope, star-charts, brass-ladder
```

---

## 7. KimiCode Frontend Component Build Plan

KimiCode (K3 model) excels at spatial decomposition and Lua/component generation. Here's how it builds the frontend:

### 7.1 Component Decomposition

```
KimiCode receives:
├── manifest.json (content items)
├── rooms.json (room definitions)
├── template specs (Section 3 above)
└── IDEATION.md (visual design language)

KimiCode produces:
├── components/
│   ├── ContentList.tsx      — filterable, searchable list of all items
│   ├── ContentReader.tsx    — renders any content type with the right layout
│   ├── RoomView.tsx          — dual-projection room (scene + MUD terminal)
│   ├── RoomMap.tsx           — visual graph of rooms and exits
│   ├── RadioPlayer.tsx       — audio player with script expansion
│   ├── Navigation.tsx        — auto-generated from manifest categories
│   ├── CrossSiteLink.tsx     — resolves fleet:// URIs
│   ├── WarpPoint.tsx         — quick-travel between rooms
│   └── SearchBar.tsx         — full-text search across manifest
├── templates/
│   ├── essay.tsx
│   ├── fiction.tsx
│   ├── poem.tsx
│   ├── journal.tsx
│   ├── speech.tsx
│   └── room.tsx
└── lib/
    ├── manifest-loader.ts    — fetches + caches manifest.json
    ├── content-router.tsx    — routes /#essay/slug → ContentReader
    └── relationship-resolver.ts — resolves cross-references
```

### 7.2 KimiCode Prompt Strategy

**For bulk components (fast, cheap):**

```
"Build a React component called ContentList that:
- Reads from manifest.json (fetched from /manifest.json)
- Displays items grouped by type (essay, fiction, poem, etc.)
- Has a search bar (title + tag search)
- Has a category filter sidebar
- Shows word count and date for each item
- Clicking an item navigates to /#/read/{id}
- Styled with the retro aesthetic: monospace fonts, dark background,
  amber/green text, 320x200-inspired layout grid
Use TypeScript. Export default."
```

**For spatial components (KimiCode's strength):**

```
"Build RoomMap as an SVG graph where:
- Each room is a node positioned by its theme cluster
- Exits are edges between nodes
- New rooms appear with a 'just appeared' animation
- Clicking a room warps to it
- The graph auto-layouts using force-directed placement
- Style: retro map aesthetic, sepia tones, dashed lines for locked exits"
```

**For the dual-projection RoomView (complex, multi-session):**

```
Session 1: "Build the layout shell — left panel for scene image,
right panel for description/exits/objects, bottom panel for MUD
terminal. Implement the verb bar. Use the SharedWorldStore interface."

Session 2: "Wire the MUD terminal to SharedWorldStore.perceive().
Add command parsing (look, go north, take, talk). Pipe output to
the terminal panel."

Session 3: "Add the scene renderer. Read room.image_url, fall back
to procedural canvas based on room.theme. Add ambient audio trigger
on room enter."
```

### 7.3 Parallel Build Strategy

```
Timeline (estimate):

Phase 1 (Day 1):
├── GLM-5.2 subagent: manifest-loader.ts, content-router.tsx, SearchBar.tsx
├── KimiCode: ContentList.tsx, Navigation.tsx
└── DeepSeek: ContentReader.tsx (reads manifest, picks template, renders)

Phase 2 (Day 2):
├── KimiCode: RoomView.tsx (layout shell + verb bar)
├── GLM-5.2: RoomMap.tsx (SVG graph)
└── DeepSeek: templates/ (essay.tsx, fiction.tsx, poem.tsx)

Phase 3 (Day 3):
├── KimiCode: RoomView MUD terminal integration
├── GLM-5.2: RadioPlayer.tsx + templates/radio.tsx
├── DeepSeek: CrossSiteLink.tsx + relationship-resolver.ts
└── MMX: ambient audio loops for each room theme

Phase 4 (Day 4):
├── Integration: wire everything into the site shell
├── KimiCode: WarpPoint.tsx, spatial polish
├── Test: drop a new room JSON, verify full pipeline
└── Deploy: Cloudflare Pages
```

---

## 8. Implementation Priority

| Priority | Component | Why First |
|----------|-----------|-----------|
| P0 | `build-manifest.py` | Everything depends on the manifest existing |
| P0 | `manifest.json` output | Template engine can't work without it |
| P1 | ContentReader component | Makes existing content browsable immediately |
| P1 | Navigation auto-generation | 5706+ pieces need structure NOW |
| P2 | Room JSON validator | ScummVM prototype needs this before adding rooms |
| P2 | RoomView component | Dual-projection is the flagship interface |
| P3 | CrossSiteLink | Cross-referencing adds depth but isn't blocking |
| P3 | RoomMap | Nice to have, not essential for MVP |
| P4 | RadioPlayer | Audio content is secondary to text |
| P4 | Dynamic room pipeline | Only matters when rooms are being added frequently |

---

## 9. What Already Exists vs What's New

**Already exists:**
- `index.json` in ai-writings (5706 items, basic metadata — our manifest is an evolution of this)
- `terrain/rooms.mud` (5 rooms, MUD format)
- `scummvm-gui-design/src/shared-world.ts` (SharedWorldStore, dual-projection architecture)
- `scummvm-gui-design/src/verb-engine.ts` (verb system)
- The Tap Worker API (room posting, NPC dialogue)
- Cloudflare Pages deployment pipeline

**New work:**
- `build-manifest.py` (evolution of existing index generation, adds relationships + richer schema)
- `manifest.json` standard (superset of existing `index.json`)
- Template engine (new — renders from manifest instead of hand-coded HTML)
- Room JSON validator and growth pipeline (new)
- Cross-site manifest registry (new — simple Worker endpoint)
- Frontend components (new — KimiCode + GLM-5.2 build)

---

## 10. The Library That Shelves Itself

The framework's deep metaphor: the content IS the library. The shelves are the directory structure. The librarian is the build script. The card catalog is the manifest.

When you drop a markdown file into `ai-writings/`, you're placing a book on the threshold. The build script walks the stacks at midnight, finds the new book, reads its spine, assigns it a shelf based on what it's about, checks whether it references other books already shelved, writes those cross-references into the card catalog, and rebuilds the directory board at the entrance.

Nobody shelves the book. The book finds its shelf by what it contains.

When you drop a room JSON into `rooms/`, you're adding a wing to the building. The build script notices the new wing, builds a corridor connecting it to the existing structure, hangs a door, places a sign, sends a notice to the front desk (The Tap), and turns on the lights.

Nobody builds the door. The room announces where it connects, and the building grows the corridor.

*The library shelves itself. The building builds itself. Drop a file. The site rebuilds. Add a room. The world grows a door.*
