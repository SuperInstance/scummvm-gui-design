/**
 * Tests for verbs.ts — the thin waist.
 *
 * Tests the resolve() function, SAFE_VERBS, and VerbDef properties.
 */

import { describe, it, expect } from "vitest";
import { SAFE_VERBS, MUTATING_VERBS, VERBS, resolve, type VerbDef } from "../src/verbs.js";

describe("SAFE_VERBS", () => {
  it("has exactly 7 safe verbs", () => {
    expect(SAFE_VERBS).toHaveLength(7);
  });

  it("all safe verbs are non-mutating", () => {
    for (const v of SAFE_VERBS) {
      expect(v.mutating).toBe(false);
    }
  });

  it("all safe verbs are revocable", () => {
    for (const v of SAFE_VERBS) {
      expect(v.revocable).toBe(true);
    }
  });

  it("no safe verb requires confirmation", () => {
    for (const v of SAFE_VERBS) {
      expect(v.confirm).toBe(false);
    }
  });

  it("includes walk to, look at, open, close, pull, pick up, talk to", () => {
    const verbs = SAFE_VERBS.map((v) => v.verb);
    expect(verbs).toContain("walk to");
    expect(verbs).toContain("look at");
    expect(verbs).toContain("open");
    expect(verbs).toContain("close");
    expect(verbs).toContain("pull");
    expect(verbs).toContain("pick up");
    expect(verbs).toContain("talk to");
  });
});

describe("SAFE_VERBS templates", () => {
  it("walk to produces go command", () => {
    const walk = SAFE_VERBS.find((v) => v.verb === "walk to")!;
    expect(walk.template("north")).toBe("go north");
  });

  it("look at produces examine command", () => {
    const look = SAFE_VERBS.find((v) => v.verb === "look at")!;
    expect(look.template("painting")).toBe("examine painting");
  });

  it("open produces open command", () => {
    const open = SAFE_VERBS.find((v) => v.verb === "open")!;
    expect(open.template("door")).toBe("open door");
  });

  it("close produces close command", () => {
    const close = SAFE_VERBS.find((v) => v.verb === "close")!;
    expect(close.template("door")).toBe("close door");
  });

  it("pull produces pull command", () => {
    const pull = SAFE_VERBS.find((v) => v.verb === "pull")!;
    expect(pull.template("lever")).toBe("pull lever");
  });

  it("pick up produces take command", () => {
    const pick = SAFE_VERBS.find((v) => v.verb === "pick up")!;
    expect(pick.template("coin")).toBe("take coin");
  });

  it("talk to produces talk command", () => {
    const talk = SAFE_VERBS.find((v) => v.verb === "talk to")!;
    expect(talk.template("bartender")).toBe("talk to bartender");
  });
});

describe("SAFE_VERBS transports", () => {
  it("walk to uses local transport", () => {
    const walk = SAFE_VERBS.find((v) => v.verb === "walk to")!;
    expect(walk.transport).toBe("local");
  });

  it("look at uses tap transport", () => {
    const look = SAFE_VERBS.find((v) => v.verb === "look at")!;
    expect(look.transport).toBe("tap");
  });

  it("pull uses terrain transport", () => {
    const pull = SAFE_VERBS.find((v) => v.verb === "pull")!;
    expect(pull.transport).toBe("terrain");
  });

  it("pick up uses local transport", () => {
    const pick = SAFE_VERBS.find((v) => v.verb === "pick up")!;
    expect(pick.transport).toBe("local");
  });
});

describe("MUTATING_VERBS", () => {
  it("is currently empty (TODO)", () => {
    expect(MUTATING_VERBS).toHaveLength(0);
  });
});

describe("VERBS", () => {
  it("combines safe and mutating verbs", () => {
    expect(VERBS).toHaveLength(SAFE_VERBS.length + MUTATING_VERBS.length);
  });
});

describe("resolve()", () => {
  it("resolves walk to with correct command and transport", () => {
    const result = resolve("walk to", "north");
    expect(result).not.toBeNull();
    expect(result!.command).toBe("go north");
    expect(result!.transport).toBe("local");
    expect(result!.confirm).toBe(false);
  });

  it("resolves look at with tap transport", () => {
    const result = resolve("look at", "painting");
    expect(result!.command).toBe("examine painting");
    expect(result!.transport).toBe("tap");
  });

  it("resolves pick up with local transport", () => {
    const result = resolve("pick up", "coin");
    expect(result!.command).toBe("take coin");
    expect(result!.transport).toBe("local");
  });

  it("resolves talk to with tap transport", () => {
    const result = resolve("talk to", "riker");
    expect(result!.command).toBe("talk to riker");
    expect(result!.transport).toBe("tap");
  });

  it("returns null for unknown verb", () => {
    expect(resolve("destroy", "everything")).toBeNull();
  });

  it("returns null for empty verb", () => {
    expect(resolve("", "target")).toBeNull();
  });

  it("returns null for mutating verbs not yet defined", () => {
    // USE, PUSH, GIVE are not in the VERBS list yet
    expect(resolve("use", "item")).toBeNull();
    expect(resolve("give", "item")).toBeNull();
  });
});
