import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from excal import *  # noqa

c = Canvas()
L, R = 140, 2140
W = R - L

# ── header ──────────────────────────────────────────────────────────
c.text(L, 40, "Reliat — Data Architecture", 34, T_TITLE)
c.text(L, 92, "How a file of unknown shape becomes a grounded, cited answer — and where the tenant boundary sits at every step.", 15, T_BODY)
c.text(L, 118, "Solid = built.  Dashed = designed, not built.  Red = the isolation boundary.", 14, "#b45309")

c.rect(1840, 36, 40, 26, "", SUCCESS, roughness=0)
c.text(1892, 42, "built", 13, T_BODY)
c.rect(1980, 36, 40, 26, "", INACTIVE, dashed=True, roughness=0)
c.text(2032, 42, "planned", 13, T_BODY)

# ══ 1 · INGESTION ═══════════════════════════════════════════════════
c.group(L, 190, W, 300, "1 · INGESTION — format, meaning, and trust are three separate jobs")

c.rect(170, 245, 250, 95, "RAW FILE\ncsv · tsv · parquet\nxls/xlsx · jsonl\nshape unknown", TRIGGER, size=12, roughness=0)
rd = c.rect(465, 245, 250, 95, "READER\nbytes → records\n\nformat only —\nno domain knowledge", SUCCESS, size=12, roughness=0)
mp = c.rect(760, 245, 290, 95, "MAPPING PROFILE\ndeclarative YAML, versioned\n\ncolumn → canonical field\nunit · timezone · nulls", INACTIVE, size=11, dashed=True, roughness=0)
cn = c.rect(1095, 245, 290, 95, "CANONICALIZER\ninvariants + quality flags\n\nF10≤F20≤…≤F90\nunits · tz-aware UTC", INACTIVE, size=11, dashed=True, roughness=0)
wr = c.rect(1430, 245, 250, 95, "WRITER\nidempotent\n\nsha256 short-circuit\nON CONFLICT DO NOTHING", INACTIVE, size=11, dashed=True, roughness=0)

for a, b, xa, xb in [(None, rd, 422, 463), (rd, mp, 717, 758), (mp, cn, 1052, 1093), (cn, wr, 1387, 1428)]:
    c.arrow([(xa, 292), (xb, 292)], SLATE, end=b)

sa = c.rect(1730, 245, 340, 95,
            "source_assets   ← THE SPINE\ntenant · sha256 · storage_uri\nprofile + version · status · counts",
            DECISION, size=11, roughness=0, sw=3)
c.arrow([(1682, 292), (1728, 292)], "#b45309", end=sa)

c.text(170, 368, "Why this split:", 14, T_TITLE)
c.text(170, 392, "Format is the easy part — a reader swap. Meaning is the hard part. Today ingest_minitab.py knows CEMEX's column names, units, timezone and", 13, T_BODY)
c.text(170, 414, "baseline policy in 124 lines of Python; customer #2 means a second file exactly like it. A profile is data, so it can be diffed, reviewed by a", 13, T_BODY)
c.text(170, 436, "metallurgist, and REPLAYED when a mapping turns out wrong. A loader is code — it can only be rewritten.", 13, T_BODY)

c.code(1730, 368, "measurements.source_asset_id → provenance\nevery number traces to a file, an upload,\na person, and a mapping version", size=11)

# ══ 2 · THE THREE PLANES ════════════════════════════════════════════
c.group(L, 570, W, 560, "2 · WHERE DATA LIVES — three planes, one boundary")

# control plane
c.rect(170, 620, 560, 210, "", PRIMARY, roughness=0, sw=3, bg="transparent")
c.text(190, 634, "CONTROL PLANE   reliat_control", 15, "#1e3a5f")
c.text(190, 658, "shared · no measurement data ever", 12, T_BODY)
for i, (lab, y) in enumerate([("tenants  (db_dsn_ref → secret manager)", 686),
                              ("users · sessions · oauth_accounts", 720),
                              ("audit_events   (append-only)", 754),
                              ("usage_ledger   (tokens · cost)", 788)]):
    c.rect(195, y, 510, 28, lab, TERTIARY, size=11, roughness=0, sw=1)

