import React, { useState } from "react";
import {
  Car, Bike, AlertTriangle, HardHat, Users2, ScanLine,
  Clock, Trash2, ShieldAlert, TrafficCone, Gauge, MapPin,
} from "lucide-react";

/* ============================================================================
   SEER — Safety & Traffic tab
   ----------------------------------------------------------------------------
   A fourth view for the Seer dashboard covering people-safety and traffic
   analytics, alongside the existing retail tabs. Reuses the host dashboard's
   design tokens (C), primitives (Panel, Kpi, CameraWall) and alert-row idiom.

   Event domains surfaced here:
     people:  loiter, litter
     traffic: atcc (vehicle count + adaptive signal), accident, helmet,
              triple_riding, anpr (plate reads)

   Backend contract (all optional; mock fallback below keeps the demo alive):
     GET {API_BASE}/api/safety?site=...   -> SafetyPayload (shape: MOCK_SAFETY)

   This file is import-only UI. Wire it into SeerDashboardV2.jsx by:
     1. adding the new event types to TYPE_ICON
     2. adding ["safety","Safety & Traffic", ShieldAlert] to the tab row
     3. rendering <SafetyTrafficView .../> when view === "safety"
   See the integration notes at the bottom of this file.
   ============================================================================ */

/* Pull the host palette in by prop so this file has no hard dependency on it. */

/* event-type metadata local to this tab (icon + label + which domain) */
export const SAFETY_TYPES = {
  loiter:        { icon: Clock,         label: "Loitering",      domain: "people" },
  litter:        { icon: Trash2,        label: "Littering",      domain: "people" },
  accident:      { icon: AlertTriangle, label: "Accident",       domain: "traffic" },
  helmet:        { icon: HardHat,       label: "No helmet",      domain: "traffic" },
  triple_riding: { icon: Users2,        label: "Triple riding",  domain: "traffic" },
  anpr:          { icon: ScanLine,      label: "Plate read",     domain: "traffic" },
  overspeed:     { icon: Gauge,         label: "Over-speed",     domain: "traffic" },
};

/* ----------------------------- mock fallback ----------------------------- */

export function mockSafety(siteId = "all") {
  const scale = { all: 1, panaji: 0.5, margao: 0.35, mapusa: 0.28 }[siteId] ?? 0.6;
  const r = (n) => Math.round(n * scale);
  return {
    site: siteId,
    updatedAt: new Date().toISOString(),
    kpis: {
      vehiclesToday:   { value: r(4820), deltaPct: 8.1 },
      violationsToday: { value: r(63),   deltaPct: -4.2 },
      avgSpeedKmh:     { value: 34,      deltaPct: 2 },
      peopleAlerts:    { value: r(11),   deltaPct: 15 },
    },
    // ATCC live per-feed snapshot
    traffic: [
      {
        feed: "Junction A — north approach",
        signal: "Green", signalState: 2,
        total: r(38),
        classes: { car: r(22), motorcycle: r(9), truck: r(4), bus: r(3) },
        lanes: { left: r(16), right: r(22) },
      },
      {
        feed: "Junction A — east approach",
        signal: "Red", signalState: 0,
        total: r(57),
        classes: { car: r(31), motorcycle: r(14), truck: r(7), bus: r(5) },
        lanes: { left: r(30), right: r(27) },
      },
    ],
    // recent plate reads (ANPR) — best-effort, may be partial/low-confidence
    plates: [
      { plate: "GA06 AB 1234", conf: 0.91, vehicle: "car",        feed: "Junction A — east",  agoSec: 12 },
      { plate: "GA08 CK 7782", conf: 0.74, vehicle: "motorcycle", feed: "Junction A — north", agoSec: 48 },
      { plate: "GA01 ZZ 0099", conf: 0.62, vehicle: "truck",      feed: "Junction A — east",  agoSec: 96 },
    ],
    alerts: [
      { id: "s1", severity: "danger",  type: "accident",      title: "Possible collision — Junction A east", detail: "2 vehicles, low motion after impact", agoSec: 22 },
      { id: "s2", severity: "warning", type: "helmet",        title: "Rider without helmet",                  detail: "motorcycle · GA08 CK 7782",            agoSec: 60 },
      { id: "s3", severity: "warning", type: "triple_riding", title: "Triple riding detected",                detail: "3 on one motorcycle · north approach",  agoSec: 140 },
      { id: "s4", severity: "warning", type: "loiter",        title: "Loitering — shopfront zone",            detail: "track #58 · 47s dwell",                 agoSec: 205 },
      { id: "s5", severity: "info",    type: "litter",        title: "Littering — bin-adjacent",              detail: "track #44 · conf 0.78",                 agoSec: 320 },
      { id: "s6", severity: "info",    type: "anpr",          title: "Plate read · GA06 AB 1234",             detail: "car · east approach · conf 0.91",       agoSec: 410 },
    ],
  };
}

