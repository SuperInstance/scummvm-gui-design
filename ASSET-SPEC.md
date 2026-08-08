# SCUMM-style Asset Specification
## The Tap × Fishing Vessel — Agentic GUI Pipeline

> **Aesthetic:** 1990s LucasArts adventure game. Monkey Island meets an Alaska fishing vessel.
> **Palette:** 256 colors, warm amber tavern light, cold steel ship interiors.
> **Resolution:** 320×200 native (rendered at 1024×576 for modern displays, 3× integer scale).

---

## 1. ASSET TYPES

Each room in the SCUMM-like GUI requires six asset categories:

### 1.1 Background Image
The static scene the player sees when they enter a room.

| Property | Value |
|----------|-------|
| Native resolution | 320×200 px |
| Render resolution | 1024×576 px (3× scale) |
| Color depth | 256-color indexed palette |
| Format | PNG (lossless) or JPEG (archival) |
| Style | Hand-painted pixel art, LucasArts SCUMM era |
| Lighting | Per-room ambiance (see room specs) |
| Constraints | No UI elements, no text in-image, no character sprites |

### 1.2 Walkbox Map
A polygon overlay defining walkable areas. Invisible to the player.

```json
{
  "walkboxes": [
    {
      "id": "main_floor",
      "polygon": [[20, 180], [300, 180], [300, 199], [20, 199]],
      "z_priority": 0
    },
    {
      "id": "upper_area",
      "polygon": [[100, 140], [220, 140], [220, 180], [100, 180]],
      "z_priority": 1
    }
  ],
  "scale_zones": [
    {
      "polygon": [[0, 140], [320, 140], [320, 199], [0, 199]],
      "scale_top": 0.7,
      "scale_bottom": 1.0
    }
  ]
}
```

- **Walkboxes** define where the player character can path to.
- **Scale zones** make the character smaller when "further back" in the scene.
- Coordinates are in native 320×200 space.

### 1.3 Hotspot Definitions
Clickable objects in the scene. Each has a bounding box and supported verbs.

```json
{
  "hotspots": [
    {
      "id": "bar_counter",
      "name": "Bar Counter",
      "bbox": [40, 100, 200, 140],
      "verbs": {
        "Look": "A worn oak bar counter, stained with years of spilled drinks.",
        "Talk": "The bartender looks up expectantly.",
        "Use": "You lean on the bar. The wood is solid and warm."
      },
      "cursor": "talk"
    }
  ]
}
```

- **bbox** is `[x1, y1, x2, y2]` in native 320×200 coordinates.
- **verbs** map SCUMM verb actions to text responses or script triggers.
- **cursor** controls which cursor icon appears on hover (look, talk, use, walk, exit).

### 1.4 Exit Zones
Room transitions. Clicking an exit triggers scene change.

```json
{
  "exits": [
    {
      "id": "door_aft_deck",
      "bbox": [280, 80, 320, 180],
      "label": "Go to Aft Deck",
      "target_room": "aft-deck",
      "cursor": "exit",
      "walk_to": [300, 150],
      "transition": "fade"
    }
  ]
}
```

- **walk_to** is the point the character walks to before transitioning.
- **transition** can be `fade`, `slide_left`, `slide_right`, `cut`.

### 1.5 NPC Sprites
Animated character portraits that inhabit rooms.

```json
{
  "npcs": [
    {
      "id": "riker",
      "name": "Riker",
      "sprite_sheet": "assets/sprites/riker.png",
      "sprite_size": [32, 64],
      "animations": {
        "idle": {"frames": 4, "fps": 4, "loop": true},
        "talk": {"frames": 4, "fps": 8, "loop": true},
        "walk": {"frames": 6, "fps": 10, "loop": true}
      },
      "position": [120, 110],
      "facing": "south"
    }
  ]
}
```

- Sprite sheets are horizontal strips, 32×64 px per frame.
- **idle**: gentle breathing/sway animation (4 frames, slow).
- **talk**: mouth/hand movement (4 frames, faster).
- **walk**: full walk cycle (6 frames).
- **position** is the NPC's default anchor point in 320×200 space.

### 1.6 Ambient Audio
Looping background track per room. Sets the mood.

