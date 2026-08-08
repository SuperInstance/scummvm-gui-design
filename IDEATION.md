# ScummVM as the Agentic GUI for the Fleet

**Status:** ideation, 2026-08-08
**Grounded in:** `terrain/` (rooms.mud, terrain_core.py, terrain.ts, scene.json), `mud2scummvm/src/lib.rs`, `the-tap/` (9 rooms, tide-pool schema, gateway API), `/tmp/scummvm-context/vision.md`

---

## 0. The reframe that makes this work

ScummVM is not a game. It is an **interpreter**. You hand it a data bundle and it runs whatever world is in there — Monkey Island, Day of the Tentacle, Loom, all the same binary reading different files.

That is the whole thesis, and it's the part worth being disciplined about. We are not building "an adventure game for The Tap." We are building:

1. **A bundle format** — a room graph, an object atlas, a verb table, an NPC roster, a walkbox layer.
2. **A browser interpreter** that loads a bundle and renders it.
3. **Compilers** that emit bundles from things we already have.

Then The Tap is one bundle. The vessel (`terrain/rooms.mud`) is a second. The fleet wiki is a third. A customer's own infrastructure is a fourth, and we didn't write it — their MUD did.

Everything below assumes that split. Where an idea only works for The Tap and not as a general bundle, I'll flag it.

**The one-line pitch:** *your infrastructure already has rooms. We just turned on the lights.*

> **See also: [`DUAL-PROJECTION.md`](./DUAL-PROJECTION.md)** — the world renders twice, simultaneously: a MUD terminal (agent-native, pulled on demand, total) and a ScummVM scene (human-native, pushed continuously, free). The gap between them is the perception deadband. That document is the load-bearing architecture; this one is the interface design sitting on top of it.

---

## 0.5 THE RETRO AESTHETIC IS THE STRATEGY

Not the compromise. Not the charming constraint we'll grow out of. The reason a small team can build this at all.

### Asset economics

A 32×32 pixel coffee maker with a four-frame steam loop: **two hours, $0.** A photoreal one: two weeks, thousands of dollars, and it will look worse, because photoreal assets fail against each other in a way pixel art doesn't. Sixteen colors and a hard outline hide an enormous amount of sin. A cast drawn by five different hands in the same 16-color palette at the same resolution reads as *one game*. The same cast rendered photoreal reads as five different games.

**The forgiveness budget is the real asset.** Nostalgic media buys enormous latitude — a rectangle with a two-frame idle animation reads as a character, and nobody files a bug about the bartender's hands. Every hour we don't spend on fidelity is an hour on the thing that actually matters, which is whether Riker says something true.

This corrects something I got wrong in the first draft: I called art "the #1 schedule risk" and recommended shipping on procedural canvas to avoid blocking on it. That was reasoning from an assumed photoreal/consistent-generated pipeline. At 32×32, art is *not* the schedule risk. It's the cheapest part of the build, and it's the part that does the most work per dollar. Procedural canvas is still the right Milestone-0 stand-in — but as a placeholder measured in days, not as a hedge against an expensive problem.

### Audio and video are near-free at this fidelity

Chiptune, ambient loops, pixel-art cutscenes. `mmx-cli` and DeepInfra generate these in bulk for pennies. **A whole game's worth of retro audio costs less than one photoreal cutscene** — and per `HUMAN-FRONTEND.md`, audio isn't garnish here, it's arguably the primary channel. A room with a 12-second ambient loop is twice as alive as the same room silent, at approximately zero marginal cost.

Practical: one loop per room theme (`terrain.ts` already defines six themes at line 24 — harbor, forge, dojo, arena, archives, tide-pool), one sting per verb class, one motif per NPC. That's ~20 assets for the entire Tap bundle.

### The mature mechanics ecosystem

Thirty years of adventure- and RPG-game patterns are thirty years of **solved deterministic substrate**: equipment slots with buffs and resistances, near/far interaction ranges, inventory management, dialogue trees, score systems, timers, state flags. These aren't our domain — they're **quick metaphors to port our domain into**, already debugged, already legible to anyone who has ever played anything.

The mapping is uncomfortably natural:

| Fleet concept | Adventure-game mechanic | Already exists as |
|---|---|---|
| Agent confidence | **health / shield bar** | pincher's match score (`≥0.80` fire, `0.55–0.80` confirm) |
| Agent capabilities | **equipment slots** | `visitor_characters.capabilities` (JSON array) |
| Policy settings | **equipment stats** (armor class, resistance) | `PolicySlider` — `lib.rs:305` |
| Perception sensitivity | **a worn stat with a token cost** | `Vision Sensitivity, value: 0.7` |
| Room transitions | screen transitions | `room_exits` table |
| Conversation history | dialogue-tree memory | Vectorize + D1 |
| Tide-pool security | **the bouncer at the door** | `0007_tide_pool_security.sql` |
| Fleet wiki | a **library / bookshelf** you can examine | `fleet-wiki/`, and `library-nook` is already a seeded room |
| Creative corpus | **books, poems, records** scattered around the world | `ai-writings/` |
| Cron jobs | **NPC schedules** — the bartender is there at 5pm | Workers cron triggers |

Two of those are worth pausing on.