export async function fetchSafety(API_BASE, siteId) {
  if (!API_BASE) return mockSafety(siteId);
  try {
    const res = await fetch(`${API_BASE}/api/safety?site=${siteId}`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return mockSafety(siteId);
  }
}

/* ------------------------------ formatters ------------------------------ */
const ago = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`);
const fmtNum = (n) => Number(n).toLocaleString("en-IN");

/* ------------------------------ sub-pieces ------------------------------ */

/* Signal pill that mirrors the ATCC adaptive-signal logic (count -> color) */
function SignalPill({ C, signal, state }) {
  const map = { 0: C.red, 1: C.amber, 2: C.accent };
  const col = map[state] ?? C.dim;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
      fontWeight: 600, color: col, background: `${col}1F`,
      borderRadius: 999, padding: "3px 10px",
    }}>
      <TrafficCone size={12} /> {signal}
    </span>
  );
}

/* Horizontal class breakdown for one traffic feed */
function ClassBars({ C, classes, total }) {
  const palette = { car: C.blue, motorcycle: C.accent, truck: C.amber, bus: "#FF7A45" };
  const max = Math.max(total, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {Object.entries(classes).map(([cls, n]) => (
        <div key={cls}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
            <span style={{ color: C.dim, textTransform: "capitalize" }}>{cls}</span>
            <span style={{ fontWeight: 500 }}>{fmtNum(n)}</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
            <div style={{ height: "100%", width: `${(n / max) * 100}%`, background: palette[cls] ?? C.dim, borderRadius: 4, transition: "width .5s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Per-feed ATCC card: count, signal, lane split, class mix */
function TrafficFeedCard({ C, feed }) {
  return (
    <div style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={13} color={C.dim} /> {feed.feed}
        </span>
        <SignalPill C={C} signal={feed.signal} state={feed.signalState} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{fmtNum(feed.total)}</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>vehicles in frame</span>
      </div>
      <ClassBars C={C} classes={feed.classes} total={feed.total} />
      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11.5, color: C.dim }}>
        <span>◀ left lane <b style={{ color: C.text }}>{fmtNum(feed.lanes.left)}</b></span>
        <span>right lane <b style={{ color: C.text }}>{fmtNum(feed.lanes.right)}</b> ▶</span>
      </div>
    </div>
  );
}

/* An alert row matching the host dashboard's idiom, colored by severity,
   iconed by safety type. */
function SafetyAlertRow({ C, SEV_COLOR, a, last }) {
  const meta = SAFETY_TYPES[a.type] ?? { icon: ShieldAlert, label: a.type };
  const Icon = meta.icon;
  const sev = SEV_COLOR[a.severity] ?? { c: C.dim, bg: "rgba(255,255,255,0.06)" };
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: last ? "none" : `1px solid ${C.border}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: sev.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={sev.c} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
        <div style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.detail}</div>
      </div>
      <span style={{ fontSize: 10.5, color: sev.c, background: sev.bg, borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>{meta.label}</span>
      <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0, minWidth: 28, textAlign: "right" }}>{ago(a.agoSec)}</span>
    </div>
  );
}

