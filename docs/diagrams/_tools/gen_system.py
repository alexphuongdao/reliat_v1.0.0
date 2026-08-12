import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from excal import *  # noqa

c = Canvas()
L, R = 140, 1840
W = R - L

# ── header ──────────────────────────────────────────────────────────
c.text(L, 40, "Reliat — System Architecture", 34, T_TITLE)
c.text(L, 92, "One request, top to bottom. The tenant boundary is the red rail: it is established once and enforced at every layer below it.",
       15, T_BODY)
c.text(L, 118, "State as of 2026-08-03. Solid = built and running.  Dashed = planned, not built.", 14, "#b45309")

# legend
c.rect(1560, 36, 40, 26, "", SUCCESS, roughness=0, sw=2)
c.text(1612, 42, "built", 13, T_BODY)
c.rect(1700, 36, 40, 26, "", INACTIVE, dashed=True, roughness=0, sw=2)
c.text(1752, 42, "planned", 13, T_BODY)

# ══ 1 · CLIENTS ═════════════════════════════════════════════════════
c.group(L, 190, W, 150, "1 · WHO SIGNS IN")
cards = [
    (170, "cemex\nCEMEX · tn_cemex\n1 channel · 21,138 REAL rows", TRIGGER),
    (730, "test\nDemo Plant · tn_demo\n11 channels · 15,840 synthetic", TRIGGER),
    (1290, "admin\nsuperadmin · tenant_id = NULL\nsees every tenant", DECISION),
]
acct = []
for x, label, pal in cards:
    acct.append(c.rect(x, 225, 520, 95, label, pal, size=14, roughness=0))

# ══ 2 · WEB ═════════════════════════════════════════════════════════
c.group(L, 420, W, 190, "2 · WEB — Next.js 16")
web = []
web_boxes = [
    (170, "proxy.ts\nNext 16's rename of\nmiddleware.ts\noptimistic redirect"),
    (590, "(auth)/login\nServer Action\npassword never\nreaches client JS"),
    (1010, "(app)/* + AppShell\nrequireUser() on\nevery server render\nauthoritative check"),
    (1430, "lib/api.ts\ncredentials: include\n401 → /login\nno mock fallback"),
]
for x, label in web_boxes:
    web.append(c.rect(x, 460, 380, 125, label, SECONDARY, size=13, roughness=0))

for a in acct:
    pass
c.arrow([(430, 320), (430, 458)], "#c2410c", end=web[0], label="session cookie", label_size=12)
c.arrow([(990, 320), (760, 458)], "#c2410c", end=web[1])
c.arrow([(1550, 320), (1200, 458)], "#b45309", end=web[2])

# ══ 3 · API ═════════════════════════════════════════════════════════
c.group(L, 700, W, 290, "3 · API — FastAPI  (owns identity and every query)")
api = []
api_boxes = [
    (170, 440, "get_principal()\ncookie → sessions row →\nPrincipal(user, tenant)"),
    (650, 440, "tenant-scoped routes\nowned_channel() /\n_owned_outlier()"),
    (1130, 440, "harness_for_tenant()\nselects the agent profile\nfor this tenant"),
]
for x, w, label in api_boxes:
    api.append(c.rect(x, 745, w, 105, label, PRIMARY, size=13,
                      text_color="#ffffff", roughness=0))
c.arrow([(360, 585), (360, 743)], SLATE, end=api[0])

# the boundary callout
c.rect(170, 878, 1440, 78,
       "▲  THE TENANT BOUNDARY  —  every data query is filtered by principal.tenant_id\n"
       "cross-tenant id ⇒ 404, never 403  (403 would confirm the row exists)",
       WARNING, size=14, roughness=0, sw=3)
c.arrow([(390, 852), (390, 876)], "#dc2626")
c.arrow([(870, 852), (870, 876)], "#dc2626")
c.arrow([(1350, 852), (1350, 876)], "#dc2626")

# ══ 4 · AGENT ═══════════════════════════════════════════════════════
c.group(L, 1080, W, 350, "4 · AGENT HARNESS — one model, per-tenant context")
h = c.rect(170, 1125, 360, 150,
           "TenantHarness\n\nevidence fields\nmetric glossary\nfailure categories\noperating rules\nwindow · model",
           AI, size=13, roughness=0)
