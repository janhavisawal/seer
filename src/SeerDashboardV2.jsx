import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye, ArrowUpRight, ArrowDownRight, Users, PackageX, Clock, Boxes,
  Activity, TrendingUp, Circle, ShieldAlert, Flag, Video, VideoOff,
  TrendingDown, AlertTriangle, Plus, X, Trash2, BarChart3, LayoutGrid,
  Upload, Film, Download, HardHat, Users2, ScanLine,
} from "lucide-react";
import SafetyTrafficView, { fetchSafety } from "./SafetyTrafficView";

/* ============================================================================
   SEER — Retail Vision Analytics · Dashboard v2
   ----------------------------------------------------------------------------
   Live mode: set API_BASE to your FastAPI host. The component polls
     GET  {API_BASE}/api/dashboard?site=...      (DashboardPayload, incl. cameras[])
     GET  {API_BASE}/api/inventory/trends        (InventoryTrend[])
   Camera feeds render as <img src={API_BASE + cam.streamUrl}> — burned-in
   MJPEG, no player library. If the API is unreachable, the dashboard falls
   back to mock data automatically so the demo never shows a blank screen.
   ============================================================================ */

const API_BASE = "https://subsector-refusal-limit.ngrok-free.dev";                 // e.g. "http://localhost:8000"; "" = mock
const POLL_MS = 4000;

const SITES = [
  { id: "all", name: "All sites" },
  { id: "panaji", name: "Panaji flagship" },
  { id: "margao", name: "Margao" },
  { id: "mapusa", name: "Mapusa" },
];

const C = {
  bg: "#0B0E13", panel: "#12161F", panelAlt: "#161B26",
  border: "rgba(255,255,255,0.07)", text: "#E7EAF0",
  dim: "#8A93A6", faint: "#5A6275",
  accent: "#3DDC97", accentBg: "rgba(61,220,151,0.14)",
  blue: "#5B9BFF", amber: "#F0A93B", red: "#FF5C5C",
  grid: "rgba(255,255,255,0.05)",
};

/* alert icon by TYPE (backend contract), color by SEVERITY */
const TYPE_ICON = {
  stockout: PackageX, queue: Users, dwell: Clock, planogram: Boxes,
  crowd: Users, intrusion: ShieldAlert, review: Flag,
  // safety & traffic domains (shared with the Safety & Traffic tab)
  loiter: Clock, litter: Trash2, accident: AlertTriangle,
  helmet: HardHat, triple_riding: Users2, anpr: ScanLine,
};
const SEV_COLOR = {
  danger: { c: C.red, bg: "rgba(255,92,92,0.12)" },
  warning: { c: C.amber, bg: "rgba(240,169,59,0.12)" },
  info: { c: C.blue, bg: "rgba(91,155,255,0.12)" },
  success: { c: C.accent, bg: C.accentBg },
};
const INV_STATUS = {
  ok: { c: C.accent, label: "ok" },
  depleting: { c: C.amber, label: "depleting" },
  stockout: { c: C.red, label: "stockout" },
};

/* ----------------------------- mock fallback ----------------------------- */

const HOURS = ["09","10","11","12","13","14","15","16","17","18","19","20","21"];

function mockDashboard(siteId) {
  const base = { all: 3418, panaji: 1240, margao: 890, mapusa: 720 }[siteId] ?? 800;
  const s = base / 3418;
  const shape = [120,180,240,310,280,260,340,420,510,560,480,360,210];
  return {
    site: SITES.find((x) => x.id === siteId),
    updatedAt: new Date().toISOString(),
    kpis: {
      footfall: { value: base, deltaPct: 12.4 },
      avgDwellSec: { value: 372, deltaSec: 38 },
      conversionPct: { value: 23.6, deltaPct: -1.8 },
      compliancePct: { value: 91, deltaPct: 3 },
    },
    hourly: HOURS.map((h, i) => {
      const e = Math.round(shape[i] * s);
      return { hour: h, entries: e, transactions: Math.round(e * 0.235) };
    }),
    funnel: [
      { stage: "Store entries", value: base, pct: 100 },
      { stage: "Zone engaged", value: Math.round(base * 0.62), pct: 62 },
      { stage: "Checkout", value: Math.round(base * 0.236), pct: 24 },
    ],
    zones: [
      ["Z1","Entrance",0.45],["Z2","Front display",0.7],["Z3","Apparel",0.9],
      ["Z4","Electronics",0.55],["Z6","Checkout",0.95],["Z9","Stockroom door",0.1],
    ].map(([id,name,i]) => ({
      id, name, intensity: i, dwellSec: Math.round(40 + i*380),
      footfall: Math.round(900*i*s), conversionPct: Math.round(12 + i*18),
    })),
    alerts: [
      { id:"a1", severity:"danger", type:"intrusion", title:"Restricted zone entry — Stockroom door", detail:"track #41", agoSec:35 },
      { id:"a2", severity:"warning", type:"stockout", title:"A4-B3/r1c1 depleting — shampoo_500ml", detail:"~60 min to empty at current rate", agoSec:140 },
      { id:"a3", severity:"warning", type:"review", title:"Exit without checkout — track #27", detail:"flagged for human review", agoSec:260 },
      { id:"a4", severity:"warning", type:"queue", title:"Checkout queue building", detail:"5 waiting", agoSec:380 },
      { id:"a5", severity:"success", type:"planogram", title:"A4-B3 compliant", detail:"96% planogram match", agoSec:900 },
    ],
    cameras: [
      { id:"cam_entrance", name:"Entrance overhead", streamUrl:"/api/streams/cam_entrance/mjpeg", kind:"mjpeg", status:"online", fps:14.2, detectionCount:7 },
      { id:"cam_apparel", name:"Apparel floor", streamUrl:"/api/streams/cam_apparel/mjpeg", kind:"mjpeg", status:"online", fps:13.8, detectionCount:11 },
      { id:"cam_shelf_a4", name:"Aisle 4 shelf", streamUrl:"/api/streams/cam_shelf_a4/mjpeg", kind:"mjpeg", status:"online", fps:0.1, detectionCount:23 },
      { id:"cam_checkout", name:"Checkout lanes", streamUrl:"/api/streams/cam_checkout/mjpeg", kind:"mjpeg", status:"offline", fps:0, detectionCount:0 },
    ],
  };
}

