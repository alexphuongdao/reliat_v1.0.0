"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon } from "../../ui";
import { SectionHeader } from "./SectionHeader";
import { api, type IngestBatchSummary } from "../../../lib/api";

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "done"; batch: IngestBatchSummary }
  | { status: "error"; message: string };

export function UploadsSection() {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [batches, setBatches] = useState<IngestBatchSummary[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshBatches = useCallback(async () => {
    try {
      setBatches(await api.ingest.batches());
    } catch (e) {
      // Network/auth errors are surfaced by the api layer; leave list empty.
      setBatches([]);
    }
  }, []);

  useEffect(() => {
    void refreshBatches();
  }, [refreshBatches]);

  const onFile = useCallback(
    async (file: File) => {
      setState({ status: "uploading", filename: file.name });
      try {
        const batch = await api.ingest.upload(file);
        setState({ status: "done", batch });
        await refreshBatches();
      } catch (e) {
        setState({ status: "error", message: e instanceof Error ? e.message : "upload failed" });
      }
    },
    [refreshBatches],
  );

  const onDelete = useCallback(
    async (id: string) => {
      try {
        await api.ingest.deleteBatch(id);
        await refreshBatches();
      } catch {
        /* ignore — list will refetch on next mount */
      }
    },
    [refreshBatches],
  );

  return (
    <div>
      <SectionHeader
        title="Uploads"
        sub="Drop analyzer CSV/TSV exports here. Both US (dot decimal) and EU (comma decimal) locales are auto-detected. Rejected rows are reviewable per batch."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--border-bright)"}`,
          borderRadius: "var(--r-md)",
          padding: "36px 24px",
          textAlign: "center",
          background: dragOver ? "var(--surface-2)" : "var(--surface-1)",
          marginBottom: 16,
          cursor: "pointer",
          transition: "all var(--t-fast) var(--ease)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        <Icon name="upload" size={24} />
        <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-1)" }}>
          {state.status === "uploading"
            ? `Uploading ${state.filename}…`
            : "Drop analyzer export here, or click to browse"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
          .csv · .tsv · dot- or comma-decimal · auto-detected date format
        </div>
        <div style={{ marginTop: 14 }}>
          <Button size="md" variant="secondary">Browse files</Button>
        </div>
      </div>

      {state.status === "done" && <UploadResultBanner batch={state.batch} />}
      {state.status === "error" && (
        <div
          className="panel"
          style={{
            padding: "10px 14px", marginBottom: 16,
            borderColor: "var(--sev-crit)", color: "var(--sev-crit)",
            fontSize: 12.5,
          }}
        >
          Upload failed: {state.message}
        </div>
      )}

      <h3
        style={{
          fontSize: 12, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontWeight: 600, marginBottom: 10,
        }}
      >
        Recent ingests
      </h3>
      {batches === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 12.5, padding: 10 }}>Loading…</div>
      ) : batches.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 12.5, padding: 10 }}>
          No uploads yet — drop a CSV above to get started.
        </div>
      ) : (
        <div className="panel">
          {batches.map((b, i) => (
            <BatchRow
              key={b.id}
              batch={b}
              isLast={i === batches.length - 1}
              onDelete={() => void onDelete(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadResultBanner({ batch }: { batch: IngestBatchSummary }) {
  const errs = Object.keys(batch.error_report || {}).length;
  const dup = batch.rows_duplicate;
  const tone = batch.already_ingested
    ? "var(--text-3)"
    : errs > 0
      ? "var(--sev-warn)"
      : "var(--ch-4)";
  return (
    <div
      className="panel"
      style={{
        padding: "10px 14px", marginBottom: 16,
        borderLeft: `3px solid ${tone}`,
        fontSize: 12.5, color: "var(--text-1)",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {batch.already_ingested ? "Already ingested" : "Ingest complete"}{" "}
        <span className="mono" style={{ color: "var(--text-3)" }}>· {batch.filename}</span>
      </div>
      <div style={{ marginTop: 4, color: "var(--text-2)" }}>
        <span className="mono" style={{ color: "var(--ch-4)" }}>{batch.rows_ingested} new</span>
        {" · "}
        <span className="mono">{dup} duplicate</span>
        {" · "}
        <span
          className="mono"
          style={{ color: errs > 0 ? "var(--sev-warn)" : "var(--text-3)" }}
        >
          {errs} error{errs === 1 ? "" : "s"}
        </span>
        {" · "}
        <span className="mono" style={{ color: "var(--text-3)" }}>
          {batch.detected_delimiter}-delimited, {batch.detected_decimal === "," ? "comma" : "dot"} decimal
          {batch.detected_date_format ? `, ${batch.detected_date_format}` : ""}
        </span>
      </div>
    </div>
  );
}

function BatchRow({
  batch,
  isLast,
  onDelete,
}: {
  batch: IngestBatchSummary;
  isLast: boolean;
  onDelete: () => void;
}) {
  const at = batch.uploaded_at ? new Date(batch.uploaded_at).toLocaleString() : "—";
  const errs = Object.keys(batch.error_report || {}).length;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr 140px 120px 90px 90px 28px",
        gap: 12, padding: "10px 14px", alignItems: "center",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        fontSize: 12.5,
      }}
    >
      <Icon name={errs > 0 ? "circle" : "check"} size={14} />
      <div>
        <div className="mono" style={{ fontSize: 12.5, color: "var(--text-1)" }}>{batch.filename}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{at}</div>
      </div>
      <span className="mono" style={{ color: "var(--text-2)" }}>{batch.detected_delimiter}/{batch.detected_decimal}</span>
      <span className="mono" style={{ color: "var(--text-2)" }}>{batch.rows_ingested.toLocaleString()} rows</span>
      <span className="mono" style={{ color: "var(--text-2)" }}>{batch.rows_duplicate} dup</span>
      <span
        className="mono"
        style={{ color: errs > 0 ? "var(--sev-warn)" : "var(--text-3)" }}
      >
        {errs} err
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete batch ${batch.filename}? Rows will be removed.`)) onDelete();
        }}
        aria-label="Delete batch"
        style={{
          color: "var(--text-3)", padding: 4, display: "flex",
          alignItems: "center", justifyContent: "center", background: "transparent", border: 0, cursor: "pointer",
        }}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
