"use client";

import { Button, Icon } from "../../ui";
import { SectionHeader } from "./SectionHeader";

export function UploadsSection() {
  const rows = [
    { f: "cv42_2026_05_18.csv", size: "184 MB", rows: "69,128", ok: "69,124", err: 4, at: "02:11", ch: "CV42 Tunnel" },
    { f: "cv33_2026_05_18.csv", size: "171 MB", rows: "68,891", ok: "68,891", err: 0, at: "02:10", ch: "CV33 Crusher Out" },
    { f: "cv09_2026_05_17.xlsx", size: "142 MB", rows: "54,302", ok: "54,300", err: 2, at: "00:48 yesterday", ch: "CV09 ROM" },
    { f: "bulk_archive.csv", size: "1.8 GB", rows: "8,140,221", ok: "8,140,219", err: 2, at: "3d ago", ch: "mixed" },
  ];
  return (
    <div>
      <SectionHeader
        title="Uploads"
        sub="Drop CSV or Excel exports here. Files are validated before ingest; rejected rows are reviewable."
      />
      <div
        style={{
          border: "1.5px dashed var(--border-bright)",
          borderRadius: "var(--r-md)",
          padding: "36px 24px",
          textAlign: "center",
          background: "var(--surface-1)",
          marginBottom: 24,
        }}
      >
        <Icon name="upload" size={24} />
        <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-1)" }}>
          Drop sensor exports here, or click to browse
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
          .csv · .xlsx · up to 2 GB · comma-decimal supported
        </div>
        <div style={{ marginTop: 14 }}>
          <Button size="md" variant="secondary">Browse files</Button>
        </div>
      </div>

      <h3
        style={{
          fontSize: 12, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontWeight: 600, marginBottom: 10,
        }}
      >
        Recent ingests
      </h3>
      <div className="panel">
        {rows.map((it, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr 140px 110px 90px 90px",
              gap: 12, padding: "10px 14px", alignItems: "center",
              borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)",
              fontSize: 12.5,
            }}
          >
            <Icon name="check" size={14} />
            <div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--text-1)" }}>{it.f}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{it.ch} · {it.at}</div>
            </div>
            <span className="mono" style={{ color: "var(--text-2)" }}>{it.size}</span>
            <span className="mono" style={{ color: "var(--text-2)" }}>{it.rows} rows</span>
            <span className="mono" style={{ color: "var(--ch-4)" }}>{it.ok} ok</span>
            <span
              className="mono"
              style={{ color: it.err > 0 ? "var(--sev-warn)" : "var(--text-3)" }}
            >
              {it.err} err
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