function mockInventory() {
  return [
    { shelf_id:"A4-B3", cell_id:"r1c1", expected_class:"shampoo_500ml", facings:2, min_facings:3, rate_per_hour:-2.0, eta_stockout_min:60, status:"depleting" },
    { shelf_id:"A4-B3", cell_id:"r1c2", expected_class:"conditioner", facings:4, min_facings:2, rate_per_hour:-0.3, eta_stockout_min:null, status:"ok" },
    { shelf_id:"A4-B3", cell_id:"r2c1", expected_class:"soap_pack", facings:0, min_facings:4, rate_per_hour:-1.1, eta_stockout_min:null, status:"stockout" },
    { shelf_id:"A2-B1", cell_id:"r1c1", expected_class:"detergent_1kg", facings:6, min_facings:3, rate_per_hour:-0.9, eta_stockout_min:400, status:"ok" },
  ];
}

async function fetchDashboard(siteId) {
  if (!API_BASE) return mockDashboard(siteId);
  try {
    const r = await fetch(`${API_BASE}/api/dashboard?site=${siteId}`);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return mockDashboard(siteId); // never blank-screen the demo
  }
}

async function fetchInventory() {
  if (!API_BASE) return mockInventory();
  try {
    const r = await fetch(`${API_BASE}/api/inventory/trends`);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return mockInventory();
  }
}

function mockPlanogram() {
  return [{
    shelf_id: "A4-B3",
    frame_size: [1280, 720],
    cells: [
      { id: "r1c1", bbox: [80, 100, 380, 280],  expected_class: "shampoo_500ml", min_facings: 3 },
      { id: "r1c2", bbox: [380, 100, 680, 280], expected_class: "conditioner",   min_facings: 2 },
      { id: "r1c3", bbox: [680, 100, 980, 280], expected_class: "hair_oil",      min_facings: 2 },
      { id: "r2c1", bbox: [80, 300, 380, 480],  expected_class: "soap_pack",     min_facings: 4 },
      { id: "r2c2", bbox: [380, 300, 680, 480], expected_class: "face_wash",     min_facings: 3 },
      { id: "r2c3", bbox: [680, 300, 980, 480], expected_class: "body_lotion",   min_facings: 2 },
    ],
    latest: {
      shelf_id: "A4-B3", compliance_pct: 50,
      checked_at: new Date().toISOString(),
      cells: [
        { cell_id: "r1c1", expected_class: "shampoo_500ml", expected_min_facings: 3, detected_facings: 2, misplaced_facings: 0, compliant: false },
        { cell_id: "r1c2", expected_class: "conditioner", expected_min_facings: 2, detected_facings: 2, misplaced_facings: 1, compliant: false },
        { cell_id: "r1c3", expected_class: "hair_oil", expected_min_facings: 2, detected_facings: 4, misplaced_facings: 0, compliant: true },
        { cell_id: "r2c1", expected_class: "soap_pack", expected_min_facings: 4, detected_facings: 0, misplaced_facings: 0, compliant: false },
        { cell_id: "r2c2", expected_class: "face_wash", expected_min_facings: 3, detected_facings: 5, misplaced_facings: 0, compliant: true },
        { cell_id: "r2c3", expected_class: "body_lotion", expected_min_facings: 2, detected_facings: 3, misplaced_facings: 0, compliant: true },
      ],
      gaps: ["r2c1"],
      misplacements: [{ cell_id: "r1c2", expected_class: "conditioner", found_class: "soap_pack" }],
    },
  }];
}

async function fetchPlanogram() {
  if (!API_BASE) return mockPlanogram();
  try {
    const r = await fetch(`${API_BASE}/api/planogram/state`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return j.length ? j : mockPlanogram();
  } catch {
    return mockPlanogram();
  }
}

/* POST /api/cameras — returns created CameraInfo, or a local stub in mock mode */
async function apiAddCamera(body) {
  if (!API_BASE) {
    const id = "cam_" + body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return { id, name: body.name, streamUrl: `/api/streams/${id}/mjpeg`, kind: "mjpeg", status: "offline", fps: 0, detectionCount: 0, _local: true };
  }
  const r = await fetch(`${API_BASE}/api/cameras`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).detail ?? `HTTP ${r.status}`);
  return await r.json();
}

async function apiRemoveCamera(id) {
  if (!API_BASE) return true;
  const r = await fetch(`${API_BASE}/api/cameras/${id}`, { method: "DELETE" });
  return r.ok;
}

/* POST /api/videos — multipart upload; returns job info (analyze) or camera (live_loop) */
async function apiUploadVideo(file, mode, name) {
  if (!API_BASE) return { _mock: true, mode };          // modal simulates the rest
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  fd.append("name", name || file.name.replace(/\.[^.]+$/, ""));
  const r = await fetch(`${API_BASE}/api/videos`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail ?? `HTTP ${r.status}`);
  return await r.json();
}

