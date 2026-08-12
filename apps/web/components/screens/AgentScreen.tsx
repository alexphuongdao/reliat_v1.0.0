"use client";

/**
 * Agent — the durable record of what the agent has done for this tenant.
 *
 * This replaces a screen that was entirely fabricated: `send()` was a 900ms
 * `setTimeout` returning a fixed reply, and the thread sidebar was five
 * hardcoded titles. The canned reply cited "CV42 Tunnel" alongside "CV33
 * Crusher Out" and "OUT-1L on CV09 ROM" — cv42 is CEMEX, cv33 and cv09 are the
 * demo tenant. It mixed two customers' channels into one answer, which to a
 * customer is indistinguishable from a data leak.
 *
 * Everything here now comes from `/api/agent/threads`, which is tenant-scoped
 * server-side from the session. Runs are created by "Run Diagnostic Agent" on
 * the Outliers screen; that screen is deliberately untouched.
 *
 * Two modes: 'full' (the /agent route, with the thread list) and 'drawer'
 * (overlaid via ⌘J, most recent thread only).
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Pill, Unavailable } from "../ui";
import { api } from "../../lib/api";
import { fmtAge } from "../../lib/format";
import type {
  AgentArtifact,
  AgentMessage,
  AgentThreadDetail,
  AgentThreadSummary,
  Channel,
  Outlier,
} from "../../lib/types";

// Permissive — any object with optional .name (Channel, Outlier) plus
// bare strings ("outliers", "shift", …) and null/undefined.
export type AgentScope = { name?: string } | string | null | undefined;

export interface AgentScreenProps {
  channels: Channel[];
  outliers: Outlier[];
  scope?: AgentScope;
  mode?: "full" | "drawer";
  onClose?: () => void;
  onOpenOutlier?: (o: Outlier) => void;
  onOpenChannel?: (c: Channel) => void;
}

export function AgentScreen({
  channels: CHANNELS,
  outliers: OUTLIERS,
  scope,
  mode = "full",
  onClose,
  onOpenOutlier,
  onOpenChannel,
}: AgentScreenProps) {
  const isDrawer = mode === "drawer";

  const [threads, setThreads] = useState<AgentThreadSummary[] | null>(null);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentThreadDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadThreads = useCallback(() => {
    setThreadsError(null);
    api
      .agentThreads()
      .then((rows) => {
        setThreads(rows);
        // Open the most recent by default so the screen is never blank when
        // there is something to show.
        setActiveId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((err) => setThreadsError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(loadThreads, [loadThreads]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailError(null);
    api
      .agentThread(activeId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const scopeLabel =
    scope && typeof scope === "object" && "name" in scope
      ? scope.name
      : typeof scope === "string"
        ? scope
        : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: !isDrawer ? "260px 1fr" : "1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {!isDrawer && (
        <ThreadList
          threads={threads}
          error={threadsError}
          activeId={activeId}
          onSelect={setActiveId}
          onRetry={loadThreads}
        />
      )}

      <section style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <Header
          title={detail?.title ?? "Agent"}
          scopeLabel={scopeLabel}
          detail={detail}
          isDrawer={isDrawer}
          onClose={onClose}
        />

        <div style={{ flex: 1, overflow: "auto", padding: isDrawer ? "14px 16px" : "18px 24px" }}>
          {detailError ? (
            <Unavailable label="Couldn't load this conversation." reason={detailError} />
          ) : threads === null ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Loading…</p>
          ) : threads.length === 0 ? (
            <EmptyState />
          ) : detail === null ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Loading conversation…</p>
          ) : (
            <div style={{ display: "grid", gap: 16, maxWidth: 860 }}>
              {detail.messages.map((m) => (
                <MessageBlock
                  key={m.id}
                  message={m}
                  outlierId={detail.outlierId}
                  channels={CHANNELS}
                  outliers={OUTLIERS}
                  onOpenOutlier={onOpenOutlier}
                  onOpenChannel={onOpenChannel}
                />
              ))}
            </div>
          )}
        </div>

        <Composer />
      </section>
    </div>
  );
}

/* ── thread list ──────────────────────────────────────────────────── */