```json
{
  "audio": {
    "ambience": "assets/audio/bar-rail-ambient.ogg",
    "music": "assets/audio/bar-rail-music.ogg",
    "sfx": [
      {"id": "glass_clink", "file": "assets/sfx/glass-clink.ogg", "interval": [15, 45]},
      {"id": "door_creak", "file": "assets/sfx/door-creak.ogg", "interval": [30, 90]}
    ]
  }
}
```

- **ambience**: seamless loop, 10–30 seconds, low volume.
- **music**: optional melodic layer, lower priority.
- **sfx**: randomized interval one-shots for environmental texture.

---

## 2. ROOM ASSET TEMPLATES

### 2.1 The Tap — `bar-rail`

**Description:** The main bar area of The Tap, a weathered tavern frequented by fleet crew.

**Background:**
- Dim tavern interior lit by amber pendant lamps
- Long wooden bar counter with brass foot rail, 5 stools
- Bottles backlit on shelves behind the bar
- Corner booth visible in the right background, leather seats
- Window with rain-streaked glass on the far left
- Fishing nets and a mounted halibut on the wall
- Floor is worn hardwood with sawdust
- Lighting: warm amber, pooling under lamps, dark corners

**Walkboxes:**
- `main_floor`: The bar area in front of the counter
- `stool_zone`: Tight strip right at the bar for sitting
- `booth_approach`: Path leading to the corner booth

**Hotspots:**

| ID | Name | Bbox (320×200) | Verbs | Notes |
|----|------|-----------------|-------|-------|
| `bar_counter` | Bar Counter | [40, 100, 200, 135] | Look, Talk, Use | Talk triggers bartender dialogue |
| `stool_1` | Bar Stool | [60, 130, 90, 170] | Look, Use (Sit) | Sit changes player sprite state |
| `stool_2` | Bar Stool | [100, 130, 130, 170] | Look, Use (Sit) | — |
| `stool_3` | Bar Stool | [140, 130, 170, 170] | Look, Use (Sit) | — |
| `corner_booth` | Corner Booth | [240, 90, 310, 160] | Look, Walk to | NPCs may be seated here |
| `bottle_shelf` | Bottle Shelf | [50, 60, 190, 90] | Look | Flavor text about drinks |
| `mounted_fish` | Mounted Halibut | [210, 50, 260, 80] | Look, Talk | Talking fish easter egg |
| `window_left` | Rainy Window | [10, 60, 35, 140] | Look | View of the dock outside |
| `fish_nets` | Fishing Nets | [270, 30, 310, 60] | Look, Use | Decorative / quest item |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `door_aft_deck` | [280, 100, 320, 180] | `aft-deck` | Go to Aft Deck |
| `door_engine_room` | [0, 100, 30, 180] | `engine-room` | Go to Engine Room |
| `door_chart_room` | [145, 50, 175, 100] | `chart-room` | Go to Chart Room |

**NPCs:**
- **Riker** — Weathered first officer, early 40s, salt-and-pepper beard, rain jacket over flannel, holds a clipboard with fleet readiness notes. Idle: shifts weight, taps pen. Talk: gestures with clipboard. Position: behind bar counter (acting as bartender NPC for The Tap).

**Audio:**
- Ambience: low tavern murmur (crowd layers at low volume), occasional glass clink, distant jukebox playing something maritime and melancholy
- SFX intervals: glass clink every 15–45s, door creak every 30–90s, laugh every 60–120s

---

### 2.2 The Tap — `engine-room`

**Description:** The engine room of The Tap's metaphorical ship — where the backend machinery hums.

**Background:**
- Industrial pipes and valve wheels along riveted steel walls
- A large central furnace/boiler with a glowing door
- Catwalk grating on the floor, visible drop below
- Warning lights (amber and red) on a panel
- Steam wisps from joints
- Lighting: industrial — sodium vapor amber with red accent from furnace glow

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `central_furnace` | Boiler | [120, 80, 200, 160] | Look, Use |
| `valve_wheel` | Valve Wheel | [50, 90, 80, 130] | Look, Use, Turn |
| `pipe_junction` | Pipe Junction | [220, 40, 280, 120] | Look |
| `warning_panel` | Warning Panel | [240, 120, 310, 160] | Look, Use |
| `catwalk` | Catwalk Edge | [0, 170, 320, 199] | Look |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `door_bar_rail` | [0, 100, 30, 180] | `bar-rail` | Go to Bar |
| `hatch_below` | [140, 160, 180, 199] | `foredeck` | Go Below |

