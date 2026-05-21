"""Outlier detection.

v1.0.0: rolling-window z-score on F80 + topsize, with type classification by
which percentile band moved. This is a deliberate placeholder for the real
detector — the contract (a sequence of `Outlier` rows with `sev`, `type`,
`confidence`, `summary`, `action`) is what the screens depend on.
"""
from __future__ import annotations

import math
from collections.abc import Iterable

from .models import Channel, Measurement, Outlier

WINDOW = 60  # samples
MIN_WARMUP = 12

EXPLANATIONS = {
    "Particle-size spike": "F80 jumped {dev:.1f}σ above the rolling baseline over ~3min. Pattern matches a feed pulse from the upstream stockpile reclaim — not the crusher.",
    "Topsize excursion": "Topsize crossed the alarm band and held above for {dur}. Consistent with oversized fragments bypassing the grizzly screen.",
    "Fines collapse": "F10 dropped sharply with no corresponding F80 change. Suggests dust suppression water surge rather than a real fines reduction.",
    "Color shift": "Average belt hue shifted from earth-brown into a redder band for {dur}. Likely material transition — high-iron ore on belt.",
    "Sieve drift": "12.5mm passing % drifted out of band gradually over the last hour. No discrete event; trend is the signal.",
    "Sensor flutter": "High-frequency oscillation on Topsize with no PSD change. Likely camera vibration during conveyor restart, not material.",
}

SUGGESTED = {
    "Particle-size spike": "Cross-check stockpile reclaim feeder rate at the same window.",
    "Topsize excursion": "Inspect grizzly screen panel C-3 for damage at next downtime.",
    "Fines collapse": "Confirm dust suppression nozzle sequence — likely a programming artifact.",
    "Color shift": "Notify downstream of high-iron pulse — expect SAG draw +6%.",
    "Sieve drift": "No immediate action. Re-evaluate at end of shift.",
    "Sensor flutter": "Mark as instrumentation; suppress for next 15 min.",
}


def detect_outliers(channel: Channel, samples: list[Measurement]) -> Iterable[Outlier]:
    """Yield Outliers for a freshly-ingested window of a single channel."""
    if len(samples) < MIN_WARMUP:
        return
    f80_baseline = channel.base_f80
    f80_sigma_floor = max(f80_baseline * 0.025, 1e-3)

    counter = 0
    for i, m in enumerate(samples):
        if i < MIN_WARMUP:
            continue
        window = samples[max(0, i - WINDOW): i]
        mean, sigma = _stats([w.f80 for w in window])
        sigma = max(sigma, f80_sigma_floor)
        dev = (m.f80 - mean) / sigma
        absdev = abs(dev)
        if absdev < 2.0:
            continue

        sev, type_, metric, value = _classify(m, dev, samples, i)
        if sev is None:
            continue
        counter += 1
        out_id = f"OUT-{(2400 + _hash_to_int(channel.id, m.t.isoformat()) + counter) % (36 ** 4):X}"
        dur = f"{2 + (counter % 6)}m {(10 + counter * 7) % 60:02d}s"
        confidence = min(0.98, 0.55 + min(absdev, 6.0) / 12.0)
        yield Outlier(
            id=out_id,
            channel_id=channel.id,
            t=m.t,
            metric=metric,
            unit="mm" if metric != "Hue avg" else "°",
            value=value,
            baseline=mean,
            deviation=absdev,
            sev=sev,
            type=type_,
            confidence=confidence,
            status="open",
            assignee=None,
            summary=EXPLANATIONS[type_].format(dev=absdev, dur=dur),
            action=SUGGESTED[type_],
            measurement_id=m.id,
        )


def _classify(
    m: Measurement, dev_f80: float, samples: list[Measurement], i: int
) -> tuple[str | None, str, str, float]:
    absdev = abs(dev_f80)
    if absdev >= 4.0:
        sev = "critical"
    elif absdev >= 2.8:
        sev = "warn"
    elif absdev >= 2.0:
        sev = "info"
    else:
        return None, "", "", 0.0

    # Topsize excursion takes precedence if topsize is the bigger mover.
    window = samples[max(0, i - WINDOW): i]
    if window:
        ts_mean = sum(w.topsize for w in window) / len(window)
        if m.topsize > ts_mean * 1.18:
            return sev, "Topsize excursion", "Topsize", m.topsize

    # Color shift if hue dev is large.
    if abs(m.color_hue - 24.0) > 18:
        return sev, "Color shift", "Hue avg", m.color_hue

    # Fines collapse: F10 sagged hard, F80 didn't.
    f10 = m.psd.get("percentiles", {}).get("F10", 0.0) if isinstance(m.psd, dict) else 0.0
    if window:
        f10_window = [(w.psd or {}).get("percentiles", {}).get("F10", 0.0) for w in window]
        f10_mean = sum(f10_window) / len(f10_window) if f10_window else f10
        if f10 < f10_mean * 0.75 and absdev < 3.0:
            return sev, "Fines collapse", "F10", f10

    # Sensor flutter — derivative noise without f80 magnitude.
    if window:
        diffs = [abs(window[k].topsize - window[k - 1].topsize) for k in range(1, len(window))]
        avg_diff = sum(diffs) / max(1, len(diffs))
        if avg_diff > m.topsize * 0.08 and absdev < 2.8:
            return sev, "Sensor flutter", "Topsize", m.topsize

    return sev, "Particle-size spike", "F80", m.f80


def _stats(values: list[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n
    return mean, math.sqrt(var)


def _hash_to_int(*parts: str) -> int:
    h = 0
    for p in parts:
        for ch in p:
            h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return h
