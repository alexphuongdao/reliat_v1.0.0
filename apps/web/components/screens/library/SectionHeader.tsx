"use client";

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{title}</h1>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>{sub}</p>}
    </div>
  );
}
