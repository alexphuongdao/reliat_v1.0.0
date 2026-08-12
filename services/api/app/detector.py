"""Outlier detection.

v1.0.0: rolling-window z-score on F80 + topsize, with type classification by
which percentile band moved. This is a deliberate placeholder for the real
detector — the contract (a sequence of `Outlier` rows with `sev`, `type`,
`confidence`, `summary`, `action`) is what the screens depend on.
"""
from __future__ import annotations

import math
import uuid
from collections.abc import Iterable

from .models import Channel, Measurement, Outlier

WINDOW = 60  # samples
MIN_WARMUP = 12

# There is deliberately no table of explanations or suggested actions here.
#
# There used to be. Six format strings that asserted a physical root cause the
# detector had not inferred and could not infer — "consistent with oversized
# fragments bypassing the grizzly screen", "likely material transition — high-
# iron ore on belt" — plus six suggested actions, one of which named a piece of
# equipment that does not exist ("grizzly screen panel C-3"). They rendered in
# the UI under a heading that said "AI explanation", for all 1,513 CEMEX
# outliers, without a model ever having run.
#
# A z-score knows one thing: this value is N sigma from its rolling baseline.
# It does not know why. Root cause is the Diagnostic Agent's job, it is
# per-tenant, it is cited, and it costs about a cent. Until it runs, the honest
# output is the measurement itself.
#
# `summary` below is therefore a statement of what was measured. `action` is
# empty until an agent fills it.


def _summarize(
    metric: str, unit: str, value: float, baseline: float, dev: float, window_n: int
) -> str:
    """A factual description of the deviation. No causal claim."""
    direction = "above" if dev >= 0 else "below"
    if baseline:
        pct = (value - baseline) / abs(baseline) * 100.0
        delta = f" ({pct:+.0f}%)"
    else:
        delta = ""
    return (
        f"{metric} {value:.2f}{unit} against a rolling baseline of "
        f"{baseline:.2f}{unit} over the previous {window_n} samples — "
        f"{abs(dev):.1f}σ {direction}{delta}."
    )


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
        out_id = f"OUT-{uuid.uuid4().hex[:12].upper()}"
        # `confidence` is a rescaling of the deviation, not a probability. It is
        # monotonic in the evidence, which is all the triage sort needs. The UI
        # must not present it as a statistical confidence.
        confidence = min(0.98, 0.55 + min(absdev, 6.0) / 12.0)
        unit = "mm" if metric != "Hue avg" else "°"
        yield Outlier(
            id=out_id,
            channel_id=channel.id,
            t=m.t,
            metric=metric,
            unit=unit,
            value=value,
            baseline=mean,
            deviation=absdev,
            sev=sev,
            type=type_,
            confidence=confidence,
            status="open",
            assignee=None,
            summary=_summarize(metric, unit, value, mean, dev, len(window)),
            # Empty until the Diagnostic Agent runs. The detector has no basis
            # for recommending an action.
            action="",
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