# tenant planes
c.rect(780, 620, 620, 400, "", WARNING, roughness=0, sw=3, bg="transparent")
c.text(800, 634, "TENANT PLANE   one database per customer", 15, "#dc2626")
c.text(800, 658, "isolated · separately backed up · DROP DATABASE = deletion", 12, T_BODY)

c.rect(805, 686, 570, 150, "", SUCCESS, roughness=0, sw=2, bg="#f0fdf4")
c.text(820, 696, "reliat_tn_cemex", 13, "#047857")
for lab, y in [("channels → measurements → outliers → diagnoses", 720),
               ("21,138 REAL rows · source='cemex_minitab'", 748),
               ("event_signatures  (vector, for similarity)", 776),
               ("documents · doc_chunks  (vector, tenant SOPs)", 804)]:
    c.text(820, y, lab, 11, T_ON)

c.rect(805, 850, 570, 150, "", TERTIARY, roughness=0, sw=2, bg="#eff6ff")
c.text(820, 860, "reliat_tn_demo", 13, "#1e3a5f")
for lab, y in [("same schema, different data", 884),
               ("15,840 synthetic rows · source='synthetic'", 912),
               ("no vendor columns exist here", 940),
               ("→ which is why its harness differs", 968)]:
    c.text(820, y, lab, 11, T_ON)

# knowledge plane
c.rect(1450, 620, 620, 400, "", AI, roughness=0, sw=3, bg="transparent")
c.text(1470, 634, "KNOWLEDGE PLANE   shared, curated", 15, "#6d28d9")
c.text(1470, 658, "abstractions only — never a customer's rows", 12, T_BODY)
for lab, y in [("failure_modes      FM-014 screen blinding", 690),
               ("evidence_signatures   how it LOOKS in data", 726),
               ("discriminators     how to tell it from lookalikes", 762),
               ("remediation_actions   ← THE AGENT'S ACTION SPACE", 798),
               ("impact_priors      downtime p50/p90, sample_size", 834),
               ("knowledge_evidence  confirmed_count, site_count", 870),
               ("knowledge_embeddings  vector(1024)", 906)]:
    c.rect(1475, y, 570, 30, lab, INACTIVE, size=11, dashed=True, roughness=0, sw=1)
c.text(1475, 952, "Six categories: feed_material · equipment · process_control", 11, T_BODY)
c.text(1475, 974, "instrument · environmental · upstream_blast", 11, T_BODY)

# the promotion gate
gate = c.rect(1080, 1042, 380, 62,
              "PROMOTION GATE  —  human reviewed\npattern + count + discriminator only",
              DECISION, size=12, roughness=0, sw=3)
c.arrow([(1150, 1022), (1180, 1040)], "#b45309", end=gate)
c.arrow([(1430, 1040), (1600, 1022)], "#6d28d9", head="arrow")

c.text(170, 1048, "What crosses the gate:", 14, T_TITLE)
c.text(170, 1072, "\"FM-014: topsize +2σ sustained >8min with F80 flat.", 12, "#047857")
c.text(170, 1092, " Confirmed 23× across 6 sites. Discriminator: F10 unchanged.\"", 12, "#047857")
c.text(660, 1048, "What never does:", 14, "#dc2626")
c.text(660, 1072, "CEMEX's rows, values, timestamps,", 12, "#dc2626")
c.text(660, 1092, "channel names, or ids.", 12, "#dc2626")

# ══ 3 · RETRIEVAL ═══════════════════════════════════════════════════
c.group(L, 1190, W, 330, "3 · RETRIEVAL — three modes, chosen by question shape (this is what \"RAG\" means here)")