**NPCs:** None (automated room — ambient only)

**Audio:** Deep engine thrum, steam hiss, metallic groans, rhythmic pump cycle

---

### 2.3 The Tap — `aft-deck`

**Description:** The rear deck, open to the weather. Where crew step outside for air.

**Background:**
- Open deck with rusted railings under a grey Alaska sky
- Stacks of crab pots and rope coils
- A winch/crane apparatus
- Rain-slicked deck plating
- Door back into the bar visible on one wall
- Distant harbor lights through mist
- Lighting: overcast daylight, cool blue-grey with warm spill from the bar door

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `ship_railing` | Railing | [0, 80, 320, 100] | Look |
| `crane_winch` | Deck Winch | [200, 60, 280, 130] | Look, Use |
| `crab_pots` | Crab Pots | [20, 120, 100, 170] | Look |
| `rope_coil` | Rope Coil | [110, 130, 160, 170] | Look, Use (Take) |
| `bar_door` | Bar Door | [280, 90, 320, 180] | Look, Use |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `door_bar_rail` | [280, 90, 320, 180] | `bar-rail` | Go to Bar |
| `stairs_bridge` | [10, 100, 50, 180] | `bridge-table` | Go to Bridge Table |

**NPCs:** Random crew member leaning on rail

**Audio:** Wind, rain on metal, distant foghorn, wave slap against hull, rigging clink

---

### 2.4 The Tap — `corner-booth`

**Description:** A secluded booth for private conversations and backroom deals.

**Background:**
- Intimate booth seating, red leather (cracked), small table
- A single hanging lamp creating a pool of warm light
- Dark surroundings — the rest of the bar is a dim blur
- Condensation on a window beside the booth
- A small candle on the table
- Lighting: very warm, tight focus on booth, everything else shadow

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `booth_table` | Booth Table | [60, 120, 260, 160] | Look |
| `candle` | Candle | [140, 100, 160, 120] | Look, Use (Blow out) |
| `window_condensation` | Window | [270, 50, 310, 140] | Look, Use (Write on) |
| `booth_seat_left` | Seat | [20, 100, 70, 170] | Look, Use (Sit) |
| `booth_seat_right` | Seat | [250, 100, 300, 170] | Look, Use (Sit) |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `exit_to_bar` | [0, 100, 30, 180] | `bar-rail` | Return to Bar |

**NPCs:** Varies — different NPCs for different quest lines

**Audio:** Muffled bar noise, close-up candle crackle, intimate and quiet

---

### 2.5 The Tap — `bridge-table`

**Description:** A raised area with a large table used for planning and navigation discussions.

**Background:**
- Round table with a nautical chart spread across it
- Hanging brass lamp over the table
- Ship's wheel mounted on the wall as decoration
- Porthole windows showing grey sky
- High-backed chairs around the table
- Lighting: focused warm light on the chart, cooler ambient in the room

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `chart_table` | Navigation Chart | [80, 110, 240, 160] | Look, Use |
| `brass_lamp` | Hanging Lamp | [140, 40, 180, 80] | Look |
| `wall_wheel` | Decorative Wheel | [20, 50, 70, 110] | Look, Use (Turn) |
| `porthole_1` | Porthole | [250, 50, 290, 100] | Look |
| `chair_1` | Chair | [60, 130, 100, 175] | Look, Use (Sit) |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `stairs_aft_deck` | [0, 100, 40, 180] | `aft-deck` | Go to Aft Deck |
| `door_chart_room` | [280, 80, 320, 160] | `chart-room` | Go to Chart Room |

**NPCs:** Strategy NPCs, occasional captain figure

**Audio:** Quiet room, paper rustling, wood creaking, distant bar noise below

---

### 2.6 The Tap — `chart-room`

