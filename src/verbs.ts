/**
 * verbs.ts — the thin waist.
 *
 * Every interaction in the world — a click on the verb bar, a drag, or a step
 * in a plan produced by the chatbot parser — funnels through resolve() and
 * comes out as a single command string plus a transport. That makes the whole
 * world loggable, testable, and permission-checkable in exactly one place.
 *
 * Descended from mud2scummvm's InteractionMapper (src/lib.rs:333), which does
 * the string mapping for 5 verbs but has no routing and no notion of risk.
 */

export type Transport = 'tap' | 'terrain' | 'local';

export interface VerbDef {
  verb: string;
  transport: Transport;
  /** Does this change state anywhere outside the browser? */
  mutating: boolean;
  /** Can the player take it back after it lands? */
  revocable: boolean;
  /** Stop and ask, in character, before executing. */
  confirm: boolean;
  template: (obj: string, indirect?: string) => string;
}

/**
 * The seven safe verbs. Nothing here changes the world, so nothing here
 * needs a confirm beat. Pull costs a round trip but is still a read.
 */
export const SAFE_VERBS: VerbDef[] = [
  { verb: 'walk to', transport: 'local',   mutating: false, revocable: true, confirm: false,
    template: (o) => `go ${o}` },
  { verb: 'look at', transport: 'tap',     mutating: false, revocable: true, confirm: false,
    template: (o) => `examine ${o}` },
  { verb: 'open',    transport: 'tap',     mutating: false, revocable: true, confirm: false,
    template: (o) => `open ${o}` },
  { verb: 'close',   transport: 'tap',     mutating: false, revocable: true, confirm: false,
    template: (o) => `close ${o}` },
  { verb: 'pull',    transport: 'terrain', mutating: false, revocable: true, confirm: false,
    template: (o) => `pull ${o}` },
  { verb: 'pick up', transport: 'local',   mutating: false, revocable: true, confirm: false,
    template: (o) => `take ${o}` },
  { verb: 'talk to', transport: 'tap',     mutating: false, revocable: true, confirm: false,
    template: (o) => `talk to ${o}` },
];

/**
 * TODO(casey): the two mutating verbs.
 *
 * These are the only verbs that change anything, so this table IS the
 * permission model for the entire interface. The design doc (§2) argues:
 *
 *   Use  = call     — synchronous, returns to you, you keep the item
 *   Push = commit   — writes a value outward (deploy, publish, raise a policy)
 *   Give = delegate — transfers custody; the agent acts on its own schedule;
 *                     the item leaves your inventory and you cannot undo it
 *
 * The open question is how hard to make Give. Options, roughly:
 *
 *   (a) Give is irrevocable and always confirms. Honest about what delegation
 *       is, but a confirm dialog every time gets clicked through by week two,
 *       and then it's just friction that trained people to ignore it.
 *   (b) Give is irrevocable but confirms only when the target is an agent you
 *       haven't given to before, or when the item is sensitive (api_key).
 *       Fewer prompts, so the prompts still mean something.
 *   (c) Give has a grace window — the item sits on the counter for ~30s and
 *       you can take it back. Forgiving, but it lies about what delegation is,
 *       and the lie will eventually bite someone.
 *
 * Fill in USE, PUSH, and GIVE below. Your call on the confirm/revocable
 * semantics — you know what the fleet actually does with delegated work and
 * whether a 30-second regret window is honest or a comfortable fiction.
 */
export const MUTATING_VERBS: VerbDef[] = [
  // USE  — ?
  // PUSH — ?
  // GIVE — ?
];

export const VERBS = [...SAFE_VERBS, ...MUTATING_VERBS];

export function resolve(verb: string, obj: string, indirect?: string):
  { command: string; transport: Transport; confirm: boolean } | null {
  const def = VERBS.find((v) => v.verb === verb);
  if (!def) return null;
  return { command: def.template(obj, indirect), transport: def.transport, confirm: def.confirm };
}