function ThreadList({
  threads, error, activeId, onSelect, onRetry,
}: {
  threads: AgentThreadSummary[] | null;
  error: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <aside
      style={{
        borderRight: "1px solid var(--border)",
        background: "var(--surface-1)",
        overflow: "auto",
        padding: "14px 12px",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h3
          style={{
            fontSize: 11, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 600, margin: 0,
          }}
        >
          Threads
        </h3>
        {threads !== null && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            {threads.length}
          </span>
        )}
      </div>

      {error ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Unavailable compact label="Couldn't load threads." reason={error} />
          <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      ) : threads === null ? (
        <p className="muted" style={{ fontSize: 12 }}>Loading…</p>
      ) : threads.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          No conversations yet. Running the Diagnostic Agent on an outlier
          starts one.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                textAlign: "left",
                padding: "8px 9px",
                borderRadius: "var(--r-sm)",
                border: "1px solid transparent",
                background: t.id === activeId ? "var(--surface-2)" : "transparent",
                borderColor: t.id === activeId ? "var(--border)" : "transparent",
                cursor: "pointer",
                display: "grid",
                gap: 3,
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  color: t.id === activeId ? "var(--text-1)" : "var(--text-2)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {t.title || "Untitled"}
              </span>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                {fmtAge(t.updatedAt)} ago · {t.messageCount} msg
                {t.costUsd > 0 && ` · $${t.costUsd.toFixed(4)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

/* ── header ───────────────────────────────────────────────────────── */

function Header({
  title, scopeLabel, detail, isDrawer, onClose,
}: {
  title: string;
  scopeLabel: string | null | undefined;
  detail: AgentThreadDetail | null;
  isDrawer: boolean;
  onClose?: () => void;
}) {
  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: isDrawer ? "12px 16px" : "14px 24px",
        borderBottom: "1px solid var(--border)",
        minHeight: 52,
      }}
    >
      <Icon name="sparkle" size={14} />
      <span
        style={{
          fontSize: 13.5, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      {scopeLabel && <Pill size="sm" mono>{scopeLabel}</Pill>}
      <span style={{ flex: 1 }} />
      {detail && (
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
          ${detail.costUsd.toFixed(4)}
        </span>
      )}
      {isDrawer && onClose && (
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      )}
    </header>
  );
}

/* ── messages ─────────────────────────────────────────────────────── */

function MessageBlock({
  message, outlierId, channels, outliers, onOpenOutlier, onOpenChannel,
}: {
  message: AgentMessage;
  outlierId: string | null;
  channels: Channel[];
  outliers: Outlier[];
  onOpenOutlier?: (o: Outlier) => void;
  onOpenChannel?: (c: Channel) => void;
}) {
  if (message.role === "user") {
    return (
      <div
        style={{
          justifySelf: "end", maxWidth: "80%",
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--r-md)", padding: "10px 13px",
          fontSize: 12.5, color: "var(--text-1)", lineHeight: 1.5,
        }}
      >
        {message.content}
      </div>
    );
  }

  const outlier = outlierId ? outliers.find((o) => o.id === outlierId) : undefined;
  const channel = outlier ? channels.find((c) => c.id === outlier.channelId) : undefined;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, margin: 0 }}>
        {message.content}
      </p>

      {message.artifact && <ArtifactCard artifact={message.artifact} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {outlier && onOpenOutlier && (
          <Button size="sm" variant="secondary" onClick={() => onOpenOutlier(outlier)}>
            Open outlier
          </Button>
        )}
        {channel && onOpenChannel && (
          <Button size="sm" variant="ghost" onClick={() => onOpenChannel(channel)}>
            Open {channel.name}
          </Button>
        )}
        {message.model && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            {message.model} · ${message.costUsd.toFixed(4)} · {fmtAge(message.createdAt)} ago
          </span>
        )}
      </div>
    </div>
  );
}

/* ── the auditable artifact ───────────────────────────────────────── */

function ArtifactCard({ artifact }: { artifact: AgentArtifact }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        background: "var(--surface-1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10.5, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
          }}
        >
          Auditable artifact
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
          {artifact.id}
        </span>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <Field label="Evidence used">{artifact.evidenceSummary}</Field>

        <div>
          <FieldLabel>
            Ranked hypotheses
            {/* These percentages are the model's own stated confidence, taken
                straight from the tool call. Nothing calibrates or normalises
                them — they routinely do not sum to 100. Saying so here is the
                difference between a number and a claim. */}
            <span
              className="muted"
              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}
            >
              model-stated, not calibrated
            </span>
          </FieldLabel>
          <div style={{ display: "grid", gap: 6 }}>
            {artifact.hypotheses.map((h, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "var(--text-2)",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: "var(--text-1)", fontWeight: 500, flex: 1 }}>
                    {h.cause}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {Math.round(h.confidence * 100)}%
                  </span>
                </div>
                {h.failureCategory && (
                  <div style={{ marginTop: 4 }}>
                    <Pill size="sm" mono>{h.failureCategory}</Pill>
                  </div>
                )}
                {h.supportingEvidence && (
                  <div style={{ marginTop: 4, color: "var(--text-3)" }}>
                    Supporting: {h.supportingEvidence}
                  </div>
                )}
                {h.contradictingEvidence && (
                  <div style={{ marginTop: 2, color: "var(--text-3)" }}>
                    Contradicting: {h.contradictingEvidence}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {artifact.recommendedAction && (
          <Field label="Recommended action">{artifact.recommendedAction}</Field>
        )}

        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
          {artifact.model} · {artifact.inputTokens + artifact.outputTokens} tokens ·
          {" "}${artifact.costUsd.toFixed(4)}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        fontWeight: 600, marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/* ── empty + composer ─────────────────────────────────────────────── */

function EmptyState() {
  return (
    <Unavailable
      label="No agent conversations yet."
      reason="Open an outlier and press Run Diagnostic Agent. Each run is recorded here permanently, with the evidence it used and what it cost."
    />
  );
}

function Composer() {
  // Deliberately inert. A conversational turn needs a harness path that does
  // not exist yet — different tool set from `submit_diagnosis`, multi-turn
  // context, its own token budget. The previous version of this screen faked
  // it with a setTimeout and a hardcoded answer. An input that plainly says it
  // is not wired is better than one that invents a reply.
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-md)",
          padding: "10px 12px",
          background: "var(--surface-1)",
        }}
      >
        <Icon name="sparkle" size={13} />
        <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
          Free-form questions aren&apos;t wired up yet. Diagnostic runs started from
          the Outliers screen appear here as soon as they finish.
        </span>
      </div>
    </div>
  );
}