async function apiVideoStatus(jobId) {
  const r = await fetch(`${API_BASE}/api/videos/${jobId}/status`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

const MOCK_SUMMARY = {
  entries: 24, exits: 21, unique_tracks: 26, peak_concurrent: 7,
  zones: [
    { id: "Z1", name: "Entrance", visits: 24, avgDwellSec: 14.2 },
    { id: "Z3", name: "Apparel", visits: 17, avgDwellSec: 96.5 },
    { id: "Z6", name: "Checkout", visits: 11, avgDwellSec: 58.1 },
  ],
  review_flags: [{ type: "exit_without_checkout", track_id: 19 }],
};

/* ------------------------------ formatters ------------------------------ */

const fmtNum = (n) => Number(n).toLocaleString("en-IN");
const fmtDwell = (s) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
const ago = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`);
const fmtEta = (m) => (m == null ? "—" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

/* ------------------------------- primitives ------------------------------ */

function Panel({ title, sub, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 17px", minWidth: 0, ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: sub ? 2 : 13 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
          {right}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: C.faint, marginBottom: 13 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Kpi({ label, value, delta, deltaGood }) {
  const up = delta >= 0;
  const good = deltaGood === undefined ? up : deltaGood;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, color: good ? C.accent : C.red, marginTop: 7 }}>
        <Arrow size={12} /> {Math.abs(delta)}
      </div>
    </div>
  );
}

/* --------------------------- camera components --------------------------- */

function CameraFeed({ cam, focused }) {
  const [err, setErr] = useState(false);
  const offline = cam.status === "offline" || err || !API_BASE;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#070A0F", borderRadius: focused ? 12 : 8, overflow: "hidden" }}>
      {!offline ? (
        <img
          src={`${API_BASE}${cam.streamUrl}`}
          alt={`${cam.name} live annotated feed`}
          onError={() => setErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8, color: C.faint,
          background: "repeating-linear-gradient(45deg, #0A0D13 0 12px, #0C1018 12px 24px)",
        }}>
          <VideoOff size={focused ? 28 : 18} />
          {focused && (
            <div style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
              {cam.status === "offline" ? "camera offline" : "feed unavailable — set API_BASE to connect"}
            </div>
          )}
        </div>
      )}
      {/* overlay chrome */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, padding: focused ? "8px 12px" : "5px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "linear-gradient(180deg, rgba(7,10,15,0.85), transparent)",
      }}>
        <span style={{ fontSize: focused ? 12.5 : 10.5, fontWeight: 500, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
          <Circle size={7} fill={offline ? C.faint : C.red} color={offline ? C.faint : C.red} />
          {cam.name}
        </span>
        {focused && !offline && (
          <span style={{ fontSize: 11, color: C.dim }}>
            {cam.fps} fps · {cam.detectionCount} detections
          </span>
        )}
      </div>
    </div>
  );
}

function CameraWall({ cameras }) {
  const [focusId, setFocusId] = useState(null);
  const focus = cameras.find((c) => c.id === focusId) ?? cameras[0];
  if (!focus) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ flex: 1, minHeight: 260 }}>
        <CameraFeed cam={focus} focused />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(cameras.length, 1)},1fr)`, gap: 8 }}>
        {cameras.map((cam) => (
          <button key={cam.id} onClick={() => setFocusId(cam.id)}
            style={{
              padding: 0, border: cam.id === focus.id ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
              borderRadius: 9, background: "none", cursor: "pointer", height: 64, overflow: "hidden",
            }}
            aria-label={`Focus ${cam.name}`}>
            <CameraFeed cam={cam} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ chart pieces ----------------------------- */

function HourlyChart({ data }) {
  const W = 560, H = 170, pad = { t: 12, r: 6, b: 20, l: 6 };
  const max = Math.max(...data.map((d) => d.entries), 1) * 1.1;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = (iw / data.length) * 0.55;
  const x = (i) => pad.l + (iw / data.length) * (i + 0.5);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.transactions).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Hourly entries (bars) and transactions (line).">
      {[0.33, 0.66, 1].map((g) => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - g)} y2={pad.t + ih * (1 - g)} stroke={C.grid} />
      ))}
      {data.map((d, i) => (
        <rect key={d.hour} x={x(i) - bw / 2} y={y(d.entries)} width={bw} height={Math.max(pad.t + ih - y(d.entries), 0)} rx="2.5" fill={C.blue} opacity="0.85" />
      ))}
      <path d={line} fill="none" stroke={C.accent} strokeWidth="2.2" strokeDasharray="5 3" strokeLinecap="round" />
      {data.map((d, i) => (
        <text key={d.hour} x={x(i)} y={H - 5} fontSize="9.5" fill={C.faint} textAnchor="middle">{d.hour}</text>
      ))}
    </svg>
  );
}

function Funnel({ data }) {
  const cols = [C.blue, C.accent, "#FF7A45", C.amber];
  return data.map((f, i) => (
    <div key={f.stage} style={{ marginBottom: i === data.length - 1 ? 0 : 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: C.dim }}>{f.stage}</span>
        <span style={{ fontWeight: 500 }}>{fmtNum(f.value)} · {f.pct}%</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 5 }}>
        <div style={{ height: "100%", width: `${f.pct}%`, background: cols[i % cols.length], borderRadius: 5, transition: "width .5s" }} />
      </div>
    </div>
  ));
}

const heatColor = (v) =>
  v < 0.35 ? "rgba(61,220,151,0.30)" : v < 0.55 ? "rgba(61,220,151,0.75)"
  : v < 0.78 ? "rgba(240,169,59,0.85)" : "rgba(255,92,92,0.92)";

/* --------------------------- add camera modal ---------------------------- */

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#0D1119",
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 13, padding: "9px 11px", outline: "none",
};
const labelStyle = { fontSize: 11.5, color: C.dim, marginBottom: 5, display: "block" };

function AddCameraModal({ onClose, onAdded }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [role, setRole] = useState("people");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim() || !source.trim()) { setError("Name and source are required."); return; }
    setBusy(true); setError("");
    try {
      const cam = await apiAddCamera({ name: name.trim(), source: source.trim(), role });
      onAdded(cam);
      onClose();
    } catch (e) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-label="Add camera" style={{
      position: "fixed", inset: 0, background: "rgba(5,7,11,0.7)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 22, width: "100%", maxWidth: 420,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Add camera</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 2 }}><X size={17} /></button>
        </div>

        <label style={labelStyle}>Camera name</label>
        <input style={{ ...inputStyle, marginBottom: 13 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Footwear aisle 2" />

        <label style={labelStyle}>Source — RTSP URL, video file, or "0" for webcam</label>
        <input style={{ ...inputStyle, marginBottom: 13 }} value={source} onChange={(e) => setSource(e.target.value)} placeholder="rtsp://user:pass@192.168.1.45:554/stream1" />

        <label style={labelStyle}>Pipeline</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["people", "People & zones", Users], ["planogram", "Shelf & inventory", Boxes]].map(([val, lbl, Icon]) => (
            <button key={val} onClick={() => setRole(val)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderRadius: 9, cursor: "pointer", fontSize: 12.5,
              border: role === val ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
              background: role === val ? C.accentBg : "transparent",
              color: role === val ? C.accent : C.dim,
            }}>
              <Icon size={15} /> {lbl}
            </button>
          ))}
        </div>

        {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{
          width: "100%", padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer",
          background: C.accent, color: "#06140E", fontSize: 13.5, fontWeight: 600,
          opacity: busy ? 0.6 : 1,
        }}>{busy ? "Connecting…" : "Add camera"}</button>

        <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
          The pipeline starts immediately; the feed shows offline until the first
          frame arrives. People cameras use the default zone map until calibrated.
        </div>
      </div>
    </div>
  );
}

