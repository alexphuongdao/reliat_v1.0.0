"""Analytics layer over PsdRow.

Pure functions that turn raw rows into the shapes the dashboard needs:
rolling windows, SPC control bands, PSD sieve curves, channel KPIs,
and outlier-grade excursions. Pandas does the heavy lifting; everything
is computed on demand (no pre-aggregation tables yet — revisit when
queries get slow).
"""
from .engine import (
    channel_summary,
    excursions,
    psd_curve,
    series_with_bands,
    spc_series,
)

__all__ = [
    "channel_summary",
    "excursions",
    "psd_curve",
    "series_with_bands",
    "spc_series",
]