**Description:** A small room off the bridge, filled with maps, logs, and reference materials.

**Background:**
- Walls lined with chart drawers and bookshelves
- A desk with a glowing terminal/monitor
- Rolled charts in a rack
- A porthole showing grey sea
- Dim, scholarly atmosphere
- Lighting: cool monitor glow mixed with warm desk lamp

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `chart_drawers` | Chart Drawers | [0, 60, 60, 180] | Look, Use (Open) |
| `monitor` | Terminal | [200, 80, 280, 140] | Look, Use |
| `desk` | Desk | [160, 120, 290, 170] | Look |
| `chart_rack` | Chart Rack | [70, 90, 120, 170] | Look, Use |
| `bookshelf` | Bookshelf | [290, 40, 320, 180] | Look |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `door_bridge` | [280, 80, 320, 180] | `bridge-table` | Go to Bridge |
| `door_bar` | [0, 100, 30, 180] | `bar-rail` | Go to Bar |

**NPCs:** None (quiet study room)

**Audio:** Hum of electronics, distant engine, paper sounds, very quiet

---

### 2.7 Fishing Vessel — `wheelhouse`

**Description:** The nerve center of the vessel. Where the captain drives the boat.

**Background:**
- Ship's bridge with large wraparound windows showing grey ocean and sky
- Console with glowing displays (radar, chartplotter, depth sounder)
- Polished teak helm station with a mahogany wheel
- Brass compass in a binnacle
- Radio equipment on a side panel
- Captain's chair, worn but dignified
- Lighting: cool display glow against grey daylight from windows

**Walkboxes:**
- `bridge_floor`: Main walking area behind the helm console
- `port_side`: Narrow strip to the left of the console
- `starboard_side`: Narrow strip to the right

**Hotspots:**

| ID | Name | Bbox (320×200) | Verbs | Notes |
|----|------|-----------------|-------|-------|
| `helm_wheel` | Helm Wheel | [130, 70, 190, 130] | Look, Use, Turn | Use → steering mini-game or dialogue |
| `radar_display` | Radar Display | [200, 80, 250, 120] | Look | Shows sweep with targets |
| `compass_rose` | Compass | [80, 80, 120, 120] | Look | Brass binnacle, gimbaled |
| `radio_console` | Radio Console | [250, 100, 310, 150] | Look, Use | Use → radio dialogue / weather report |
| `nav_charts` | Nav Charts | [40, 120, 100, 160] | Look | Chartplotter screen |
| `gps_receiver` | GPS Display | [200, 130, 250, 160] | Look | Coordinates readout |
| `spotlight_control` | Spotlight Switch | [280, 60, 310, 90] | Look, Use | Toggle spotlight |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `door_aft` | [280, 100, 320, 180] | `aft_cockpit` | Go to Aft Cockpit |
| `stairs_down` | [0, 100, 40, 180] | `galley` | Go Down to Galley |

**NPCs:**
- **Captain** — Weathered, 50s, grey beard, rain gear draped on chair, steady hands on the wheel. Idle: adjusts course slightly, checks radar. Talk: turns to face player, authoritative but warm.

**Audio:** Engine hum (constant, low), wave noise through windows, occasional radio static/bursts, radar beep, compass gimbal creak

---

### 2.8 Fishing Vessel — `galley`

**Description:** Compact ship's kitchen where crew eat and gather.

**Background:**
- Small propane stove under timber cabinets
- Sink with hand pump
- Teak table with fiddled edges (to prevent sliding in seas)
- Icebox in the corner
- Coffee maker (well-used)
- Porthole showing grey sky and sea
- Lighting: warm incandescent bulb, cozy despite the industrial surroundings

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `propane_stove` | Propane Stove | [40, 90, 100, 140] | Look, Use |
| `sink_pump` | Sink Pump | [110, 90, 150, 140] | Look, Use |
| `galley_table` | Galley Table | [80, 120, 240, 170] | Look, Use (Sit) |
| `icebox` | Icebox | [250, 80, 310, 150] | Look, Use (Open) |
| `water_tank` | Water Tank | [0, 60, 30, 140] | Look |
| `coffee_maker` | Coffee Maker | [160, 80, 200, 120] | Look, Use |
| `porthole` | Porthole | [270, 40, 300, 80] | Look |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `stairs_up` | [0, 100, 40, 180] | `wheelhouse` | Go Up to Wheelhouse |
| `door_aft` | [280, 100, 320, 180] | `aft_cockpit` | Go to Aft Cockpit |