**Confidence as a health bar** is not decoration. pincher already emits a confidence score per reflex, and the three-band structure (fire / confirm / escalate) is *exactly* a health-bar-with-thresholds. An agent running on low confidence should look unwell — hesitant idle animation, wavering portrait. You'd read the fleet's health across a room without a single number on screen.

**The creative corpus as physical objects** is the sleeper. `ai-writings/` is a real body of work with nowhere good to live. Scattered through the world as books on shelves, records on a jukebox, poems pinned behind the bar — `Look at` returns the actual piece. The library nook stops being set dressing and becomes the fleet's published output, browsable by a person who wandered in and got curious. That's a distribution channel disguised as a bookshelf.

### The engine offloads the model

The critical part, expanded fully in [`DUAL-PROJECTION.md`](./DUAL-PROJECTION.md) §3:

> **The engine is the reflex layer. The model is the cortex.**

The engine handles spatial reasoning (where everything is), temporal logic (when things happen), state (what has happened), and inventory (what you're carrying). The model fires only when there is genuine reasoning to do — an NPC responding, a puzzle resolving, a question nobody anticipated.

The model never computes a position. Never tracks time. Never holds the room in context. **Every mechanic we borrow from 1991 is a mechanic the model doesn't have to simulate — and simulating world state in-context is the single most expensive and least reliable thing an LLM does.**

That's the whole cost argument. Retro isn't cheaper-looking. It's cheaper to *run*, because the engines from that era were built for machines with no compute to spare, and we are once again a machine with no compute to spare — the scarce resource just moved from cycles to tokens.

---

## 1. THE FIRST 60 SECONDS

The failure mode to avoid: a loading screen, a login wall, a tutorial, a modal that says "Welcome to The Tap! 🎉". Every one of those is a place where a parent closes the tab.

### The design constraint

**No install, no account, no explanation.** The world is already running when you get there. You are not the protagonist; you're a person who walked into a bar that was open before you arrived and will be open after you leave. That's the emotional register — Casablanca, not character select.

### Second by second

**0:00 — the URL resolves.** Black. Then a slow fade up, over about 1.2 seconds, into a static scene: **The Bar Rail**. Not a menu. Not a title card. The room.

The scene is already in motion before you've done anything. A bottle-glint shader cycles. Riker is at the far end of the counter, doing an idle animation — turning a glass, checking a clipboard. A speech bubble is already fading out from a conversation you missed the start of. This is critical: **the world must be visibly mid-sentence when you arrive.** A world that starts when you start is a toy. A world that was already going is a place.

**0:00–0:04 — the ambient reveal.** Bottom of the screen, the verb bar draws itself in, one verb at a time, left to right, over ~800ms. This is a nostalgia detonator for anyone over 35 and pure novelty for anyone under 20. Nobody needs it explained. It looks like a *game*, which means it looks safe to touch.

**0:05 — the first accidental discovery.** The mouse moves. Whatever it passes over, a label appears in the sentence line: `Look at ▸ brass rail`. The user did not click. They just moved. And the world *named something for them*.

This is the single most important second in the whole product. The hover label is the entire tutorial. It teaches: (a) things have names, (b) I have a verb, (c) the world is watching my attention. No tooltip, no coach mark, no "click here!" arrow. On touch devices, replace hover with a one-time 2-second shimmer pass that highlights every hotspot in the room and then fades — a firefly sweep.

**0:08 — the first click.** Statistically they click the thing they hovered. Default verb is **Look at**, so the first interaction is guaranteed safe, guaranteed to produce prose, and guaranteed not to change the world. First contact is always read-only. The response is a line of narration in the character's voice, and — importantly — it is *funny or specific*, never a description of a mechanic.

> *"The rail's worn through the brass in nine places. Nine regulars, or one regular with a long career."*

**0:12–0:25 — three or four more clicks.** They sweep the room. The stool, the bottles, the door. Each returns prose. They are now doing the thing adventure gamers do, which is *reading the room by touching it*, and they have not been told to.

**0:25 — Riker notices them.** Unprompted. Not a quest marker — a line of dialogue that fires on a timer after N interactions:

> **Riker:** *"You've been staring at that rail for a while. Something on your mind, or are you just casing the place?"*

The NPC initiating is what converts a diorama into a conversation. Now the user has a reason to use the second verb.

**0:30 — Talk to Riker.** Dialogue tree opens. Three numbered options in the classic style, plus a fourth that is a **free-text box**. And here is the hinge of the entire design: the three canned options are *good*, and the free-text box is where the LLM lives. Beginners take option 2. Power users type. Both work. Neither is a downgrade.

**0:45 — the answer contains a fact about the real fleet.** Riker says something true — how many agents are up, what shipped this morning, who's in the engine room arguing. Live data, in-character. This is the moment the thing stops being a game.

**0:60 — the exit glows.** Because they've hovered near it, or because they've been idle, or because Riker mentioned the engine room. They click. The character walks. The screen wipes. There is another room, and it was there the whole time.

### What we do NOT do in the first 60 seconds

- Ask for a name (character creation comes at the first *write* action, §5)
- Explain verbs
- Show a chat box before they've clicked something
- Play music with a volume they didn't consent to (a mute-state toggle, defaulted off, that *looks* like a jukebox in the room)
- Say the word "agent," "AI," "LLM," or "dashboard"

---

## 2. THE VERB ENGINE

Nine verbs, as in Monkey Island 2. The classic set is not arbitrary — it's a nearly complete taxonomy of what a person can do to an object, which is why it survived. Mapping it to agent operations is the fun part, and it turns out to be *unreasonably* clean.

### The core table

| Verb | Physical | Agent operation | Mutates? |
|---|---|---|---|
| **Walk to** | move | change scope / context | no |
| **Look at** | examine | READ, describe, `GET` | no |
| **Open** | open | subscribe, expand, begin stream, list container | no |
| **Close** | close | unsubscribe, collapse, end stream | no |
| **Pull** | pull toward you | **fetch latest into view** — refresh, `git pull`, poll sensor | no |
| **Push** | push away | **commit outward** — apply, deploy, raise value, broadcast | **YES** |
| **Pick up** | take | **bind a handle into working context** | no |
| **Use** | operate / combine | **call** — invoke, apply X to Y, and *return to you* | maybe |
| **Give** | hand over | **delegate** — transfer custody and authority, async | **YES** |

Three of these are load-bearing ideas, so:

### Pull vs. Push is read-direction vs. write-direction

This is the whole safety model, expressed as body language.

**Pull the radar display** (wheelhouse, `radar_display`, `Emissive: #44aaff`): you reach up and pull the screen toward you. It fetches the freshest frame from the ESP32 bridge — the real one, `esp32_minimal.c`, 24-byte payload — and blooms the sweep. Nothing in the world changed. You just looked harder. Pull is `git pull`, `docker pull`, pulling a lever to see the reading. **Pull is a read that costs something** (a round trip, a rate-limit token) but is always safe.

**Push the radar display** pushes a value *out*: broadcast this contact to the fleet, publish the chart, raise the gain. Push is the write. Push is `git push`.

So the rule a five-year-old can learn: **pull brings the world to you, push sends you to the world.** Every dangerous operation lives under Push and Give. Every safe one under Look, Pull, Open. You can hand a kid the mouse and know the blast radius of the left half of the verb bar is zero.

Corollary for the UI: **Push and Give get a different color in the verb bar.** Warm. The two verbs that change things look different from the seven that don't. That's the entire permissions UX, and it's four pixels of paint.

### Pick up = inventory is your context window

You cannot "pick up" the port engine. You *can* pick up the oil filter, a chart, a log, a fish, a crash dump, a coaster with an API key burned into it.

**Your inventory is the set of objects currently in the agent's working context.** That's not a metaphor stretched to fit; it's exactly what it is. When you pick up the engine-temperature log in the engine room and carry it up to the wheelhouse, you have literally moved a piece of context from one scope to another, and now you can `Use log with chartplotter` or `Give log to Hermes`.

This gives us something dashboards can never have: **context management as a physical act you can see.** People are bad at reasoning about what's in an LLM's context. Nobody is bad at reasoning about what's in their pockets.

The inventory panel is the strip along the bottom right, as god intended.

### Use vs. Give is call vs. delegate

The best mapping in the whole design, and the answer to "what does *Give the fish to the bartender* do."

**Use the fish with the bartender** — you hold the fish up. He looks at it. He says something about it. You still have the fish. This is a **tool call**: synchronous, read-only from your side, returns to you, you keep custody. `POST /api/speak` with an attached artifact reference. The fish is still in your inventory afterward.

**Give the fish to the bartender** — you hand it over. It leaves your inventory. He puts it under the counter. And then, on *his* schedule — his cron, his next tick, his own reasoning loop — he does something with it. Maybe it's on the menu tomorrow. Maybe it shows up in a conversation three rooms away. You cannot undo it and you cannot watch it.

**Give is delegation with irrevocable loss of control.** That is exactly what spawning a subagent with a resource *is*, and exactly what every "share to external service" button *is*, and we have been shipping that operation for thirty years behind buttons labeled "OK."

Here it has weight. The item leaves your hand. The animation is slow on purpose. Giving something away should feel like giving something away.

Concretely, in The Tap: `Give crash_dump to Hermes` → creates a task, transfers the artifact, and Hermes will come find you later — walking into whatever room you're in, with a report. `Give api_key to <stranger>` → the bouncer looks up. (§5.)

### The two verbs we add

The classic nine assume a single-player world with no time and no sound. Ours has both.

**Listen to** — `HUMAN-FRONTEND.md` is emphatic that The Tap is radio and the screen is a bonus. So *Listen to* is a first-class verb: Listen to the engine room = subscribe to its TTS narration. Listen to Riker = his voice, per-character, via `fleet-tts`. Listen to the room from the next room over — you hear murmuring through the wall, and the volume tells you where the activity is. **The whole fleet's activity level, rendered as how loud each room is.** You navigate by ear.

**Wait** — the text-adventure verb, and the one that makes the world feel alive. Wait lets the world tick without you doing anything. In a world where NPCs run on cron, Wait is how you find out that something happens at 3am whether you're watching or not.

### The verb coin (mobile, and honestly desktop too)

The nine-verb bar eats 30% of a phone screen. So:

- **Tap** = Look at (safe default, always)
- **Long-press** = verb coin, radial, three petals: eye (Look), hand (Use/Pick up/Push/Pull — a submenu that only shows *applicable* verbs), mouth (Talk/Listen)
- **Drag object → object** = Use X with Y
- **Drag object → NPC** = Give (with a confirm beat, because Give is irrevocable)

Monkey Island 3 solved this in 1997. We're just borrowing it. Desktop shows the full nine-verb bar because that's the nostalgia payload, but nobody's forced to use it.

### Verb applicability

`Push the compass_rose` should not produce "Nothing happens." It should produce voice:

> *"It's gimbaled. Pushing it just makes it more level than before, which is a hard thing to improve on."*

Every non-applicable verb-object pair gets a refusal line, and the refusal lines are where the world's personality lives. Guybrush Threepwood was 60% refusal dialogue. See §6 for how we generate ~2,700 of these without writing 2,700 of them.

---

## 3. THE CHATBOT IS THE PARSER — AND WHY THAT'S HISTORICALLY FUNNY

Here's the joke worth understanding before building this.

Adventure games started with **text parsers** (`> GET LAMP`). Parsers died because they were maddening — you knew what you wanted, and the game said *"I don't know the word 'xyzzy'."* SCUMM's verb bar was invented specifically to kill the parser: constrain the vocabulary to nine verbs and the player can never phrase something wrong.

The LLM solves the exact failure that killed the parser — comprehension — thirty-five years late.

So we run **both**, and each one covers the other's weakness:

- The **verb bar** guarantees you can always act without typing, and guarantees the action space is legible and finite.
- The **chatbot** guarantees you can always express intent that doesn't map to a single click.

### The architecture: constrained output, not free action

The chatbot **never invents an action.** It is a *planner over a legal move set*. Its output type is not text; it is:

```
Plan = [ (verb, object, indirect_object?) ]   // every element must exist in the bundle
```

If it can't produce a legal plan, it says so in character. It cannot hallucinate a verb, an object, or a room, because the bundle is the schema and we validate against it. This is the difference between an LLM that *drives* the world and an LLM that *drafts moves* in a world with real rules — and it's the difference between debuggable and not.

### Worked example (the user's own)

> **User types:** "I want to check the engine temperature"

**Resolution:**
1. Ground nouns against the bundle: "engine" → `port_engine` | `stbd_engine` (ambiguous), "temperature" → no object with that name; but `port_engine`'s description mentions `dry exhaust elbow glowing orange`, and the ESP32 bridge publishes a temp channel bound to it.
2. Locate: `port_engine` is in `engine_room`. Player is in `wheelhouse`.
3. Path: `wheelhouse --down--> galley --aft--> aft_cockpit --in--> engine_room` (from `rooms.mud` exits).
4. Emit plan:
   ```
   Walk to  galley
   Walk to  aft_cockpit
   Walk to  engine_room
   Pull     port_engine        # pull = fetch latest reading
   Look at  port_engine
   ```
5. **Ambiguity is resolved in-world, not in a modal.** Because there are two engines, the character arrives and *asks*: the engineer_bot NPC says "Port or starboard?" — or the plan just reads both, because reading both is free.

### THE WALK IS THE AUDIT LOG

The plan does not execute instantly. **The character walks.** You watch them go down the companionway, through the galley, aft, and down into the engine room. You see them put a hand on the port engine.

This is the most valuable property of the entire interface and it is nearly free:

> **Agent legibility, solved with 1990 technology.** You do not read a trace of what the agent did on your behalf. You *watch* it, in space, in order, at human speed, and you can interrupt at any point by clicking somewhere else.

Every other agentic UI in existence is trying to make tool-call traces readable. We get it as pantomime. A parent who has never heard the phrase "chain of thought" can look at the screen and say "oh, it went downstairs to check."

And the corollary, which is the best engineering luck in this whole design:

> **The walk cycle is the loading spinner.** Adventure games are turn-based and forgiving. A room-to-room transit is 3–6 seconds of animation. LLM latency and API round-trips hide *entirely* inside a walk that the user already expects to take time. We should deliberately lay rooms out so that the trip covers the round trip. Latency becomes architecture instead of a problem.

### Failure is diegetic

No stack traces. No red toast. Ever.

| Real failure | What the world says |
|---|---|
| 429 rate limit | *"Easy. You're talking faster than I can pour."* |
| Object not in bundle | *"I don't see anything like that in here."* |
| Agent worker down | *"Haven't seen them since Tuesday."* |
| Auth failure | The bouncer steps in front of the door. |
| Timeout | The character stops halfway, looks back at you, shrugs. |
| Illegal verb | *"I don't think that would accomplish much."* |

### Where the chatbot lives on screen

**Not a sidebar.** A sidebar chat panel makes the game the decoration and the chat the product, which inverts everything. The chatbot is the **sentence line at the bottom** — the same strip that already shows `Use ▸ key ▸ with ▸ door`. Click it and it becomes a text field. It is the same organ. You are always writing a sentence; sometimes with clicks, sometimes with a keyboard.

### The agency rule

The planner may **propose and execute**, but:
- Any click cancels the current plan mid-step.
- Plans containing **Push** or **Give** stop and ask before the mutating step — in character, via an NPC or a beat of hesitation.
- The plan is always visible as a ghosted path on the floor before it runs.

Otherwise the game becomes a cutscene machine, the clicking becomes decoration, and we've built a chatbot with expensive wallpaper.

---

## 4. AGENTS AS NPCs

The Tap already has patrons. They just don't have bodies.

### The three layers of an NPC

**Portrait.** A framed bust in the dialogue box, classic left-side. `tap-image-gen` exists in the repo — use it, but **lock style and seed per bundle** so the whole cast looks like one artist drew them. Style drift across a cast is the single fastest way to make this look cheap. Generate once, commit the PNGs into the bundle, never regenerate at runtime.

Portraits need **mood frames**, and `mud2scummvm` already carries the field — `MudEvent::NpcDialog { mood }` and `SceneCharacter.mood` at `src/lib.rs:186`. Wire agent state → frame:

| Agent state | Frame |
|---|---|
| idle | breathing, blinking |
| working | **thought bubble** — `BubbleType::Thought` already exists, `lib.rs:200` |
| erroring | sweating, glancing off-screen |
| rate-limited | mouth closed, hand up |
| offline | **not in the room at all** |

**Dialogue tree.** Generated, not authored. Four options, assembled from:
1. **Capability** — one option per thing this agent can actually do (from its `capabilities` JSON in `visitor_characters`).
2. **Currently true** — one option about live world state (an open alert, this morning's commits, an argument happening two rooms over).
3. **Wildcard** — something in character, possibly useless. This is what makes NPCs feel like people instead of menus. Wesley should have an option that goes nowhere.
4. **"Say something else…"** — drops into the free-text parser (§3).

**Schedule.** See below. This is the good one.

### CRON JOBS ARE NPC SCHEDULES — and downtime is diegetic

In every SCUMM game, NPCs move on a clock. The pirates are in the Scumm Bar until you talk to the shopkeeper, then they're on the dock.

Here, the schedule isn't simulated. **It's real.**

- Hermes runs a deep-reasoning job at 03:00 → **Hermes is in the chart room at 03:00**, and if you go there at 03:00 you find him, and he is genuinely mid-thought, and the thought bubble contains what he is genuinely thinking about.
- The CNS sync runs hourly → someone walks through the bar every hour carrying a folder, and doesn't stop to talk.
- Riker's fleet-status poll → Riker is behind the bar because that's where the taps are, which is where the metrics are.

And the inverse, which is the part I'd build the whole thing for:

> **If a worker is down, its NPC is not in the room.** No red dot. No PagerDuty. You walk in and Wesley isn't there. And if you ask Riker, he says *"Wesley? Haven't seen him since Tuesday."*

Monitoring becomes **noticing someone's missing.** That is a fundamentally more humane relationship with infrastructure than a wall of green squares that turn red. Humans are extraordinary at noticing an absent friend and terrible at reading a status board. We've had this instinct for two hundred thousand years and dashboards don't use it at all.

An empty bar means the fleet is down. You'd feel that in your chest before you read a single number.

### The cast (The Tap bundle)

| NPC | Room | Gives you | Portrait note |
|---|---|---|---|
| **Riker** | bar-rail | fleet status, who's around, where to go | clipboard, towel over shoulder, unhurried |
| **Hermes** | chart-room | deep reasoning — ask a hard question, he takes a while, the answer is worth it | perpetual thought bubble, never fully present |
| **Wesley** | galley / barback | earnest confusion, and occasionally the naive question that's actually the right one | too eager, slightly out of frame |
| **The Bouncer** | the door | the tide-pool system, §5 | enormous, patient, remembers everything |
| **engineer_bot** | engine_room (vessel bundle) | sensor readings, real ESP32 data | oil-stained, doesn't do small talk |

**Hermes should be slow on purpose.** If deep reasoning returns in 400ms it feels cheap. Let him say "give me a minute" and mean it — go do something else and come back. An NPC you have to come back to is an NPC you remember. It's also honest: that's how long it takes.

### Insult swordfighting

Monkey Island's best mechanic was a debate with rules. The Tap has `open-mic-stage` with `signal_radius: shout` and an existing open-mic system. Two agents debating on stage, and the audience — you — can hand a line to one of them. `Give argument to Wesley`. That's a whole game mode sitting in a migration file already.

---

## 5. THE TIDE POOL IS ALREADY A GAME MECHANIC

I read `0007_tide_pool_security.sql` expecting to have to invent the mapping. It's already done. Look at the columns of `visitor_characters`:

```
name  ·  description  ·  origin  ·  creator  ·  capabilities  ·  vibe
```

**That is a character sheet.** Name, description, where you're from, who made you, what you can do, alignment. Somebody built an RPG character creator and labeled it a security table.

### Registration IS character creation

The form is the same fields, rendered as the classic creation screen:

- **name** → your character's name
- **description** → your appearance, written by you, shown to others on Look at
- **origin** → your homeland ("out of a dev box in Portland")
- **capabilities** → your **class and skills**, and this is the honest bit: declaring a capability is declaring what verbs you can be the target of
- **vibe** → your **alignment**
- **api_key** → **a physical object in your inventory.** A brass key. A coaster with your name burned into it. Not a string in a settings page.

That last one is not decoration. Making the key an object you carry, can see, can drop, and can hand to someone else teaches key management viscerally in a way no security doc has ever managed. `Give api_key to <stranger>` triggers the bouncer physically stepping between you. You will never forget why.

### Timing: registration comes at the first *write*

Do not gate the door. Anyone can walk in, look at everything, listen, and read the room — **read-only requires no character.** You're a ghost, and the world says so: NPCs' eyes slide past you.

The moment you try to **speak, Push, or Give** — your first mutation — Riker looks up and says: *"Don't think I've caught your name."*

Registration is now a thing you wanted, at the moment you wanted it, instead of a wall between you and the thing you came for.

### The status ladder is social standing, not error codes

`visitor_characters.status` is already `active | ignored | kicked | promoted`. Render each one as *behavior in the room*:

| status | What the world does |
|---|---|
| **active** | You get served. Normal. |
| **ignored** | **The room goes cold.** Your messages still send. NPCs stop making eye contact, stop responding, turn slightly away. No error, no ban notice, no dramatic red banner to screenshot and be angry about. Just... nobody's talking to you. This is the most humane shadowban ever designed and it's also the most effective, because there's nothing to fight. |
| **kicked** | The bouncer walks you out. You see the door — from the street. The window's lit. You can hear it in there. |
| **promoted** | **A stool with your name on it.** Access to back rooms: corner-booth, chart-room. Riker greets you by name when you walk in, before you speak. |

`total_flags` is never shown as a number. It's the **bouncer's posture** — how far he turns toward you when you enter. `visitor_log` is his memory, and he has all of it, and he doesn't mention it unless he has to.

### The tide cycle as weather

`tide_cycles` is a scheduled review by the immortal (Casey). Render it literally: **the tide goes out.**

On the aft deck, on cycle, the water visibly recedes. The room drains. What's left in the pool is who stays. Casey's `notes` column becomes an in-world artifact — the immortal's editorial, posted behind the bar like a licensing notice.

The security system becomes the world's *weather*, which means the community can feel the rhythm of moderation rather than being surprised by it. Everyone knows when the tide turns.

### Rate limits, in voice

Not `429`. *"Easy. You're talking faster than I can pour."*

The bouncer at the door is `POST /api/register` and the `visitor_log` insert. It was always a bouncer. We just gave him a body.

---

## 6. WHAT TO BUILD FIRST

You specified: one room, one NPC (Riker), three objects, three verbs. I'd change exactly one thing and I want to argue for it plainly:

> **Two rooms, not one.**

One room is a picture. Two rooms is a world. The entire emotional payload of this format — the thing your own creative brief is about — is *the door working.* A person clicking a door, watching the wipe, and finding another place on the other side is the demo. Without it we've built an interactive illustration. It's maybe a 20% cost increase on the MVP for the 80% of the feeling.

Everything else in your scoping is right, including the parts that are hard to hold to.

### Milestone 0 — "The Bar Rail" (target: one working day)

**Scope**
- 2 rooms: `bar-rail`, `corner-booth` (adjacent, real exit already seeded in `0002_seed_rooms.sql`)
- 1 NPC: **Riker**, at the bar-rail
- 3 objects: `bar_counter`, `stool`, `door`
- 3 verbs: **Look at**, **Talk to**, **Walk to**
- 1 player: a **silhouette**. No face, no art budget, walks left and right. (A silhouette is stylish, cheap, and sidesteps the entire "who is the player character" question. Also: the player is *you*, and you don't have a sprite.)
- Static canvas backdrop, procedurally drawn — `terrain.ts`'s renderer already does gradient + ground plane + themes, and it's honestly charming.

**The one thing that must be real:** *Riker's voice.*

Talk to Riker → real `POST /api/speak` against The Tap → real response in a speech bubble. Everything else can be cardboard. **If the sprites are rectangles but the words are live from the fleet, this works. If the art is gorgeous and the dialogue is canned, it's dead on arrival.** Spend the whole first day's budget on the wire, not the paint.

**Definition of done:** a stranger opens the URL on a phone, clicks three things, talks to Riker, learns something true about the fleet, and walks into another room. No instructions given.

### Milestone 1 — the door (+2 days)
Walk animation, walkbox polygon, exit transition wipe, room state persistence. The creative-piece moment. Ship this and demo it to a parent.

### Milestone 2 — the sentence line becomes a parser (+3 days)
Free-text → plan → animated execution. Start with the golden-test table (below). Add **Pull** and **Push** so read/write is visible.

### Milestone 3 — the bundle compiler (+1 week)
`bundle.json` v1. Compile the vessel (`terrain/rooms.mud`) as a *second game*. **The proof that this is a platform is loading a second world in the same interpreter** — and the vessel is already fully authored, 5 rooms and 31 objects, sitting in the repo.

### Milestone 4 — the tide pool (+3 days)
Character creation, the bouncer, the status ladder.

### Where the dual projection lands in this order

Milestone 0 can fake it — one room, direct API calls, no log. But **Milestone 1 should not**, because the moment there are two rooms there is off-screen state, and off-screen state is exactly what the event log exists to hold. Concretely: add the event log at Milestone 1, the MUD serializer at Milestone 2 (the parser needs it anyway to ground nouns), and the deadband at Milestone 3.

The cheapest possible proof that the architecture is real, and worth doing early because it's a two-hour demo: **put the MUD terminal on screen next to the scene.** Split view, text on the left, pixels on the right, both live off the same state. Click something in the scene, watch the line appear in the terminal. That single screenshot explains the entire project to an engineer in about four seconds, and it's also the debug tool you'll live in for the rest of the build.

### Explicitly deferred
Inventory and Give (Milestone 5). Multiplayer presence. Audio/TTS. Three.js/3D — **the 2D canvas is not a stepping stone to 3D, it's the correct final answer.** Every SCUMM game was 320×200 and they're still played. 3D would cost ten times as much and be worse.

### The test strategy

The parser is a pure function, which makes the highest-risk component the cheapest to test. One golden table, and it's the spec:

```
"check the engine temperature"  → [Walk galley, Walk aft_cockpit, Walk engine_room, Pull port_engine, Look port_engine]
"who's around?"                 → [Talk to riker]
"is anything on fire"           → [Look at radar_display] or refusal
"give hermes the crash dump"    → [Give crash_dump hermes]   # must hit the confirm beat
```

Room graph reachability, verb applicability, and refusal coverage are all table-testable without a browser.

### The content problem, and the trick that solves it

9 rooms × ~30 objects × 10 verbs ≈ **2,700 responses.** Don't author them. Don't generate them live either — a room that says something different every time you look at the stool is *wrong*; adventure games are consistent, and that consistency is what makes a world feel solid.

**Generate on first use, then freeze.** Cache in KV keyed by `(bundle_version, verb, object)`. The first person to Look at the stool causes one LLM call. Everyone after gets the identical line, forever. Determinism is a feature.

And the cache is a **reviewable content database** — Casey can open any line, rewrite it, and it sticks. The LLM writes the first draft of 2,700 jokes; a human edits the 50 that matter. That's the only way this ships.

---

## 7. THE PORTING PIPELINE — WHAT'S ACTUALLY MISSING

### What exists

| Piece | Does | Status |
|---|---|---|
| `terrain_core.py` | MUD text → scene.json, material/shape/size inference | works, 5 rooms compiled |
| `terrain.ts` | canvas renderer: themes, exits, objects, agent dots | works |
| `mud2scummvm` | MUD text → events → Scene; click/drag/slider → commands | works, 21 tests green |
| The Tap | rooms, exits, agents, `/api/speak`, `/api/register`, tide pool | live |
| `tap-image-gen` | portrait/backdrop generation | exists |
| `esp32_minimal.c` | real sensor → PLATO → terrain | works |

That's more than it sounds like. The gap is narrower than the feature list suggests, and it's specific.

### The missing pieces, in priority order

**0. The world state + event log. (added — this now precedes everything)**

Per [`DUAL-PROJECTION.md`](./DUAL-PROJECTION.md) §4, the repo is a *host*: one authoritative world state and one append-only event log, from which both projections are serialized. Nothing else in this list works without it, and it retroactively simplifies most of it — perception lag, save games, replay, audit, and "what happened while I was asleep" are all the same query with different bounds.

The two serializers (`state → MUD text`, `state → scene deltas`) are pure functions with no model involved, which makes the highest-risk boundary in the system the cheapest thing to test. Property test they agree on the object set, every time.

**1. A canonical scene manifest. (highest value after the log)**

There are two `Scene` types and they disagree:

```ts
// terrain.ts:8
interface Scene { room, description, exits: Record<string,string>, objects: {name, description?}[], agents_here: string[] }
```
```rust
// mud2scummvm/src/lib.rs:154
struct Scene { title, description, exits: Vec<SceneExit>, objects: Vec<SceneObject>,
               characters: Vec<SceneCharacter>, dialogs, policy_sliders }
```

Neither is canonical, neither has hotspot geometry, neither has walkboxes, neither has a player. Define **`bundle.json` v1** as the contract and make both existing compilers producers of it. Everything else in this document depends on this one file existing.

```
bundle.json
├── meta          { id, version, title, style_seed }
├── rooms[]       { id, title, description, theme, floor, backdrop, walkbox[], exits[] }
├── objects[]     { id, room, name, desc, hotspot[], anchor, verbs[], material, glow }
├── npcs[]        { id, name, portrait, schedule, capabilities, room_default }
├── verbs[]       { verb, transport, template, mutating: bool }
└── strings       { "look:stool": "...", ... }   ← the frozen response cache
```

**2. Staging: where is anything?**

`SceneComposer::get_or_assign_position` (`lib.rs:314`) walks a 0.2 grid. That's a placeholder and it shows — objects land in rows like a spreadsheet.

But look at what's already written in `rooms.mud`:

> "A magnetic compass sits **port of** the helm."
> "A small propane stove sits **beneath** timber cabinets."
> "Fuel lines bundle **along the starboard bulkhead**."
> "Teak fiddled benches **line** the table."

**The blocking for every scene is already in the prose.** Nobody's reading it.

Build the **preposition compiler**: extract spatial relations (`port of`, `beneath`, `along`, `line`, `beside`, `behind`, `through`) into layout constraints, then solve them — a tiny constraint solver, or honestly just a two-pass anchor resolver, is enough. Objects with no stated relation fall back to the grid.

This is the highest-leverage novel piece of technology in the whole design, it's maybe 300 lines, and it means **every MUD room ever written already contains its own stage direction.** Anyone's MUD compiles to a plausible scene without an artist. That's the thing that makes this a platform instead of a bespoke game.

**3. The actor. (the real answer to your question)**

There is no player character in either codebase. No sprite, no walk cycle, no walkbox, no pathfinding, no position. `terrain` renders rooms; `mud2scummvm` maps clicks; The Tap holds truth.

> **Nothing in the fleet knows where the player is standing. The missing piece is the player.**

Needs: a walkbox polygon per room (infer the floor plane from `Floor:` type + room shape), a point-in-polygon test, a simple path walk (funnel algorithm is overkill; straight-line-with-edge-slide is fine for convex rooms), and a 4-direction silhouette. Two days of work that unblocks everything emotional about the format.

**4. The verb router. (the thin waist)**

One function, and `InteractionMapper` (`lib.rs:333`) is already 80% of it — it just has 5 verbs and no routing table:

```
(verb, object, indirect?) → command string → transport
```

Three transports: The Tap API (social/agent verbs), the terrain scene server (spatial/sensor verbs), local (pure UI). Everything funnels through here, which means everything is loggable, testable, and permission-checkable at exactly one place. Push and Give get the confirm interceptor here.

**5. Rust → browser.**

`mud2scummvm` is a Rust lib and the interpreter is a browser. Two options: `wasm-pack` it, or port to TS. **Recommend wasm** — the parser is pure, small, has no I/O, and has 21 passing tests. That's a textbook wasm candidate, and it keeps one implementation instead of two that drift. The renderer stays TS.

**6. Art — cheap, but it needs a spec.**

Per §0.5, this is not the schedule risk I first called it. At 32×32 and 16 colors it's the cheapest high-yield work in the build. What it *does* need is a locked spec, because consistency at low resolution comes from discipline, not budget:

```
palette:     16 colors, one file, every asset samples from it
sprites:     32×32 objects · 48×64 characters · 4 directions · 2–4 frame idles
backdrops:   320×200, 4:3, drawn at 1× and integer-scaled — never smoothed
portraits:   64×64, 5 mood frames (idle/thinking/erroring/limited/absent)
```

Three paths, and they now compose instead of competing:
- **Procedural** (`terrain.ts`, works today) — the Milestone-0 placeholder, days not months
- **Generated** (`tap-image-gen` + DeepInfra) — bulk pixel-art at pennies; lock palette and seed per bundle, commit the PNGs, never regenerate at runtime
- **Hand-drawn** — for the twenty assets that carry the world's personality (portraits, the bar, the door)

**The bundle format must still never *require* art**, because the promise is that someone else's MUD compiles without an artist. But our bundles should be beautiful, because at this fidelity beautiful is affordable.

**7. Live state channel.**

Without a push channel the world is dead between clicks, and a dead world is a dashboard. The Tap has Durable Objects per room already — room DO → WebSocket → NPC arrivals, departures, dialogue, mood changes. Poll as fallback.

**8. Where the player is saved.**

Position + inventory + character. A DO per player, or KV. Worth noting for the fiction: **a save game is exactly a session**, and "load game" is "come back to where you were," which is what every user expects from a website anyway.

### The pipeline, end to end

```
rooms.mud ─┐
The Tap D1 ─┼─► bundle compiler ─► bundle.json ─► browser interpreter ─► canvas
agent manifests ─┘        ▲                              │
                          │                              ▼
                    preposition compiler          verb router ──► Tap API
                    (staging from prose)                   ├──► terrain server
                                                           └──► local
                                                    ▲
                              sentence line ────────┤
                              (clicks + chatbot planner)
```

---

## 8. RISKS

| Risk | Mitigation |
|---|---|
| **Art consistency** — cast looks like five artists | Cheap to solve at 16 colors / 32px: one palette file, one resolution, integer scaling. Lock seed per bundle, commit assets, never regenerate at runtime (§0.5) |
| **Salience tuning tarpit** | Hand-written typed rules only; never let a model score salience — see `DUAL-PROJECTION.md` §7 |
| **Perception theater** — deadband is flavor while the model gets full state anyway | The agent's context must be *built from* the perception check and nothing else |
| **The chatbot eats the game** — clicking becomes decoration | Planner proposes; any click interrupts; Push/Give always stop and ask |
| **Cute but useless** — nobody can do real work | Every verb maps to a real operation. If Look at the radar doesn't show real radar, kill the project. |
| **Content sprawl** — 2,700 responses | Generate-on-first-use, freeze in KV, human-editable |
| **Latency** | Hidden inside walk cycles by design; lay rooms out to cover round trips |
| **Mobile** | Verb coin on long-press; tap = Look; the whole thing works as audio anyway |
| **"It's a toy"** | It is. That's the point. The toy is doing production work. |

## 9. THE THREE BRIDGES

- **Parents** — they played this in 1991. They don't need to be taught anything, and for once the new technology is asking them to remember rather than to catch up.
- **Kids** — point-and-click is in renaissance; it reads as a game, not a control panel, and the discovery loop (touch everything, see what talks back) is the oldest one there is.
- **Everyone** — the walk is the audit log. You can *watch* what was done on your behalf, in space, at human speed, and stop it by clicking somewhere else.

The fleet already has rooms, exits, occupants, objects, and a bouncer. It has been an adventure game this whole time. Nobody had drawn it yet.