/* ------------------------------- main view ------------------------------ */
/*
  Props injected from the host dashboard so this file stays token-agnostic:
    C, SEV_COLOR  - design tokens from SeerDashboardV2
    Panel, Kpi    - primitives from SeerDashboardV2
    CameraWall    - camera component from SeerDashboardV2
    data          - SafetyPayload (fetchSafety result)
    cameras       - the same camera list the Overview uses
    fmtNum, fmtDwell - host formatters (fmtDwell optional)
*/
export default function SafetyTrafficView({
  C, SEV_COLOR, Panel, Kpi, CameraWall, data, cameras = [],
}) {
  const [domainFilter, setDomainFilter] = useState("all"); // all | people | traffic
  if (!data) return null;

  const k = data.kpis ?? {};
  const alerts = (data.alerts ?? []).filter((a) => {
    if (domainFilter === "all") return true;
    return (SAFETY_TYPES[a.type]?.domain ?? "traffic") === domainFilter;
  });

  // counts by type for the breakdown panel
  const byType = {};
  (data.alerts ?? []).forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
  const typeItems = Object.entries(byType).sort((x, y) => y[1] - x[1]);

  return (
    <>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
        <Kpi label="Vehicles today" value={k.vehiclesToday ? fmtNum(k.vehiclesToday.value) : "—"} delta={k.vehiclesToday?.deltaPct ?? 0} />
        <Kpi label="Violations today" value={k.violationsToday ? fmtNum(k.violationsToday.value) : "—"} delta={k.violationsToday?.deltaPct ?? 0} deltaGood={(k.violationsToday?.deltaPct ?? 0) <= 0} />
        <Kpi label="Avg speed" value={k.avgSpeedKmh ? `${k.avgSpeedKmh.value} km/h` : "—"} delta={k.avgSpeedKmh?.deltaPct ?? 0} />
        <Kpi label="People alerts" value={k.peopleAlerts ? fmtNum(k.peopleAlerts.value) : "—"} delta={k.peopleAlerts?.deltaPct ?? 0} deltaGood={false} />
      </div>

      {/* HERO: camera wall + live safety alert feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel title="Camera wall" sub="safety & traffic feeds · detections burned-in">
          {cameras.length ? <CameraWall cameras={cameras} /> : (
            <div style={{ fontSize: 12.5, color: C.faint, padding: "30px 0", textAlign: "center" }}>
              No feeds yet — add a camera or upload footage from the Overview tab.
            </div>
          )}
        </Panel>

        <Panel title="Live safety & traffic alerts" style={{ display: "flex", flexDirection: "column" }}
          right={
            <div style={{ display: "flex", gap: 3, background: C.panelAlt, borderRadius: 8, padding: 3 }}>
              {[["all", "All"], ["people", "People"], ["traffic", "Traffic"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setDomainFilter(id)} style={{
                  border: "none", cursor: "pointer", fontSize: 11, padding: "3px 9px", borderRadius: 6,
                  background: domainFilter === id ? C.accentBg : "transparent",
                  color: domainFilter === id ? C.accent : C.dim,
                  fontWeight: domainFilter === id ? 600 : 400,
                }}>{lbl}</button>
              ))}
            </div>
          }>
          <div style={{ flex: 1 }}>
            {alerts.length ? alerts.map((a, i, arr) => (
              <SafetyAlertRow key={a.id} C={C} SEV_COLOR={SEV_COLOR} a={a} last={i === arr.length - 1} />
            )) : (
              <div style={{ fontSize: 12.5, color: C.faint, padding: "20px 0" }}>No alerts in this filter.</div>
            )}
          </div>
        </Panel>
      </div>

      {/* ATCC traffic feeds + ANPR plate reads + alert-type breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14 }}>
        <Panel title="Traffic — adaptive signal control" sub="vehicle count drives signal state · ATCC">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(data.traffic ?? []).map((f) => <TrafficFeedCard key={f.feed} C={C} feed={f} />)}
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Panel title="Recent plate reads" sub="ANPR · best-effort, confidence shown">
            <div>
              {(data.plates ?? []).map((p, i, arr) => (
                <div key={`${p.plate}-${i}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
                  <ScanLine size={15} color={C.dim} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}>{p.plate}</div>
                    <div style={{ fontSize: 10.5, color: C.faint }}>{p.vehicle} · {p.feed}</div>
                  </div>
                  <span style={{
                    fontSize: 10.5, flexShrink: 0,
                    color: p.conf >= 0.85 ? C.accent : p.conf >= 0.7 ? C.amber : C.red,
                  }}>{Math.round(p.conf * 100)}%</span>
                  <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{ago(p.agoSec)}</span>
                </div>
              ))}
              {(data.plates ?? []).length === 0 && (
                <div style={{ fontSize: 12, color: C.faint, padding: "10px 0" }}>No reads yet.</div>
              )}
            </div>
          </Panel>

          <Panel title="Alerts by type" sub={`${(data.alerts ?? []).length} in the current window`} style={{ flex: 1 }}>
            {typeItems.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {typeItems.map(([type, n]) => {
                  const meta = SAFETY_TYPES[type] ?? { icon: ShieldAlert, label: type };
                  const Icon = meta.icon;
                  const total = (data.alerts ?? []).length || 1;
                  return (
                    <div key={type}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: C.dim, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon size={13} /> {meta.label}
                        </span>
                        <span style={{ fontWeight: 500 }}>{n}</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${(n / total) * 100}%`, background: C.accent, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.faint }}>No alerts yet.</div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   INTEGRATION NOTES — wiring this into SeerDashboardV2.jsx
   ----------------------------------------------------------------------------
   1. Import at top of SeerDashboardV2.jsx:
        import SafetyTrafficView, { fetchSafety } from "./SafetyTrafficView";

   2. Extend the alert icon map so Overview's alert list can also show the
      new types (optional but recommended). Near TYPE_ICON add:
        import { Clock, Trash2, AlertTriangle, HardHat, Users2, ScanLine } from "lucide-react";
        // then merge into TYPE_ICON:
        //   loiter: Clock, litter: Trash2, accident: AlertTriangle,
        //   helmet: HardHat, triple_riding: Users2, anpr: ScanLine,

   3. Add state + fetch in SeerDashboard():
        const [safety, setSafety] = useState(null);
        // inside load():  const sf = await fetchSafety(API_BASE, id); setSafety(sf);
        // (add sf to the Promise.all and setSafety alongside setData)

   4. Add the tab button to the view row (the array near line ~1006):
        ["safety", "Safety & Traffic", ShieldAlert]

   5. Render it in the view switch (near line ~1032):
        ) : view === "safety" ? (
          <SafetyTrafficView
            C={C} SEV_COLOR={SEV_COLOR} Panel={Panel} Kpi={Kpi}
            CameraWall={CameraWall} data={safety} cameras={cameras}
            fmtNum={fmtNum} fmtDwell={fmtDwell}
          />
        ) : (

   Because the existing C, SEV_COLOR, Panel, Kpi, CameraWall, fmtNum live in
   SeerDashboardV2.jsx, they're passed in as props rather than re-imported, so
   there's a single source of truth for the design tokens.
   ============================================================================ */