**NPCs:** Off-duty crew member (rotates)

**Audio:** Propane hiss, pots clanking, hull creak, kettle whistle (rare), muffled engine

---

### 2.9 Fishing Vessel — `foredeck`

**Description:** The working front of the boat. Where the heavy lifting happens.

**Background:**
- Reinforced deck plating with anchor chain running through hawse pipes
- Windlass (anchor winch) at the bow
- Rope bins and bait tanks
- Safety rails along the gunwales
- Salt spray visible over the bow
- Grey sky, potentially rain
- Lighting: flat overcast daylight, harsh and working-class

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `windlass` | Windlass | [120, 60, 200, 120] | Look, Use |
| `anchor_chain` | Anchor Chain | [140, 100, 180, 160] | Look |
| `bait_tank` | Bait Tank | [20, 100, 80, 160] | Look, Use |
| `rope_bin` | Rope Bin | [220, 100, 280, 160] | Look, Use (Take rope) |
| `hawse_pipe` | Hawse Pipe | [150, 40, 170, 70] | Look |
| `cleat_forward` | Bow Cleat | [90, 50, 120, 80] | Look, Use |
| `safety_rail` | Safety Rail | [0, 30, 320, 50] | Look |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `go_aft` | [250, 100, 320, 180] | `aft_cockpit` | Go to Aft Cockpit |
| `hatch_below` | [140, 160, 180, 199] | `engine_room` | Go Below |

**NPCs:**
- **Deckhand** — Young, hard-working, rain gear and rubber boots, always busy. Idle: checks gear, coils rope. Talk: laconic but friendly.

**Audio:** Wind (strong), chain rattle, wave splash over bow, windlass motor, seabirds

---

### 2.10 Fishing Vessel — `engine_room`

**Description:** The hot, loud heart of the vessel. Twin diesels and the smell of oil.

**Background:**
- Twin diesel engines dominating the center
- Generator humming on a workbench
- Tool rack on the starboard bulkhead
- Fuel lines bundled along the ceiling
- Battery bank against one wall
- Warm oil filter and maintenance supplies
- Lighting: bare bulb industrial, hot amber, shadows from engine block

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `port_engine` | Port Engine | [40, 80, 140, 150] | Look, Use |
| `stbd_engine` | Starboard Engine | [180, 80, 280, 150] | Look, Use |
| `generator` | Generator | [150, 120, 220, 170] | Look |
| `fuel_lines` | Fuel Lines | [0, 40, 320, 60] | Look |
| `tool_rack` | Tool Rack | [280, 80, 320, 160] | Look, Use (Take tools) |
| `oil_filter` | Oil Filter | [10, 100, 40, 140] | Look |
| `battery_bank` | Battery Bank | [0, 130, 60, 180] | Look |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `hatch_up` | [140, 160, 180, 199] | `foredeck` | Go Up |
| `door_forward` | [280, 100, 320, 180] | `aft_cockpit` | Go to Aft Cockpit |

**NPCs:**
- **Engineer Bot** — Compact maintenance robot, worn casing, LED eyes, always tinkering. Idle: adjusts valves, wipes hands. Talk: technical reports delivered with droid chirps.

**Audio:** Diesel thrum (loud), generator whine, metal on metal, oil can drip, ventilation fan

---

### 2.11 Fishing Vessel — `aft_cockpit`

**Description:** The back of the boat where catch comes aboard. The working stern.

**Background:**
- Open deck with scuppers draining over the stern
- Catch boxes stacked along the sides
- Downrigger posts standing tall
- Fishfinder display on a short mast
- Stern drive housing
- Trim tab controls
- Transom door to swim platform
- Bait well with circulating seawater
- Lighting: overcast daylight, practical working light

**Hotspots:**

