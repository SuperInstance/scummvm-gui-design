#!/usr/bin/env python3
"""
slackwater-camera-adapter.py

Bridge between camera room state and slackwater-perception's
multi-track convergence detection.

Encodes room sensor deltas as perception events, then runs
convergence detection to find 'significant moment' clusters.
"""

from slackwater_perception import (
    MultiTrackEncoder, PerceptionEvent, TrackType,
    InflectionDirection, ConvergenceDetector,
)
from typing import Any


def encode_room_delta(encoder: MultiTrackEncoder, room_id: str, delta: dict, tick: int) -> None:
    """Encode a camera room's state delta as perception tracks."""
    if "temperature" in delta:
        intensity = max(0.0, min(1.0, abs(delta["temperature"] - 20.0) / 30.0))
        encoder.events.append(PerceptionEvent(
            tick=tick, track_type=TrackType.VELOCITY,
            velocity=int(intensity * 127), intensity=intensity,
            label=f"temp={delta['temperature']}",
        ))
    if "motion_detected" in delta and delta["motion_detected"]:
        encoder.encode_game_state({"interaction": "point", "motion": True}, tick=tick)
    if "door_open" in delta:
        direction = InflectionDirection.RISING if delta["door_open"] else InflectionDirection.FALLING
        encoder.events.append(PerceptionEvent(
            tick=tick, track_type=TrackType.INFLECTION,
            inflection=direction, label=f"door_{'open' if delta['door_open'] else 'closed'}",
        ))
    if "light_level" in delta:
        level = max(0.0, min(1.0, delta["light_level"]))
        encoder.events.append(PerceptionEvent(
            tick=tick, track_type=TrackType.ATTENTION,
            attention_weight=level, label=f"light={level:.2f}",
        ))


def detect_significant_moments(encoder: MultiTrackEncoder, window_ticks: int = 480) -> list:
    """Run convergence detection and return significant moments."""
    events = encoder.detect_convergence(window_ticks=window_ticks)
    return [
        {"tick": e.tick, "strength": e.strength.name, "label": e.label, "phi": e.phi}
        for e in events if e.is_significant
    ]