modes = [
    (170, SUCCESS, "MODE A · STRUCTURED", "~80% of real questions",
     ["\"outliers in the last 3 hours\"", "\"critical count by channel\"", "",
      "typed tools → reviewed SQL", "bound parameters, never text-to-SQL", "",
      "EXACT. Reproducible. Cited."]),
    (820, AI, "MODE B · SEMANTIC (vector)", "narrow text corpus only",
     ["\"have we seen this before?\"", "\"what does the SOP say?\"", "",
      "pgvector over diagnoses, notes, SOPs", "tenant_id filter is MANDATORY", "",
      "Returns CANDIDATES with citations."]),
    (1470, TERTIARY, "MODE C · SIGNAL SHAPE", "not an LLM embedding",
     ["\"outliers that look like this one\"", "", "engineered feature vector per event",
      "normalized PSD deltas, z-scores, duration", "",
      "Interpretable, deterministic, free.", "Replaces the faked \"Similar past\" panel."]),
]
for x, pal, title, sub, lines in modes:
    c.rect(x, 1240, 600, 230, "", pal, roughness=0, sw=2, bg="transparent")
    c.text(x + 20, 1254, title, 15, pal[1])
    c.text(x + 20, 1278, sub, 12, T_BODY)
    for i, ln in enumerate(lines):
        c.text(x + 20, 1306 + i * 22, ln, 12, T_ON if ln.startswith('"') else T_BODY)

c.text(170, 1494, "Do NOT embed the time series.  \"Outliers in the last 3 hours\" is a WHERE clause — nearest-neighbour returns semantically nearby rows, which has no", 13, "#dc2626")
c.text(170, 1518, "relationship to CORRECT rows. The wrong count arrives sounding exactly like a right one. Structured pre-filter first; vectors are the fallback.", 13, "#dc2626")

# ══ 4 · CONTEXT BUDGET ══════════════════════════════════════════════
c.group(L, 1610, W, 350, "4 · CONTEXT WINDOW — assembled by code, never chosen by the model")

hdr = ["SECTION", "BUDGET", "RETRIEVAL", "TRUNCATION"]
col = [180, 690, 900, 1500]
for h_, x in zip(hdr, col):
    c.text(x, 1660, h_, 12, T_TITLE)
c.line([(170, 1682), (2040, 1682)], SLATE, sw=1)

budget = [
    ("system contract + tool defs", "3k", "static", "never — CACHE BREAKPOINT HERE"),
    ("candidate failure modes", "3k", "STRUCTURED signature match, top 8", "drop lowest prior first"),
    ("event + measurement window", "2k", "~40 downsampled pts + stats in Python", "widen stride"),
    ("tenant precedent", "2k", "kNN on event_signatures, top 3", "fewer neighbours"),
    ("text evidence", "2k", "pgvector top-k, tenant-filtered", "fewer chunks"),
    ("tool results (loop)", "3k", "live", "row cap + explicit elision marker"),
]
for i, row in enumerate(budget):
    y = 1696 + i * 30
    for val, x in zip(row, col):
        c.text(x, y, val, 12, T_ON if x == col[0] else T_BODY)
c.line([(170, 1878), (2040, 1878)], SLATE, sw=1)
c.text(180, 1890, "TARGET ~15k input · hard ceiling 25k · max 8 tool calls · per-tenant daily cost ceiling", 13, T_TITLE)
c.text(180, 1916, "A 200k context window is a budget, not a target. Compute statistics in Python — never make the model do arithmetic.", 12, T_BODY)

# ══ footer: build order ═════════════════════════════════════════════
c.text(L, 2020, "BUILD ORDER", 18, T_TITLE)
steps = [
    ("1", "control / tenant plane split\n+ connection router", INACTIVE),
    ("2", "finish provenance\nON CONFLICT + sha256", INACTIVE),
    ("3", "timestamptz + Site.timezone\nmetric registry", INACTIVE),
    ("4", "reader / profile split\nport CEMEX to YAML", INACTIVE),
    ("5", "tests + CI\n(gates everything after)", INACTIVE),
    ("6", "knowledge plane\n~20 seeded failure modes", INACTIVE),
    ("7", "tool surface\n+ ContextBuilder", INACTIVE),
    ("8", "artifact + dispositions\n(the flywheel)", INACTIVE),
]
for i, (n, label, pal) in enumerate(steps):
    x = 170 + i * 245
    c.rect(x, 2060, 225, 90, f"{n}\n{label}", pal, size=11, dashed=True, roughness=0)
    if i < len(steps) - 1:
        c.arrow([(x + 227, 2105), (x + 243, 2105)], SLATE, sw=1)

c.save("/Users/daoduyphuong/workfolder/reliat_v1.0.0/docs/diagrams/reliat-data-architecture.excalidraw")