| ID | Name | Bbox | Verbs |
|----|------|------|-------|
| `stern_drive` | Stern Drive | [130, 130, 190, 180] | Look |
| `trim_tabs` | Trim Tab Controls | [200, 120, 250, 160] | Look, Use |
| `fishfinder` | Fishfinder Display | [30, 60, 90, 110] | Look, Use |
| `downrigger_posts` | Downrigger Posts | [10, 40, 40, 160] | Look |
| `bait_well` | Bait Well | [240, 100, 300, 160] | Look, Use |
| `transom_sump` | Transom Sump | [140, 170, 180, 199] | Look |
| `catch_boxes` | Catch Boxes | [250, 80, 310, 150] | Look, Use |
| `transom_door` | Transom Door | [100, 100, 140, 180] | Look, Use (Open) |

**Exits:**

| ID | Bbox | Target | Label |
|----|------|--------|-------|
| `go_forward` | [0, 100, 40, 180] | `foredeck` | Go to Foredeck |
| `go_wheelhouse` | [280, 60, 320, 140] | `wheelhouse` | Go to Wheelhouse |
| `go_galley` | [280, 140, 320, 199] | `galley` | Go to Galley |
| `go_engine_room` | [140, 160, 180, 199] | `engine_room` | Go to Engine Room |

**NPCs:**
- **Deckhand** (same as foredeck, moves between rooms)
- **Cargo Robot** — Heavy-duty loading bot, moves catch boxes. Idle: standby hum. Talk: inventory reports.

**Audio:** Stern wave, deck wash, winch motor, seabirds, radio chatter from wheelhouse

---

## 3. PROMPT TEMPLATES

### 3.1 Background Image Prompt Template

```
Pixel art background, [ROOM DESCRIPTION], [LIGHTING DESCRIPTION],
adventure game background, 1990s LucasArts SCUMM style,
320x200 resolution aesthetic, 256 color palette,
no characters, no text, no UI elements,
detailed pixel art, warm atmospheric depth
```

**Per-room filled prompts:**

**bar-rail:**
```
Pixel art background, dim tavern interior with wooden bar counter and brass foot rail,
five bar stools, backlit bottle shelves, corner booth with cracked leather seats,
rain-streaked window on the left, mounted halibut on the wall, fishing nets draped,
sawdust on worn hardwood floor, warm amber pendant lighting pooling under lamps,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**wheelhouse:**
```
Pixel art background, ship's wheelhouse bridge with large wraparound windows showing
grey ocean and sky, console with glowing radar and chartplotter displays, polished teak
helm station with mahogany wheel, brass compass in binnacle, captain's chair,
radio equipment on side panel, cool blue display glow mixed with grey daylight,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**galley:**
```
Pixel art background, compact ship's galley kitchen with propane stove under timber
cabinets, hand pump sink, teak table with fiddled edges, icebox in corner, old coffee
maker, porthole showing grey sea, warm incandescent lighting, cozy but utilitarian,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**foredeck:**
```
Pixel art background, fishing vessel foredeck with reinforced plating, anchor chain
through hawse pipes, windlass at bow, rope bins and bait tanks, safety rails along
gunwales, salt spray over the bow, flat overcast grey daylight, working deck,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**engine_room:**
```
Pixel art background, ship's engine room with twin diesel engines, generator on
workbench, tool rack on bulkhead, fuel lines along ceiling, battery bank against wall,
bare industrial bulb lighting casting harsh amber shadows from engine blocks,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**aft_cockpit:**
```
Pixel art background, fishing vessel aft cockpit with scuppers draining over stern,
stacked catch boxes, downrigger posts, fishfinder display on short mast, stern drive
housing, transom door, bait well, overcast grey daylight, open working deck,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**corner-booth:**
```
Pixel art background, secluded tavern corner booth with cracked red leather seats,
small table with a candle, single hanging lamp creating warm pool of light,
condensation on window beside booth, dark shadowy surroundings,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**bridge-table:**
```
Pixel art background, raised tavern area with round table covered in nautical charts,
hanging brass lamp, decorative ship's wheel on wall, porthole windows showing grey sky,
high-backed chairs, focused warm light on chart with cooler ambient room light,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

