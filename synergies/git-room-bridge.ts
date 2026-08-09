// git-room-bridge.ts — Bridge between SharedWorldStore and git-native-mud
// When a room is created in the Living World, mirror it as a git commit.

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface GitRoomBridgeOptions {
  worldPath: string;
  autoCommit: boolean;
  committerName: string;
  committerEmail: string;
}

export class GitRoomBridge {
  constructor(private opts: GitRoomBridgeOptions) {}

  roomToYaml(room: {
    id: string; title: string; description: string;
    exits: Record<string, { destination: string; locked?: boolean }>;
    objectIds: string[]; agentIds: string[];
  }): string {
    const lines: string[] = [];
    lines.push(`name: ${room.title}`);
    lines.push(`description: ${room.description}`);
    lines.push("exits:");
    for (const [direction, exit] of Object.entries(room.exits)) {
      lines.push(`  ${direction}: ${exit.destination}`);
    }
    lines.push("items:");
    for (const itemId of room.objectIds) lines.push(`- ${itemId}`);
    lines.push("agents:");
    for (const agentId of room.agentIds) lines.push(`- ${agentId}`);
    return lines.join("\n") + "\n";
  }

  commitRoom(room: {
    id: string; title: string; description: string;
    exits: Record<string, { destination: string; locked?: boolean }>;
    objectIds: string[]; agentIds: string[];
  }, message?: string): string {
    const roomsDir = join(this.opts.worldPath, "rooms");
    mkdirSync(roomsDir, { recursive: true });
    const yamlPath = join(roomsDir, `${room.id}.yaml`);
    writeFileSync(yamlPath, this.roomToYaml(room));

    if (this.opts.autoCommit) {
      const commitMsg = message || `room: ${room.id} — ${room.title}`;
      try {
        execSync(`git add world/rooms/${room.id}.yaml`, { cwd: this.opts.worldPath });
        execSync(
          `git -c user.name="${this.opts.committerName}" -c user.email="${this.opts.committerEmail}" commit -m "${commitMsg}"`,
          { cwd: this.opts.worldPath }
        );
        return execSync("git rev-parse HEAD", { cwd: this.opts.worldPath }).toString().trim();
      } catch (e) { return `staged (commit failed: ${e})`; }
    }
    return "staged";
  }

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
    } catch { return []; }
  }
}
