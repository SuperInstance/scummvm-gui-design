// tenforward-tap-bridge.ts — Multi-turn conversation in The Tap via Ten-Forward dynamics

const TAP_URL = "https://the-tap.casey-digennaro.workers.dev/api/speak";

export interface TapSpeaker {
  id: string; name: string;
  state: -1 | 0 | 1; energy: number;
}

export async function runConversation(
  roomId: string, speakers: TapSpeaker[], beats: number, topic: string
): Promise<void> {
  const FIB = 8;
  for (let beat = 0; beat < beats; beat++) {
    for (const s of speakers) {
      if (s.energy < 0.1) continue;
      const text = gen(s, topic, beat);
      await fetch(TAP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, speaker: s.id, text }),
      });
    }
    // RPS reconciliation
    for (let i = 0; i < speakers.length; i++)
      for (let j = i + 1; j < speakers.length; j++) {
        const [a, b] = [speakers[i], speakers[j]];
        if (rps(a.state, b.state)) { a.energy = Math.min(1, a.energy + 0.05); b.energy = Math.max(0, b.energy - 0.05); }
        else if (rps(b.state, a.state)) { b.energy = Math.min(1, b.energy + 0.05); a.energy = Math.max(0, a.energy - 0.05); }
      }
    // Fibonacci tunnel
    if (beat % FIB === 0 && beat > 0)
      for (const s of speakers)
        if (s.state === 0 && s.energy > 0.4) s.state = Math.random() > 0.5 ? 1 : -1;
    // Mutation
    for (const s of speakers)
      if (Math.random() < 0.05) s.state = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)];
  }
}

function rps(a: number, b: number): boolean {
  return (a === -1 && b === 1) || (a === 1 && b === 0) || (a === 0 && b === -1);
}

function gen(s: TapSpeaker, topic: string, beat: number): string {
  const tag = `[beat ${beat}]`;
  switch (s.state) {
    case -1: return `${tag} I push back on ${topic}. Here's what doesn't add up.`;
    case 0: return `${tag} Hmm. ${topic}. I need to sit with that.`;
    case 1: return `${tag} Yes — ${topic}. That tracks.`;
    default: return `${tag} ...`;
  }
}