p1 = c.rect(590, 1120, 560, 90,
            "cemex profile  ·  window 20/5\n9 evidence fields  incl. SDRatio10_5, VideoRGB\n6 categories  incl. upstream_blast",
            AI, size=12, roughness=0)
p2 = c.rect(590, 1240, 560, 90,
            "demo profile  ·  window 12/4\n5 evidence fields  (no vendor columns exist)\n4 categories",
            AI, size=12, roughness=0)
c.arrow([(532, 1170), (588, 1165)], "#6d28d9", end=p1)
c.arrow([(532, 1230), (588, 1285)], "#6d28d9", end=p2)

ag = c.rect(1210, 1150, 250, 140,
            "Diagnostic\nAgent\n\nsystem prompt +\ntool schema\nGENERATED from\nthe profile", AI, size=12, roughness=0)
c.arrow([(1152, 1165), (1208, 1200)], "#6d28d9", end=ag)
c.arrow([(1152, 1285), (1208, 1240)], "#6d28d9", end=ag)

anth = c.rect(1520, 1150, 290, 140,
              "Anthropic API\nclaude-haiku-4-5\n\nstateless —\ncontext is the\nonly difference", SUCCESS, size=12, roughness=0)
c.arrow([(1462, 1220), (1518, 1220)], "#047857", end=anth)
c.text(1478, 1098, "prompt cache on stable prefix", 11, "#047857")

c.text(170, 1348, "Same model. Same code path. Different context ⇒ correctly different answers.", 14, "#6d28d9")
c.text(170, 1374, "Verified: cemex cites SDRatio10_5 + RGB;  demo cites neither, because its harness never offers them.", 13, T_BODY)

# ══ 5 · DATA ════════════════════════════════════════════════════════
c.group(L, 1520, W, 360, "5 · DATA — Postgres 16 (pgvector image)")

today = c.rect(170, 1565, 740, 280, "", SUCCESS, roughness=0, sw=3, bg="transparent")
c.text(190, 1580, "TODAY — one database, tenant_id column", 15, "#047857")
rows = [
    ("tenants · users · sessions · oauth_accounts", 1614),
    ("channels  (tenant_id FK)  ← the boundary", 1650),
    ("measurements  21,138 real + 15,840 synthetic", 1686),
    ("outliers · outlier_diagnoses", 1722),
    ("source_assets  (provenance, empty)", 1758),
]
for label, y in rows:
    c.rect(195, y, 690, 30, label, TERTIARY, size=12, roughness=0, sw=1)
c.text(195, 1800, "Isolation enforced in Python, per route.", 12, T_BODY)

tgt = c.rect(960, 1565, 850, 280, "", INACTIVE, dashed=True, roughness=0, sw=3, bg="transparent")
c.text(980, 1580, "TARGET — control plane + one DB per tenant", 15, "#1e40af")
c.rect(985, 1614, 800, 46, "reliat_control   —  tenants · users · sessions · audit · usage",
       INACTIVE, size=12, roughness=0, sw=1, dashed=True)
c.rect(985, 1672, 385, 46, "reliat_tn_cemex", INACTIVE, size=12, roughness=0, sw=1, dashed=True)
c.rect(1400, 1672, 385, 46, "reliat_tn_demo", INACTIVE, size=12, roughness=0, sw=1, dashed=True)
c.rect(985, 1730, 800, 46, "knowledge plane  —  failure_modes · remediation_actions · impact_priors",
       INACTIVE, size=12, roughness=0, sw=1, dashed=True)
c.text(985, 1792, "Isolation enforced by the database. DROP DATABASE = deletion.", 12, "#1e40af")
c.text(985, 1814, "Needs PgBouncer + a migration runner. Slice 1.", 12, T_BODY)

c.arrow([(915, 1705), (955, 1705)], "#1e40af", dashed=True, label="slice 1", label_size=12, label_off=(0, -26))

c.arrow([(700, 990), (700, 1078)], SLATE)
c.arrow([(700, 1432), (700, 1518)], SLATE, label="tenant-scoped reads only", label_size=12)

c.save("/Users/daoduyphuong/workfolder/reliat_v1.0.0/docs/diagrams/reliat-system-architecture.excalidraw")
