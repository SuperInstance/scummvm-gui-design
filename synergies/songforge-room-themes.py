#!/usr/bin/env python3
"""
songforge-room-themes.py — Generate a theme song for each room using SongForge + MMX.

Each room gets a unique musical identity derived from its description and theme.
"""

import json
import subprocess
from pathlib import Path
from typing import Any

ROOM_MUSIC_MAP = {
    "harbor": "acoustic folk, warm fingerpicked guitar, intimate tavern ambience",
    "forge": "industrial ambient, deep metallic resonance, rhythmic hammer strikes",
    "engine_room": "dark ambient, low diesel rumble, metallic drones, mechanical pulse",
    "wheelhouse": "nautical ambient, soft synth pads, distant foghorn, calm sea atmosphere",
    "dojo": "meditative ambient, singing bowls, bamboo flute, minimalist silence",
    "bar_rail": "jazz, slow piano, brushed drums, amber-lit mood, late night",
    "galley": "warm folk, accordion, gentle hum of a kitchen, domestic warmth",
    "default": "ambient, warm pads, gentle atmosphere",
}


def generate_room_theme(room_id: str, room_title: str, room_description: str, theme_key: str,
                         output_dir: str = "assets/audio/themes") -> dict[str, Any]:
    """Generate a theme song for a room."""
    style = ROOM_MUSIC_MAP.get(theme_key, ROOM_MUSIC_MAP["default"])
    prompt = (
        f"A theme song for '{room_title}'. Mood: {room_description[:100]}. "
        f"Style: {style}. Duration: 30 seconds. Instrumental."
    )
    output_path = Path(output_dir) / f"{room_id}_theme.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run([
            "mmx", "music", "--prompt", prompt,
            "--duration", "30", "--output", str(output_path),
        ], check=True, timeout=120, capture_output=True)
        return {"room_id": room_id, "theme_url": str(output_path), "style": style, "status": "generated"}
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        return {"room_id": room_id, "theme_url": "", "style": style,
                "prompt": prompt, "status": f"mmx unavailable — prompt ready: {e}"}


if __name__ == "__main__":
    import sys
    rooms_file = sys.argv[1] if len(sys.argv) > 1 else "rooms.json"
    with open(rooms_file) as f:
        world = json.load(f)
    for room_id, room in world.get("rooms", {}).items():
        result = generate_room_theme(
            room_id, room.get("title", room_id),
            room.get("description", ""), room.get("theme", "default"),
        )
        print(f"  {room_id}: {result['status']}")
