#!/usr/bin/env python3
"""
amplifier-npc-bridge.py — Continuous thought stream for Living World NPCs.

Provides the middle cognitive layer between the verb engine's reflex (Layer 1)
and the cortex/full model (Layer 3). Runs Granite 3.1 2B via Ollama in a
continuous loop with supervisor-based quality adjustment.
"""

import json
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class Thought:
    text: str
    timestamp: float
    quality: float = 0.0
    mood_valence: float = 0.0
    escalated: bool = False


class NPCAmplifier:
    """Continuous thought stream for an NPC in the Living World."""

    def __init__(self, agent_id: str = "npc", room_id: str = "default",
                 system_prompt: str = "You are an NPC in a living world. Think about your surroundings.",
                 interval: float = 5.0, temperature: float = 0.9,
                 escalate_threshold: float = 0.75):
        self.agent_id = agent_id
        self.room_id = room_id
        self.system_prompt = system_prompt
        self.interval = interval
        self.temperature = temperature
        self.escalate_threshold = escalate_threshold
        self.thoughts: list[Thought] = []
        self.running = False
        self._thread = None
        self._mood = "idle"

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._think_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _think_loop(self):
        while self.running:
            thought = self._generate_thought()
            if thought:
                self.thoughts.append(thought)
                if len(self.thoughts) > 10:
                    self.thoughts = self.thoughts[-10:]
                self._update_mood(thought)
                if thought.quality >= self.escalate_threshold:
                    thought.escalated = True
            time.sleep(self.interval)

    def _generate_thought(self) -> Thought | None:
        recent = self.thoughts[-3:] if self.thoughts else []
        recent_text = " | ".join(t.text[:50] for t in recent)
        prompt = f"{self.system_prompt}\n\nRoom: {self.room_id}. Recent: {recent_text}\n\nOne thought:"
        try:
            result = subprocess.run(
                ["curl", "-s", "-X", "POST", "http://localhost:11434/api/generate",
                 "-H", "Content-Type: application/json",
                 "-d", json.dumps({"model": "granite3.1-dense:2b", "prompt": prompt,
                                   "stream": False,
                                   "options": {"temperature": self.temperature}})],
                capture_output=True, timeout=30, text=True)
            if result.returncode == 0:
                text = json.loads(result.stdout).get("response", "").strip()
                return Thought(text=text, timestamp=time.time(),
                               quality=self._score(text), mood_valence=self._valence(text))
        except Exception:
            pass
        return None

    def _score(self, text: str) -> float:
        if not text or len(text) < 10: return 0.1
        score = min(1.0, len(text) / 200)
        score += min(0.3, sum(1 for w in text.split() if len(w) > 8 or w[0].isupper()) * 0.05)
        return min(1.0, score)

    def _valence(self, text: str) -> float:
        dark = sum(1 for w in ["dark", "fear", "wrong", "broken", "afraid", "lost"] if w in text.lower())
        bright = sum(1 for w in ["bright", "warm", "good", "right", "beautiful", "yes"] if w in text.lower())
        return max(-1.0, min(1.0, (bright - dark) * 0.2))

    def _update_mood(self, thought: Thought):
        recent = self.thoughts[-10:]
        avg = sum(t.mood_valence for t in recent) / max(1, len(recent))
        self._mood = "content" if avg > 0.3 else "contemplative" if avg > 0 else "pensive" if avg > -0.3 else "brooding"

    def get_state(self) -> dict[str, Any]:
        last = self.thoughts[-1] if self.thoughts else None
        avg_q = sum(t.quality for t in self.thoughts) / len(self.thoughts) if self.thoughts else 0.0
        return {"agent_id": self.agent_id, "mood": self._mood,
                "last_thought": last.text if last else "", "quality": avg_q,
                "thought_count": len(self.thoughts)}

    def should_escalate(self) -> bool:
        return bool(self.thoughts) and self.thoughts[-1].quality >= self.escalate_threshold

    def seed_utterance(self) -> str:
        return self.thoughts[-1].text if self.thoughts else "..."