/* --------------------------- upload video modal -------------------------- */

function UploadVideoModal({ onClose, onCameraAdded }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("analyze");
  const [phase, setPhase] = useState("form");   // form | working | done | error
  const [prog, setProg] = useState({ pct: 0, fps: 0, frames: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [dlUrl, setDlUrl] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const submit = async () => {
    if (!file) { setError("Choose a video file first."); return; }
    setError("");
    try {
      const res = await apiUploadVideo(file, mode);
      if (res._mock) {
        if (mode === "live_loop") {
          const id = "cam_" + file.name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "_");
          onCameraAdded({ id, name: file.name, streamUrl: `/api/streams/${id}/mjpeg`, kind: "mjpeg", status: "online", fps: 14, detectionCount: 4, _local: true });
          setPhase("done"); setSummary(null);
          return;
        }
        setPhase("working");
        let pct = 0;
        pollRef.current = setInterval(() => {
          pct = Math.min(pct + 7 + Math.random() * 6, 100);
          setProg({ pct: Math.round(pct), fps: 21.4, frames: Math.round(pct * 14.5), total: 1450 });
          if (pct >= 100) {
            clearInterval(pollRef.current);
            setSummary(MOCK_SUMMARY); setDlUrl("#mock"); setPhase("done");
          }
        }, 350);
        return;
      }
      if (res.mode === "live_loop") {
        onCameraAdded(null);                       // triggers reload
        setPhase("done"); setSummary(null);
        return;
      }
      setPhase("working");
      pollRef.current = setInterval(async () => {
        try {
          const st = await apiVideoStatus(res.job_id);
          setProg({ pct: st.progressPct, fps: st.achievedFps, frames: st.currentFrame, total: st.totalFrames });
          if (st.status === "done") {
            clearInterval(pollRef.current);
            setSummary(st.summary); setDlUrl(`${API_BASE}${st.downloadUrl}`); setPhase("done");
          } else if (st.status === "error") {
            clearInterval(pollRef.current);
            setError(st.error || "processing failed"); setPhase("error");
          }
        } catch { /* transient poll failure — keep polling */ }
      }, 1000);
    } catch (e) {
      setError(String(e.message ?? e)); setPhase("error");
    }
  };

  return (
    <div role="dialog" aria-label="Upload footage" style={{
      position: "fixed", inset: 0, background: "rgba(5,7,11,0.7)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={phase === "working" ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 22, width: "100%", maxWidth: 460,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Film size={16} color={C.accent} /> Upload footage
          </div>
          {phase !== "working" && (
            <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 2 }}><X size={17} /></button>
          )}
        </div>

        {phase === "form" && (
          <>
            <label htmlFor="seer-vid" style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              border: `1.5px dashed ${file ? C.accent : "rgba(255,255,255,0.18)"}`,
              borderRadius: 10, padding: "22px 14px", cursor: "pointer", marginBottom: 14,
              background: file ? C.accentBg : "transparent",
            }}>
              <Upload size={20} color={file ? C.accent : C.faint} />
              <span style={{ fontSize: 12.5, color: file ? C.accent : C.dim, fontWeight: file ? 600 : 400, textAlign: "center", wordBreak: "break-all" }}>
                {file ? file.name : "Choose a video — mp4, mov, avi, mkv, webm"}
              </span>
              <input id="seer-vid" type="file" accept=".mp4,.mov,.avi,.mkv,.webm,video/*"
                style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[["analyze", "Analyze once", "annotated video + report", BarChart3],
                ["live_loop", "Loop as live camera", "appears on the camera wall", Video]].map(([val, lbl, sub, Icon]) => (
                <button key={val} onClick={() => setMode(val)} style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                  padding: "11px 12px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                  border: mode === val ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: mode === val ? C.accentBg : "transparent",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: mode === val ? C.accent : C.text }}>
                    <Icon size={14} /> {lbl}
                  </span>
                  <span style={{ fontSize: 10.5, color: C.faint }}>{sub}</span>
                </button>
              ))}
            </div>

            {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}
            <button onClick={submit} style={{
              width: "100%", padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer",
              background: C.accent, color: "#06140E", fontSize: 13.5, fontWeight: 600,
            }}>{mode === "analyze" ? "Upload & analyze" : "Upload & go live"}</button>
          </>
        )}

        {phase === "working" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: C.dim }}>Processing {file?.name}</span>
              <span style={{ fontWeight: 600, color: C.accent }}>{Math.round(prog.pct)}%</span>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 5, marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${prog.pct}%`, background: C.accent, borderRadius: 5, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 11, color: C.faint }}>
              frame {fmtNum(prog.frames)}{prog.total ? ` / ${fmtNum(prog.total)}` : ""} · {prog.fps} fps · tracking, zones & trails baked in
            </div>
          </>
        )}

        {phase === "done" && summary && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
              {[["entries", summary.entries], ["exits", summary.exits],
                ["unique", summary.unique_tracks], ["peak", summary.peak_concurrent]].map(([l, v]) => (
                <div key={l} style={{ background: C.panelAlt, borderRadius: 9, padding: "9px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{v}</div>
                  <div style={{ fontSize: 10, color: C.faint }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              {summary.zones.map((z) => (
                <div key={z.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.dim }}>{z.name}</span>
                  <span>{z.visits} visits · {fmtDwell(Math.round(z.avgDwellSec))} avg dwell</span>
                </div>
              ))}
              {summary.review_flags?.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.amber, marginTop: 9 }}>
                  <Flag size={12} /> {summary.review_flags.length} exit-without-checkout flag(s) for human review
                </div>
              )}
            </div>
            <a href={dlUrl} download style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "10px 0", borderRadius: 9, background: C.accent, color: "#06140E",
              fontSize: 13.5, fontWeight: 600, textDecoration: "none",
            }}><Download size={15} /> Download annotated video</a>
          </>
        )}

        {phase === "done" && !summary && (
          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            <Video size={26} color={C.accent} />
            <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 4px" }}>Footage is live</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 14 }}>It now loops on the camera wall like a live feed.</div>
            <button onClick={onClose} style={{
              padding: "9px 22px", borderRadius: 9, border: "none", cursor: "pointer",
              background: C.accent, color: "#06140E", fontSize: 13, fontWeight: 600,
            }}>View camera wall</button>
          </div>
        )}

        {phase === "error" && (
          <>
            <div style={{ fontSize: 12.5, color: C.red, marginBottom: 14 }}>{error}</div>
            <button onClick={() => { setPhase("form"); setError(""); }} style={{
              width: "100%", padding: "9px 0", borderRadius: 9, border: `1px solid ${C.border}`,
              background: "transparent", color: C.text, fontSize: 13, cursor: "pointer",
            }}>Try again</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- analytics view ----------------------------- */

function BreakdownBars({ items, total }) {
  return items.map(([label, count, color]) => (
    <div key={label} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: C.dim, textTransform: "capitalize" }}>{label}</span>
        <span style={{ fontWeight: 500 }}>{count}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
        <div style={{ height: "100%", width: `${total ? (count / total) * 100 : 0}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  ));
}