**chart-room:**
```
Pixel art background, small nautical chart room with chart drawers lining walls,
bookshelves, desk with glowing terminal monitor, rolled charts in rack, porthole showing
grey sea, cool monitor glow mixed with warm desk lamp, scholarly dim atmosphere,
adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic,
256 color palette, no characters, no text, no UI elements
```

### 3.2 NPC Sprite Prompt Template

```
Pixel art character sprite, [CHARACTER DESCRIPTION], [CLOTHING/PROPS],
32x64 pixel sprite, 4-frame idle animation strip, side view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM,
limited palette character design, clear silhouette
```

**Per-NPC filled prompts:**

**Riker (bartender/first officer):**
```
Pixel art character sprite, weathered man in early 40s with salt-and-pepper beard,
wearing rain jacket over flannel shirt, holding a clipboard, stocky build,
32x64 pixel sprite, 4-frame idle animation strip, front-facing view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM
```

**Captain:**
```
Pixel art character sprite, weathered sea captain in 50s with grey beard,
wearing rain gear draped over shoulders, steady posture, weathered hands,
32x64 pixel sprite, 4-frame idle animation strip, front-facing view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM
```

**Deckhand:**
```
Pixel art character sprite, young deckhand in rubber boots and yellow rain gear,
athletic build, short hair, energetic stance,
32x64 pixel sprite, 4-frame idle animation strip, front-facing view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM
```

**Engineer Bot:**
```
Pixel art character sprite, compact maintenance robot with worn metal casing,
LED eyes glowing blue, mechanical arms, small and stocky,
32x64 pixel sprite, 4-frame idle animation strip, front-facing view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM
```

**Cargo Robot:**
```
Pixel art character sprite, heavy-duty cargo loading robot, industrial yellow paint,
mechanical loader arms, wide tracked base, utilitarian design,
32x64 pixel sprite, 4-frame idle animation strip, front-facing view,
transparent background, adventure game NPC style, 1990s LucasArts SCUMM
```

### 3.3 Ambient Audio Prompt Templates

Audio is generated via MMX music/TTS or sourced from freesound.org. Prompt templates for MMX:

**Tavern ambience (bar-rail, corner-booth):**
```
Ambient soundscape, low tavern murmur with distant crowd chatter, occasional glass clinks,
wooden floor creaks, muffled jukebox playing melancholy maritime melody,
warm and atmospheric, looping seamlessly, 30 seconds
```

**Engine room ambience:**
```
Ambient soundscape, deep diesel engine thrum, mechanical hum, occasional steam hiss,
metallic groans, rhythmic pump cycle, industrial and warm, looping seamlessly, 30 seconds
```

**Open deck ambience (foredeck, aft_cockpit):**
```
Ambient soundscape, strong wind over open water, rain on metal deck, wave splash against
hull, rigging clinking, distant foghorn, seabird calls, cold and atmospheric,
looping seamlessly, 30 seconds
```

**Wheelhouse ambience:**
```
Ambient soundscape, low engine hum through walls, wave noise through windows,
occasional radio static bursts, radar beep every 5 seconds, compass gimbal creak,
focused and calm, looping seamlessly, 30 seconds
```

---

## 4. GENERATION PIPELINE

### 4.1 Image Generation (DeepInfra FLUX-1-schnell)

```bash
source /home/eileen/mcp-deeinfra/.env

generate_background() {
  local PROMPT="$1"
  local OUTPUT="$2"
  curl -s "https://api.deepinfra.com/v1/openai/images/generations" \
    -H "Authorization: Bearer $DEEPINFRA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"black-forest-labs/FLUX-1-schnell\",
      \"prompt\": \"$PROMPT\",
      \"n\": 1,
      \"size\": \"1024x576\",
      \"steps\": 4
    }" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
img_data = base64.b64decode(data['data'][0]['b64_json'])
with open('$OUTPUT', 'wb') as f:
    f.write(img_data)
print('Saved: $OUTPUT (' + str(len(img_data)) + ' bytes)')
"
}
```

### 4.2 Post-Processing

Generated images need pixelation to achieve authentic retro look:

```python
from PIL import Image

def pixelate_to_scumm(input_path, output_path, target_size=(320, 200), palette_size=256):
    """Downscale to SCUMM resolution and apply indexed palette."""
    img = Image.open(input_path)
    img = img.resize(target_size, Image.Resampling.LANCZOS)
    img = img.quantize(colors=palette_size, method=Image.Quantize.MEDIANCUT)
    img.save(output_path, "PNG")
```

### 4.3 Asset Directory Structure

```
assets/
├── backgrounds/
│   ├── bar-rail.png
│   ├── engine-room.png
│   ├── aft-deck.png
│   ├── corner-booth.png
│   ├── bridge-table.png
│   ├── chart-room.png
│   ├── wheelhouse.png
│   ├── galley.png
│   ├── foredeck.png
│   ├── engine_room.png
│   └── aft_cockpit.png
├── sprites/
│   ├── riker.png
│   ├── captain.png
│   ├── deckhand.png
│   ├── engineer_bot.png
│   └── cargo_robot.png
├── audio/
│   ├── bar-rail-ambient.ogg
│   ├── engine-room-ambient.ogg
│   ├── aft-deck-ambient.ogg
│   ├── wheelhouse-ambient.ogg
│   ├── galley-ambient.ogg
│   ├── foredeck-ambient.ogg
│   ├── engine_room-ambient.ogg
│   └── aft_cockpit-ambient.ogg
├── sfx/
│   ├── glass-clink.ogg
│   ├── door-creak.ogg
│   ├── radio-static.ogg
│   ├── chain-rattle.ogg
│   └── wave-splash.ogg
├── walkboxes/
│   ├── bar-rail.json
│   ├── wheelhouse.json
│   └── ... (per room)
├── hotspots/
│   ├── bar-rail.json
│   ├── wheelhouse.json
│   └── ... (per room)
└── rooms.json    # master room registry
```

### 4.4 Master Room Registry

```json
{
  "rooms": {
    "bar-rail": {
      "background": "assets/backgrounds/bar-rail.png",
      "walkboxes": "assets/walkboxes/bar-rail.json",
      "hotspots": "assets/hotspots/bar-rail.json",
      "audio": "assets/audio/bar-rail-ambient.ogg",
      "npcs": ["riker"],
      "exits": ["aft-deck", "engine-room", "chart-room"]
    },
    "wheelhouse": {
      "background": "assets/backgrounds/wheelhouse.png",
      "walkboxes": "assets/walkboxes/wheelhouse.json",
      "hotspots": "assets/hotspots/wheelhouse.json",
      "audio": "assets/audio/wheelhouse-ambient.ogg",
      "npcs": ["captain"],
      "exits": ["aft_cockpit", "galley"]
    }
  }
}
```

---

## 5. TEST ASSET

**Status:** ✅ Generated

**File:** `assets/bar-rail-test.jpg`
**Prompt used:** "Pixel art tavern interior, dim amber lighting, wooden bar counter with stools, corner booth in shadows, adventure game background, 1990s LucasArts SCUMM style, 320x200 resolution aesthetic, 256 color palette, warm atmosphere, no text, no UI elements"
**Model:** DeepInfra FLUX-1-schnell
**Output:** 1024×576 JPEG, 71KB
**Date:** 2026-08-08

This proves the DeepInfra → file pipeline works. Next steps: pixelate to 320×200 indexed PNG for authentic SCUMM look.

---

## 6. COST ESTIMATES

| Asset Type | Model | Cost/Unit | Total Needed | Estimated Cost |
|-----------|-------|-----------|--------------|----------------|
| Backgrounds (11) | FLUX-1-schnell | ~$0.003 each | 11 | ~$0.03 |
| Sprites (5) | FLUX-1-schnell | ~$0.003 each | 5 | ~$0.02 |
| Audio (8 loops) | MMX or freesound | $0 (free tier) | 8 | $0 |
| SFX (5 one-shots) | freesound.org | $0 | 5 | $0 |
| **Total** | | | **~29 assets** | **~$0.05** |

Entire asset pipeline costs less than a nickel.

---

*Spec by Lucineer, August 2026. The Tap is open. The wheelhouse hums. Let's build a world.*