function AnalyticsView({ data, inv, onRemoveCamera }) {
  if (!data) return null;
  const alerts = data.alerts ?? [];
  const byType = {};
  alerts.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
  const typeColor = { intrusion: C.red, review: C.amber, stockout: C.red, queue: C.amber, dwell: C.blue, planogram: C.accent, crowd: C.amber };
  const typeItems = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, n, typeColor[t] ?? C.blue]);

  const hourly = data.hourly ?? [];
  const peak = hourly.reduce((m, h) => (h.entries > (m?.entries ?? -1) ? h : m), null);
  const maxDwell = Math.max(...(data.zones ?? []).map((z) => z.dwellSec), 1);

  return (
    <>
      {/* headline numbers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 14 }}>
        <Kpi label="Peak hour" value={peak ? `${peak.hour}:00` : "—"} delta={peak?.entries ?? 0} />
        <Kpi label="Alerts today" value={alerts.length} delta={typeItems[0]?.[1] ?? 0} deltaGood={false} />
        <Kpi label="Cells need restock" value={inv.filter((t) => t.status !== "ok").length} delta={inv.filter((t) => t.status === "stockout").length} deltaGood={false} />
        <Kpi label="Cameras online" value={`${data.cameras.filter((c) => c.status === "online").length}/${data.cameras.length}`} delta={0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* zone detail table */}
        <Panel title="Zone performance" sub="full detail per tracked zone">
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 0.9fr 0.8fr", gap: 8, fontSize: 10.5, color: C.faint, paddingBottom: 7, borderBottom: `1px solid ${C.border}` }}>
            <span>zone</span><span>footfall</span><span>avg dwell</span><span>conv.</span><span>heat</span>
          </div>
          {data.zones.map((z, i, arr) => (
            <div key={z.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 0.9fr 0.8fr", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{z.name}</span>
              <span style={{ fontSize: 12.5 }}>{fmtNum(z.footfall)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${(z.dwellSec / maxDwell) * 100}%`, background: C.blue, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: C.dim, flexShrink: 0 }}>{fmtDwell(z.dwellSec)}</span>
              </div>
              <span style={{ fontSize: 12.5 }}>{z.conversionPct}%</span>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: heatColor(z.intensity) }} title={`intensity ${z.intensity}`} />
            </div>
          ))}
        </Panel>

        {/* alert breakdown */}
        <Panel title="Alerts by type" sub={`${alerts.length} in the current window`}>
          {typeItems.length ? <BreakdownBars items={typeItems} total={alerts.length} /> :
            <div style={{ fontSize: 12.5, color: C.faint }}>No alerts yet — they'll appear here as pipelines run.</div>}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14 }}>
        {/* camera health + remove */}
        <Panel title="Camera health" sub="runtime status per pipeline">
          {data.cameras.map((cam, i, arr) => (
            <div key={cam.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <Circle size={8} fill={cam.status === "online" ? C.accent : C.faint} color={cam.status === "online" ? C.accent : C.faint} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{cam.name}</div>
                <div style={{ fontSize: 11, color: C.faint }}>
                  {cam.status === "online" ? `${cam.fps} fps · ${cam.detectionCount} detections` : "offline"}
                </div>
              </div>
              <button onClick={() => onRemoveCamera(cam)} aria-label={`Remove ${cam.name}`}
                style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.faint)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Panel>

        {/* hourly conversion detail */}
        <Panel title="Hourly conversion" sub="transactions ÷ entries per hour">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130 }}>
            {hourly.map((h) => {
              const rate = h.entries ? h.transactions / h.entries : 0;
              const pct = Math.min(rate / 0.4, 1); // 40% conv = full bar
              return (
                <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 9, color: C.faint }}>{h.entries ? Math.round(rate * 100) + "%" : ""}</span>
                  <div style={{ width: "100%", height: 100, background: "rgba(255,255,255,0.04)", borderRadius: 4, display: "flex", alignItems: "flex-end" }}>
                    <div style={{ width: "100%", height: `${pct * 100}%`, background: rate >= 0.25 ? C.accent : rate >= 0.15 ? C.amber : C.red, borderRadius: 4, opacity: 0.85 }} />
                  </div>
                  <span style={{ fontSize: 9.5, color: C.faint }}>{h.hour}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ---------------------------- planogram view ----------------------------- */

const CELL_STATUS = {
  ok:        { c: C.accent, bg: "rgba(61,220,151,0.13)",  label: "compliant" },
  low:       { c: C.amber,  bg: "rgba(240,169,59,0.13)",  label: "low facings" },
  gap:       { c: C.red,    bg: "rgba(255,92,92,0.15)",   label: "empty — gap" },
  misplaced: { c: "#C77DFF", bg: "rgba(199,125,255,0.14)", label: "misplaced item" },
};

function cellStatus(res) {
  if (!res) return "ok";
  if (res.misplaced_facings > 0) return "misplaced";
  if (res.detected_facings === 0) return "gap";
  if (res.detected_facings < res.expected_min_facings) return "low";
  return "ok";
}

/* shelf grid positioned from real cell bboxes, normalized to frame_size */
function ShelfGrid({ shelf, mode, selected, onSelect }) {
  const [fw, fh] = shelf.frame_size;
  const results = Object.fromEntries((shelf.latest?.cells ?? []).map((c) => [c.cell_id, c]));
  // crop view to the bounding extent of cells, with padding
  const xs = shelf.cells.flatMap((c) => [c.bbox[0], c.bbox[2]]);
  const ys = shelf.cells.flatMap((c) => [c.bbox[1], c.bbox[3]]);
  const pad = 16;
  const x0 = Math.max(Math.min(...xs) - pad, 0), x1 = Math.min(Math.max(...xs) + pad, fw);
  const y0 = Math.max(Math.min(...ys) - pad, 0), y1 = Math.min(Math.max(...ys) + pad, fh);
  const vw = x1 - x0, vh = y1 - y0;

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${vw}/${vh}`, background: "#0A0D13", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {shelf.cells.map((cell) => {
        const res = results[cell.id];
        const st = mode === "expected" ? CELL_STATUS.ok : CELL_STATUS[cellStatus(res)];
        const isSel = selected === cell.id;
        const [bx1, by1, bx2, by2] = cell.bbox;
        return (
          <button key={cell.id} onClick={() => onSelect(cell.id)}
            aria-label={`${cell.expected_class} cell ${cell.id}`}
            style={{
              position: "absolute",
              left: `${((bx1 - x0) / vw) * 100}%`, top: `${((by1 - y0) / vh) * 100}%`,
              width: `${((bx2 - bx1) / vw) * 100}%`, height: `${((by2 - by1) / vh) * 100}%`,
              background: mode === "expected" ? "rgba(91,155,255,0.10)" : st.bg,
              border: isSel ? `2px solid ${C.text}` : `1.5px solid ${mode === "expected" ? "rgba(91,155,255,0.5)" : st.c}`,
              borderRadius: 6, cursor: "pointer", padding: "4px 6px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              alignItems: "flex-start", textAlign: "left", overflow: "hidden",
            }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.text, lineHeight: 1.2, wordBreak: "break-all" }}>
              {cell.expected_class}
            </span>
            <span style={{ fontSize: 9.5, color: mode === "expected" ? C.blue : st.c, fontWeight: 600 }}>
              {mode === "expected"
                ? `min ${cell.min_facings}`
                : res
                  ? `${res.detected_facings}/${cell.min_facings}${res.misplaced_facings ? ` · ${res.misplaced_facings} wrong` : ""}`
                  : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlanogramView({ shelves }) {
  const [shelfId, setShelfId] = useState(null);
  const [selCell, setSelCell] = useState(null);
  const shelf = shelves.find((s) => s.shelf_id === shelfId) ?? shelves[0];
  if (!shelf) return <Panel title="Planogram"><div style={{ fontSize: 12.5, color: C.faint }}>No shelf cameras yet — add one with role "Shelf & inventory".</div></Panel>;

  const latest = shelf.latest;
  const res = latest?.cells?.find((c) => c.cell_id === selCell);
  const cellCfg = shelf.cells.find((c) => c.id === selCell);
  const counts = { ok: 0, low: 0, gap: 0, misplaced: 0 };
  (latest?.cells ?? []).forEach((c) => { counts[cellStatus(c)] += 1; });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 3, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
          {shelves.map((s) => (
            <button key={s.shelf_id} onClick={() => { setShelfId(s.shelf_id); setSelCell(null); }} style={{
              border: "none", cursor: "pointer", fontSize: 12, padding: "5px 11px", borderRadius: 7,
              background: shelf.shelf_id === s.shelf_id ? C.accentBg : "transparent",
              color: shelf.shelf_id === s.shelf_id ? C.accent : C.dim,
              fontWeight: shelf.shelf_id === s.shelf_id ? 600 : 400,
            }}>shelf {s.shelf_id}</button>
          ))}
        </div>
        {latest && (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: latest.compliance_pct >= 90 ? C.accent : latest.compliance_pct >= 70 ? C.amber : C.red }}>
              {latest.compliance_pct}%
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>compliance<br />last check {new Date(latest.checked_at).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* planogram vs realogram */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel title="Planogram" sub="expected layout · merchandising plan">
          <ShelfGrid shelf={shelf} mode="expected" selected={selCell} onSelect={setSelCell} />
        </Panel>
        <Panel title="Realogram" sub="detected live · YOLO26 shelf camera">
          <ShelfGrid shelf={shelf} mode="detected" selected={selCell} onSelect={setSelCell} />
          <div style={{ display: "flex", gap: 13, marginTop: 11, flexWrap: "wrap" }}>
            {Object.entries(CELL_STATUS).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.dim }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: v.c }} /> {v.label} ({counts[k]})
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        {/* selected cell drill-down */}
        <Panel title={selCell ? `Cell ${selCell}` : "Cell detail"} sub={selCell ? cellCfg?.expected_class : "tap a cell in either grid"}>
          {res ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["status", CELL_STATUS[cellStatus(res)].label, CELL_STATUS[cellStatus(res)].c],
                ["facings", `${res.detected_facings} / min ${res.expected_min_facings}`, C.text],
                ["misplaced", res.misplaced_facings, res.misplaced_facings ? "#C77DFF" : C.text],
                ["compliant", res.compliant ? "yes" : "no", res.compliant ? C.accent : C.red],
              ].map(([l, v, col]) => (
                <div key={l}>
                  <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: col, textTransform: "capitalize" }}>{v}</div>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12.5, color: C.faint }}>Select a cell to inspect facings, status, and misplacements.</div>}
        </Panel>

        {/* misplacement / action list */}
        <Panel title="Restock & fix list" sub="generated from the latest shelf check"
          right={latest && <span style={{ fontSize: 11, color: C.faint }}>{(latest.gaps?.length ?? 0) + (latest.misplacements?.length ?? 0)} actions</span>}>
          {latest && (latest.gaps?.length || latest.misplacements?.length) ? (
            <div>
              {latest.gaps?.map((g) => (
                <div key={`g-${g}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: SEV_COLOR.danger.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <PackageX size={14} color={C.red} />
                  </div>
                  <div style={{ fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500 }}>Restock {shelf.cells.find((c) => c.id === g)?.expected_class}</span>
                    <span style={{ color: C.faint }}> — cell {g} is empty</span>
                  </div>
                </div>
              ))}
              {latest.misplacements?.map((m, i) => (
                <div key={`m-${i}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: i === latest.misplacements.length - 1 ? "none" : `1px solid ${C.border}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: CELL_STATUS.misplaced.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Boxes size={14} color={CELL_STATUS.misplaced.c} />
                  </div>
                  <div style={{ fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500 }}>Move {m.found_class}</span>
                    <span style={{ color: C.faint }}> out of cell {m.cell_id} (expects {m.expected_class})</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12.5, color: C.faint }}>Shelf fully compliant — nothing to fix.</div>}
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------- main app -------------------------------- */

export default function SeerDashboard() {
  const [siteId, setSiteId] = useState("all");
  const [view, setView] = useState("safety");          // "overview" | "analytics" | "planogram" | "safety"
  const [data, setData] = useState(null);
  const [inv, setInv] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [zone, setZone] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [localCams, setLocalCams] = useState([]);        // mock-mode additions
  const [removedIds, setRemovedIds] = useState([]);      // mock-mode removals
  const [safety, setSafety] = useState(null);            // safety & traffic payload
  const timer = useRef(null);

  const load = useCallback(async (id) => {
    const [d, i, pg, sf] = await Promise.all([
      fetchDashboard(id), fetchInventory(), fetchPlanogram(), fetchSafety(API_BASE, id),
    ]);
    setData(d); setInv(i); setShelves(pg); setSafety(sf); setPulse((p) => !p);
  }, []);

  useEffect(() => { setZone(null); load(siteId); }, [siteId, load]);
  useEffect(() => {
    timer.current = setInterval(() => load(siteId), POLL_MS);
    return () => clearInterval(timer.current);
  }, [siteId, load]);

  const handleAdded = (cam) => {
    if (cam._local) setLocalCams((p) => [...p, cam]);
    else load(siteId);
  };

  const handleRemove = async (cam) => {
    if (!window.confirm(`Remove "${cam.name}"? Its pipeline will stop.`)) return;
    if (cam._local) { setLocalCams((p) => p.filter((c) => c.id !== cam.id)); return; }
    const ok = await apiRemoveCamera(cam.id);
    if (!API_BASE) setRemovedIds((p) => [...p, cam.id]);
    if (ok) load(siteId);
  };

  // merge backend cameras with mock-mode local edits
  const cameras = [
    ...(data?.cameras ?? []).filter((c) => !removedIds.includes(c.id)),
    ...localCams,
  ];
  const mergedData = data ? { ...data, cameras } : null;

  const k = data?.kpis;
  const lp = data?.alerts?.filter((a) => a.type === "intrusion" || a.type === "review") ?? [];

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100%", padding: "18px 20px", fontFamily: "'Inter', system-ui, sans-serif", boxSizing: "border-box" }}>

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Eye size={18} color={C.accent} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1 }}>Vision Analytics</div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>retail intelligence platform</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 3, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
            {[["overview", "Overview", LayoutGrid], ["analytics", "Analytics", BarChart3], ["planogram", "Planogram", Boxes], ["safety", "Safety & Traffic", ShieldAlert]].map(([id, lbl, Icon]) => (
              <button key={id} onClick={() => setView(id)} style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
                fontSize: 12, padding: "5px 11px", borderRadius: 7,
                background: view === id ? C.accentBg : "transparent",
                color: view === id ? C.accent : C.dim, fontWeight: view === id ? 600 : 400,
              }}><Icon size={13} />{lbl}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
            {SITES.map((s) => (
              <button key={s.id} onClick={() => setSiteId(s.id)} style={{
                border: "none", cursor: "pointer", fontSize: 12, padding: "5px 10px", borderRadius: 7,
                background: siteId === s.id ? C.accentBg : "transparent",
                color: siteId === s.id ? C.accent : C.dim,
                fontWeight: siteId === s.id ? 600 : 400,
              }}>{s.name}</button>
            ))}
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.dim }}>
            <Circle size={8} fill={C.accent} color={C.accent} style={{ opacity: pulse ? 1 : 0.4, transition: "opacity .4s" }} /> live
          </span>
        </div>
      </div>

      {view === "planogram" ? (
        <PlanogramView shelves={shelves} />
      ) : view === "analytics" ? (
        <AnalyticsView data={mergedData} inv={inv} onRemoveCamera={handleRemove} />
      ) : view === "safety" ? (
        <SafetyTrafficView
          C={C} SEV_COLOR={SEV_COLOR} Panel={Panel} Kpi={Kpi}
          CameraWall={CameraWall} data={safety} cameras={cameras}
          fmtNum={fmtNum} fmtDwell={fmtDwell}
        />
      ) : (
      <>
      {/* HERO: cameras + side column */}
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel title="Camera wall" sub="annotated feeds · YOLO26 + ByteTrack burned-in"
          right={
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, color: C.faint, display: "flex", alignItems: "center", gap: 5 }}>
                <Video size={13} /> {cameras.filter((c) => c.status === "online").length}/{cameras.length} online
              </span>
              <button onClick={() => setShowUpload(true)} style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                background: "transparent", color: C.dim, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: "5px 10px", cursor: "pointer",
              }}><Upload size={13} /> Upload footage</button>
              <button onClick={() => setShowAdd(true)} style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                background: C.accentBg, color: C.accent, border: "none", borderRadius: 7,
                padding: "5px 10px", cursor: "pointer",
              }}><Plus size={13} /> Add camera</button>
            </span>
          }>
          {mergedData && <CameraWall cameras={cameras} />}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Kpi label="Footfall" value={k ? fmtNum(k.footfall.value) : "—"} delta={k?.footfall.deltaPct ?? 0} />
            <Kpi label="Avg dwell" value={k ? fmtDwell(k.avgDwellSec.value) : "—"} delta={k?.avgDwellSec.deltaSec ?? 0} />
            <Kpi label="Conversion" value={k ? `${k.conversionPct.value}%` : "—"} delta={k?.conversionPct.deltaPct ?? 0} deltaGood={(k?.conversionPct.deltaPct ?? 0) >= 0} />
            <Kpi label="Compliance" value={k ? `${k.compliancePct.value}%` : "—"} delta={k?.compliancePct.deltaPct ?? 0} />
          </div>

          <Panel title="Live alerts" style={{ flex: 1 }}
            right={lp.length > 0 && (
              <span style={{ fontSize: 11, color: C.red, display: "flex", alignItems: "center", gap: 4 }}>
                <ShieldAlert size={12} /> {lp.length} security
              </span>
            )}>
            <div>
              {data?.alerts?.slice(0, 5).map((a, i, arr) => {
                const Icon = TYPE_ICON[a.type] ?? AlertTriangle;
                const sev = SEV_COLOR[a.severity];
                return (
                  <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
                    <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, background: sev.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={14} color={sev.c} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: C.faint }}>{a.detail}</div>
                    </div>
                    <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{ago(a.agoSec)}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {/* row 2: traffic + funnel */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel title="Footfall by hour" sub="entries (bars) vs transactions (line, via POS)">
          {data && <HourlyChart data={data.hourly} />}
        </Panel>
        <Panel title="Conversion funnel" sub="entry to checkout, today">
          {data && <Funnel data={data.funnel} />}
        </Panel>
      </div>

      {/* row 3: zones + inventory */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 14 }}>
        <Panel title="Zone heatmap" sub={zone ? `selected: ${zone.name}` : "dwell density · tap a zone"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
            {data?.zones?.map((z) => (
              <button key={z.id} onClick={() => setZone(z)} aria-label={`Zone ${z.name}`} style={{
                aspectRatio: "1.4", borderRadius: 8, cursor: "pointer", padding: 7,
                border: zone?.id === z.id ? `1.5px solid ${C.text}` : `1px solid ${C.border}`,
                background: heatColor(z.intensity), display: "flex", alignItems: "flex-end", textAlign: "left",
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#0B0E13" }}>{z.name}</span>
              </button>
            ))}
          </div>
          {zone && (
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[["dwell", fmtDwell(zone.dwellSec)], ["footfall", fmtNum(zone.footfall)], ["conv.", `${zone.conversionPct}%`]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Inventory" sub="stock per shelf cell · velocity-based restock ETA"
          right={<span style={{ fontSize: 11, color: C.faint }}>{inv.filter((t) => t.status !== "ok").length} need attention</span>}>
          <div>
            {/* header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1fr 0.9fr 0.9fr", gap: 8, fontSize: 10.5, color: C.faint, padding: "0 0 7px", borderBottom: `1px solid ${C.border}` }}>
              <span>SKU · cell</span><span>facings</span><span>level</span><span>rate/hr</span><span>empty in</span>
            </div>
            {inv.map((t, i) => {
              const st = INV_STATUS[t.status];
              const fill = Math.min(t.facings / Math.max(t.min_facings * 2, 1), 1);
              return (
                <div key={`${t.shelf_id}-${t.cell_id}`} style={{
                  display: "grid", gridTemplateColumns: "1.6fr 0.8fr 1fr 0.9fr 0.9fr", gap: 8,
                  alignItems: "center", padding: "9px 0",
                  borderBottom: i === inv.length - 1 ? "none" : `1px solid ${C.border}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.expected_class}</div>
                    <div style={{ fontSize: 10.5, color: C.faint }}>{t.shelf_id} · {t.cell_id}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: st.c }}>
                    {t.facings}<span style={{ color: C.faint, fontWeight: 400, fontSize: 11 }}>/{t.min_facings}</span>
                  </span>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${fill * 100}%`, background: st.c, borderRadius: 4, transition: "width .4s" }} />
                  </div>
                  <span style={{ fontSize: 12, color: t.rate_per_hour < 0 ? C.amber : C.dim, display: "flex", alignItems: "center", gap: 3 }}>
                    {t.rate_per_hour < 0 && <TrendingDown size={12} />}{t.rate_per_hour}
                  </span>
                  <span style={{ fontSize: 12, color: t.status === "stockout" ? C.red : t.eta_stockout_min != null && t.eta_stockout_min < 120 ? C.amber : C.dim }}>
                    {t.status === "stockout" ? "now" : fmtEta(t.eta_stockout_min)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      </>
      )}

      {showAdd && <AddCameraModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />}
      {showUpload && (
        <UploadVideoModal
          onClose={() => setShowUpload(false)}
          onCameraAdded={(cam) => { if (cam) handleAdded(cam); else load(siteId); }}
        />
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: C.faint, display: "flex", alignItems: "center", gap: 6 }}>
        <Activity size={12} /> YOLO26 + ByteTrack · privacy-first (anonymous track IDs only) · last sync {data ? new Date(data.updatedAt).toLocaleTimeString() : "—"}
        {!API_BASE && <span style={{ color: C.amber, marginLeft: 8 }}>· mock data — set API_BASE to go live</span>}
      </div>
    </div>
  );
}
