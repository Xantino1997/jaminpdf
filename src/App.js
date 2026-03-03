// ─────────────────────────────────────────────────────────────────────────────
//  S-13-S · Registro de Asignación de Territorio
//  pdf-lib (npm) para escritura · pdfjs-dist (CDN) para lectura
//  Diseño mejorado: responsive móvil, espaciado, texto PDF más grande y centrado
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const PDF_H = 842.04;

const CX = {
  num: 54.4, ultima: 102.7,
  g1n: 162.5, g1a: 162.5, g1c: 215.0,
  g2n: 268.9, g2a: 268.9, g2c: 321.8,
  g3n: 375.7, g3a: 375.7, g3c: 428.5,
  g4n: 482.4, g4a: 482.4, g4c: 535.0,
};

const COL_RANGES = [
  { key: "num",    x0: 37,  x1: 72  },
  { key: "ultima", x0: 72,  x1: 136 },
  { key: "g1",     x0: 136, x1: 188 },
  { key: "g1c",    x0: 188, x1: 242 },
  { key: "g2",     x0: 242, x1: 295 },
  { key: "g2c",    x0: 295, x1: 349 },
  { key: "g3",     x0: 349, x1: 402 },
  { key: "g3c",    x0: 402, x1: 455 },
  { key: "g4",     x0: 455, x1: 509 },
  { key: "g4c",    x0: 509, x1: 562 },
];

const LINE_TOPS = [
  161, 176,  192, 208,  224, 239,  255, 270,  286, 301,
  318, 333,  349, 364,  380, 395,  412, 427,  443, 458,
  474, 489,  506, 521,  537, 552,  568, 583,  599, 615,
  631, 646,  662, 677,  693, 708,  725, 740,  756, 771,
];

const DEFAULT_ROWS = 20;
const STORAGE_KEY  = "s13s_v6";
const FS    = 8.0;   // tamaño de fuente en el PDF (era 6.5)
const MAX_W = 52;

const emptyRow = () => ({
  num: "", ultima: "",
  n1: "", a1: "", c1: "",
  n2: "", a2: "", c2: "",
  n3: "", a3: "", c3: "",
  n4: "", a4: "", c4: "",
});

const fmtDate = (v) => {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${(y || "").slice(2)}`;
};

const parseDate = (s) => {
  if (!s) return "";
  const parts = s.trim().replace(/[.-]/g, "/").split("/");
  if (parts.length !== 3) return "";
  let [d, m, y] = parts;
  if (y.length === 2) y = "20" + y;
  d = d.padStart(2, "0"); m = m.padStart(2, "0");
  if (y.length !== 4 || isNaN(+y) || isNaN(+m) || isNaN(+d)) return "";
  return `${y}-${m}-${d}`;
};

const loadPdfjsLib = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
  const script = document.createElement("script");
  script.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
  script.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    resolve(window.pdfjsLib);
  };
  script.onerror = () => reject(new Error("No se pudo cargar pdfjs-dist"));
  document.head.appendChild(script);
});

const extractPDFData = async (arrayBuffer) => {
  try {
    const lib = await loadPdfjsLib();
    const pdf = await lib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const pageH = vp.height;
    const content = await page.getTextContent();

    const items = content.items
      .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: pageH - it.transform[5] }))
      .filter((it) => it.text.length > 0);

    let yearVal = "";
    const yItem = items.find((it) => it.y > 80 && it.y < 100 && it.x > 100 && it.x < 220);
    if (yItem) yearVal = yItem.text;

    const rows = Array.from({ length: DEFAULT_ROWS }, emptyRow);
    LINE_TOPS.forEach((top, li) => {
      const ri = Math.floor(li / 2);
      const isNameLine = li % 2 === 0;
      items.filter((it) => it.y >= top - 1 && it.y < top + 15).forEach((it) => {
        const col = COL_RANGES.find((c) => it.x >= c.x0 && it.x < c.x1);
        if (!col) return;
        if (isNameLine) {
          if (col.key === "num")    rows[ri].num    = it.text;
          if (col.key === "ultima") rows[ri].ultima = it.text;
          if (col.key === "g1")     rows[ri].n1     = it.text;
          if (col.key === "g2")     rows[ri].n2     = it.text;
          if (col.key === "g3")     rows[ri].n3     = it.text;
          if (col.key === "g4")     rows[ri].n4     = it.text;
        } else {
          if (col.key === "g1")  rows[ri].a1 = parseDate(it.text);
          if (col.key === "g1c") rows[ri].c1 = parseDate(it.text);
          if (col.key === "g2")  rows[ri].a2 = parseDate(it.text);
          if (col.key === "g2c") rows[ri].c2 = parseDate(it.text);
          if (col.key === "g3")  rows[ri].a3 = parseDate(it.text);
          if (col.key === "g3c") rows[ri].c3 = parseDate(it.text);
          if (col.key === "g4")  rows[ri].a4 = parseDate(it.text);
          if (col.key === "g4c") rows[ri].c4 = parseDate(it.text);
        }
      });
    });
    return { rows, year: yearVal };
  } catch (e) {
    console.error("extractPDFData:", e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,       setRows]       = useState([]);
  const [year,       setYear]       = useState("");
  const [pdfBytes,   setPdfBytes]   = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pdfName,    setPdfName]    = useState("territorios.pdf");
  const [status,     setStatus]     = useState("loading");
  const [extracting, setExtracting] = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [toast,      setToast]      = useState(null);
  const blobRef = useRef(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const persist = (r, y) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: r, year: y })); } catch {}
  };

  const activatePDF = useCallback(async (buf, name, readData) => {
    const uint8 = new Uint8Array(buf);
    setPdfBytes(uint8); setPdfName(name);
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const blob = new Blob([uint8], { type: "application/pdf" });
    blobRef.current = URL.createObjectURL(blob);
    setPreviewUrl(blobRef.current);
    setStatus("ready");
    if (!readData) return;
    setExtracting(true);
    showToast("Leyendo datos del PDF…", "info");
    const result = await extractPDFData(buf);
    setExtracting(false);
    if (!result) { showToast("PDF cargado — no se pudieron leer datos", "warn"); return; }
    const hasData = result.rows.some((r) => r.num || r.n1 || r.n2 || r.n3 || r.n4 || r.a1 || r.a2);
    if (hasData || result.year) {
      setRows(result.rows); setYear(result.year || "");
      persist(result.rows, result.year || "");
      showToast("✅ Datos cargados del PDF");
    } else {
      showToast("PDF cargado — sin datos previos detectados");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setRows(d.rows || Array.from({ length: DEFAULT_ROWS }, emptyRow));
        setYear(d.year || "");
      } else { setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow)); }
    } catch { setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow)); }
    fetch("/assets/territorios.pdf")
      .then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then((buf) => activatePDF(buf, "territorios.pdf", false))
      .catch(() => setStatus("error"));
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, [activatePDF]);

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    await activatePDF(await file.arrayBuffer(), file.name, true);
  };

  const setField  = (idx, field, val) => {
    setRows((prev) => { const next = prev.map((r, i) => i === idx ? { ...r, [field]: val } : r); persist(next, year); return next; });
  };
  const setYearVal = (v) => { setYear(v); persist(rows, v); };
  const addRow    = () => setRows((p) => { const n = [...p, emptyRow()]; persist(n, year); return n; });
  const delRow    = (idx) => {
    if (rows.length <= 1) return;
    setRows((p) => { const n = p.filter((_, i) => i !== idx); persist(n, year); return n; });
  };
  const clearAll  = () => {
    if (!window.confirm("¿Limpiar todos los datos?")) return;
    const fresh = Array.from({ length: DEFAULT_ROWS }, emptyRow);
    setRows(fresh); setYear(""); persist(fresh, ""); showToast("Formulario limpiado");
  };

  const downloadPDF = async () => {
    if (!pdfBytes) { showToast("No hay PDF cargado", "err"); return; }
    setBusy(true);
    try {
      const doc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const page  = doc.getPages()[0];
      const font  = await doc.embedFont(StandardFonts.Helvetica);
      const black = rgb(0, 0, 0);

      // Escribir texto centrado y bien posicionado verticalmente en cada celda
      const write = (text, cx, topPP, lineH) => {
        if (!text || !String(text).trim()) return;
        let t = String(text).trim();
        while (font.widthOfTextAtSize(t, FS) > MAX_W && t.length > 1) t = t.slice(0, -1);
        const tw = font.widthOfTextAtSize(t, FS);
        // Centro de la celda + ajuste para quedar en la línea correcta
        const y = PDF_H - topPP - (lineH / 2) + (FS / 2) - 1;
        page.drawText(t, { x: cx - tw / 2, y, size: FS, font, color: black });
      };

      if (year) {
        const yw = font.widthOfTextAtSize(year, 9);
        page.drawText(year, { x: 148 - yw / 2, y: PDF_H - 91, size: 9, font, color: black });
      }

      const LH = 14;
      rows.slice(0, 20).forEach((row, i) => {
        const tA = LINE_TOPS[i * 2];
        const tB = LINE_TOPS[i * 2 + 1];
        const mid = (tB - tA) + LH;

        write(row.num,    CX.num,    tA, mid);
        write(row.ultima, CX.ultima, tA, mid);
        write(row.n1, CX.g1n, tA, LH);
        write(row.n2, CX.g2n, tA, LH);
        write(row.n3, CX.g3n, tA, LH);
        write(row.n4, CX.g4n, tA, LH);

        write(fmtDate(row.a1), CX.g1a, tB, LH);
        write(fmtDate(row.c1), CX.g1c, tB, LH);
        write(fmtDate(row.a2), CX.g2a, tB, LH);
        write(fmtDate(row.c2), CX.g2c, tB, LH);
        write(fmtDate(row.a3), CX.g3a, tB, LH);
        write(fmtDate(row.c3), CX.g3c, tB, LH);
        write(fmtDate(row.a4), CX.g4a, tB, LH);
        write(fmtDate(row.c4), CX.g4c, tB, LH);
      });

      const out  = await doc.save();
      const blob = new Blob([out], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `territorios_${year || "editado"}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      showToast("¡PDF descargado!");
    } catch (e) {
      console.error(e); showToast("Error: " + e.message, "err");
    } finally { setBusy(false); }
  };

  const filledCount = rows.filter((r) => r.num || r.n1 || r.n2 || r.n3 || r.n4).length;
  const canDownload = status === "ready" && !busy && !extracting;

  const GCOLS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];
  const GBORDERS = ["#bfdbfe", "#a7f3d0", "#fde68a", "#ddd6fe"];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy:   #0f172a;
          --navy2:  #1e293b;
          --navy3:  #334155;
          --blue:   #3b82f6;
          --bg:     #f1f5f9;
          --card:   #ffffff;
          --border: #e2e8f0;
          --muted:  #64748b;
          --r:      12px;
          --sh:     0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.04);
        }

        body { font-family: 'IBM Plex Sans', system-ui, sans-serif; background: var(--bg); color: var(--navy); -webkit-font-smoothing: antialiased; }

        /* ─ Topbar ─ */
        .topbar {
          background: var(--navy); color: #f8fafc;
          padding: 13px 20px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 200;
          box-shadow: 0 2px 16px rgba(0,0,0,0.45);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .tb-title { font-weight: 700; font-size: 15px; letter-spacing: .02em; }
        .tb-sub   { font-size: 11px; color: #94a3b8; margin-top: 3px; }
        .tb-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

        /* ─ Botones ─ */
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          border: none; border-radius: 8px; cursor: pointer;
          font-family: inherit; font-weight: 600; font-size: 13px;
          padding: 9px 16px; transition: filter .15s, transform .1s; white-space: nowrap; color: #fff;
        }
        .btn:active:not(:disabled) { transform: scale(.97); }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn:hover:not(:disabled) { filter: brightness(1.12); }
        .btn-teal   { background: #0f766e; }
        .btn-purple { background: #7c3aed; }
        .btn-red    { background: #991b1b; }
        .btn-gray   { background: #475569; }
        .btn-sm     { padding: 6px 12px; font-size: 12px; border-radius: 6px; }
        .btn-big {
          width: 100%; justify-content: center;
          padding: 15px 20px; font-size: 15px;
          border-radius: var(--r); margin-top: 16px;
          background: linear-gradient(135deg, #7c3aed, #5b21b6);
          box-shadow: 0 4px 16px rgba(124,58,237,.35);
        }
        .btn-big:hover:not(:disabled) { box-shadow: 0 6px 22px rgba(124,58,237,.5); filter: brightness(1.08); }

        /* ─ Banners ─ */
        .banner { padding: 12px 20px; font-size: 13px; border-bottom: 2px solid; }
        .banner-error { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
        .banner-info  { background: #f0fdf4; border-color: #86efac; color: #166534; }

        /* ─ Layout ─ */
        .wrap { max-width: 1500px; margin: 0 auto; padding: 20px 16px 60px; }
        .grid { display: grid; grid-template-columns: 1fr 390px; gap: 22px; align-items: start; }
        @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .sidebar { display: none; } }

        /* ─ Card ─ */
        .card { background: var(--card); border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--sh); }
        .card-p { padding: 16px 20px; }

        /* ─ Header ─ */
        .hdr { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .hdr-title { font-size: 17px; font-weight: 700; letter-spacing: .01em; }
        .yr-wrap { display: flex; align-items: center; gap: 10px; margin-left: auto; }
        .yr-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; }
        .yr-input {
          border: none; border-bottom: 2.5px solid var(--blue); background: transparent;
          font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 700;
          color: var(--navy); width: 100px; text-align: center; outline: none; padding: 4px 6px;
        }

        /* ─ Info box ─ */
        .info-box {
          background: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid var(--blue);
          border-radius: 8px; padding: 11px 16px; margin-bottom: 14px;
          font-size: 13px; color: #1e40af; line-height: 1.7;
        }

        /* ─ Tabla ─ */
        .tbl-wrap { overflow: hidden; }
        .tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { border-collapse: collapse; width: 100%; min-width: 1080px; }

        .th-main {
          background: var(--navy); color: #e2e8f0;
          font-size: 10px; font-weight: 700; letter-spacing: .05em;
          text-transform: uppercase; padding: 12px 6px;
          text-align: center; border: 1px solid rgba(255,255,255,.07); white-space: nowrap;
        }
        .th-g { border-left: 2px solid #2d3f5e !important; }
        .th-sub-row { background: #182d4a; }
        .th-sub-cell {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
        }
        .th-sub-item {
          background: #182d4a; color: rgba(226,232,240,.75);
          font-size: 9px; font-weight: 600; padding: 7px 4px;
          text-align: center; letter-spacing: .04em; text-transform: uppercase;
          white-space: nowrap;
        }
        .th-sub-item:not(:last-child) { border-right: 1px solid rgba(255,255,255,.07); }

        /* Filas */
        tbody tr { border-bottom: 1px solid #e8edf3; transition: background .1s; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody tr:hover > * { background: #eff6ff !important; }

        /* Celdas */
        td { vertical-align: middle; }
        .td { padding: 2px 3px; border-right: 1px solid #e8edf3; }
        .td-g { padding: 0; border-right: 1px solid #e8edf3; border-left: 2.5px solid; }
        .g-inner { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        .g-cell { }
        .g-cell:not(:last-child) { border-right: 1px solid #e8edf3; }

        /* Inputs */
        .inp {
          width: 100%; border: none; background: transparent;
          text-align: center; padding: 9px 4px;
          font-family: 'IBM Plex Sans', inherit; outline: none;
          transition: background .1s, box-shadow .1s;
        }
        .inp:focus { background: #fff !important; box-shadow: inset 0 0 0 2px #bfdbfe; border-radius: 4px; }
        .inp-num  { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 14px; color: #2563eb; }
        .inp-last { font-size: 11px; color: var(--muted); }
        .inp-name { font-size: 12px; color: var(--navy); font-weight: 500; }
        .inp-date { font-size: 11px; color: #374151; }

        /* Botón eliminar */
        .btn-del {
          background: none; border: none; color: #cbd5e1;
          cursor: pointer; font-size: 15px; padding: 6px 7px;
          border-radius: 5px; transition: all .15s; display: block; width: 100%; text-align: center;
        }
        .btn-del:hover { color: #ef4444; background: #fef2f2; }

        /* Botón agregar */
        .btn-add {
          width: 100%; padding: 13px; background: #f8fafc; border: none;
          border-top: 2px dashed #e2e8f0; color: #94a3b8;
          font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
          letter-spacing: .08em; text-transform: uppercase;
          border-radius: 0 0 var(--r) var(--r); transition: all .15s;
        }
        .btn-add:hover { background: #eff6ff; color: var(--blue); border-top-color: #93c5fd; }

        /* Nota */
        .note { font-size: 11px; color: #94a3b8; margin-top: 10px; padding-left: 4px; line-height: 1.7; }

        /* ─ Sidebar ─ */
        .sidebar-sticky { position: sticky; top: 70px; }
        .prev-hdr {
          background: #f1f5f9; padding: 10px 16px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .prev-name { font-size: 12px; font-weight: 600; color: var(--navy3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }

        /* Resumen */
        .sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
        .sum-card { background: #f8fafc; border-radius: 8px; padding: 12px 14px; border-left: 3px solid; }
        .sum-num { font-size: 24px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; }
        .sum-lbl { font-size: 10px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .06em; }

        /* ─ Toast ─ */
        .toast {
          position: fixed; bottom: 24px; right: 20px; color: #fff;
          padding: 12px 22px; border-radius: 10px; font-size: 13px; font-weight: 600;
          box-shadow: 0 4px 20px rgba(0,0,0,.3); z-index: 9999;
          animation: slideup .2s ease;
        }
        @keyframes slideup { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        /* ─ Mobile ─ */
        @media (max-width: 640px) {
          .topbar { padding: 11px 12px; }
          .tb-title { font-size: 13px; }
          .tb-actions .btn { padding: 8px 11px; font-size: 12px; }
          .wrap { padding: 12px 10px 50px; }
          .hdr { flex-direction: column; align-items: flex-start; gap: 10px; }
          .yr-wrap { margin-left: 0; }
          .btn-big { font-size: 14px; padding: 13px; }
        }
        @media print { .btn, label, .topbar { display: none !important; } }
      `}</style>

      <div>
        {/* Topbar */}
        <header className="topbar">
          <div>
            <div className="tb-title">S-13-S · Registro de Asignación de Territorio</div>
            <div className="tb-sub">
              {extracting ? "⏳ Leyendo datos del PDF…"
               : status === "loading" ? "Cargando…"
               : status === "ready" ? `📄 ${pdfName} · ${filledCount} filas con datos · guardado automático`
               : "⚠️ PDF no encontrado — subí uno con el botón"}
            </div>
          </div>
          <div className="tb-actions">
            <label className="btn btn-teal" style={{ cursor: "pointer" }}>
              📂 Subir PDF
              <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: "none" }} />
            </label>
            <button onClick={downloadPDF} disabled={!canDownload}
              className={`btn ${canDownload ? "btn-purple" : "btn-gray"}`}
              style={{ minWidth: 185 }}>
              {busy ? "⏳ Generando…" : "📥 Descargar PDF"}
            </button>
            <button onClick={clearAll} className="btn btn-red" title="Limpiar todo">🗑️</button>
          </div>
        </header>

        {status === "error" && (
          <div className="banner banner-error">
            ⚠️ No se encontró <code>public/assets/territorios.pdf</code>. Usá <strong>Subir PDF</strong>.
          </div>
        )}
        {extracting && (
          <div className="banner banner-info">⏳ Leyendo los datos del PDF, por favor esperá…</div>
        )}

        <div className="wrap">
          <div className="grid">

            {/* Formulario */}
            <div>
              {/* Header card */}
              <div className="card card-p hdr" style={{ marginBottom: 14 }}>
                <span className="hdr-title">REGISTRO DE ASIGNACIÓN DE TERRITORIO</span>
                <div className="yr-wrap">
                  <span className="yr-label">Año de servicio:</span>
                  <input className="yr-input" value={year}
                    onChange={(e) => setYearVal(e.target.value)}
                    placeholder="____" maxLength={9} />
                </div>
              </div>

              <div className="info-box">
                Subí cualquier <strong>PDF S-13-S</strong> — si ya tiene datos se cargan automáticamente en la tabla.
                Editá los campos y descargá el PDF actualizado.
              </div>

              {/* Tabla */}
              <div className="card tbl-wrap">
                <div className="tbl-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th rowSpan={2} className="th-main" style={{ width: 52 }}>Núm.<br />terr.</th>
                        <th rowSpan={2} className="th-main" style={{ width: 86 }}>Última<br />fecha *</th>
                        {[0,1,2,3].map((g) => (
                          <th key={g} colSpan={3} className="th-main th-g">Asignado a</th>
                        ))}
                        <th rowSpan={2} className="th-main" style={{ width: 32 }} />
                      </tr>
                      <tr>
                        {[0,1,2,3].map((g) => (
                          <th key={g} style={{ padding: 0, background: "#182d4a", borderLeft: "2px solid #2d3f5e" }}>
                            <div className="th-sub-cell">
                              <div className="th-sub-item">Nombre</div>
                              <div className="th-sub-item">Fecha asignó</div>
                              <div className="th-sub-item">Fecha completó</div>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="td">
                            <input className="inp inp-num" value={row.num}
                              onChange={(e) => setField(idx, "num", e.target.value)} placeholder="#" />
                          </td>
                          <td className="td">
                            <input className="inp inp-last" value={row.ultima}
                              onChange={(e) => setField(idx, "ultima", e.target.value)} placeholder="dd/mm/aa" />
                          </td>
                          {[1,2,3,4].map((g) => (
                            <td key={g} className="td-g" style={{ borderLeftColor: GBORDERS[g-1] }}>
                              <div className="g-inner">
                                <div className="g-cell">
                                  <input className="inp inp-name" value={row[`n${g}`]}
                                    onChange={(e) => setField(idx, `n${g}`, e.target.value)} placeholder="Nombre…" />
                                </div>
                                <div className="g-cell">
                                  <input type="date" className="inp inp-date" value={row[`a${g}`]}
                                    onChange={(e) => setField(idx, `a${g}`, e.target.value)} />
                                </div>
                                <div className="g-cell">
                                  <input type="date" className="inp inp-date" value={row[`c${g}`]}
                                    onChange={(e) => setField(idx, `c${g}`, e.target.value)} />
                                </div>
                              </div>
                            </td>
                          ))}
                          <td className="td" style={{ width: 32, padding: "2px 4px" }}>
                            <button className="btn-del" onClick={() => delRow(idx)} title="Eliminar">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn-add" onClick={addRow}>+ Agregar fila</button>
              </div>

              <p className="note">* Al comenzar nueva página, anotar la última fecha en que los territorios se completaron. — S-13-S 1/22</p>

              <button onClick={downloadPDF} disabled={!canDownload}
                className={`btn btn-big ${!canDownload ? "btn-gray" : ""}`}
                style={!canDownload ? { background: "#94a3b8", boxShadow: "none" } : {}}>
                {busy ? "⏳ Generando PDF…" : extracting ? "⏳ Leyendo datos…" : canDownload ? "📥 Descargar PDF editado" : "⚠️ Esperando PDF…"}
              </button>
            </div>

            {/* Sidebar previa */}
            <div className="sidebar">
              {previewUrl && (
                <div className="sidebar-sticky">
                  <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}>
                    <div className="prev-hdr">
                      <span className="prev-name">📄 {pdfName}</span>
                      <label className="btn btn-teal btn-sm" style={{ cursor: "pointer" }}>
                        📂 Cambiar
                        <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: "none" }} />
                      </label>
                    </div>
                    <iframe src={previewUrl} title="preview" width="100%" height="570"
                      style={{ border: "none", display: "block" }} />
                  </div>

                  <div className="card card-p">
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", marginBottom: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>
                      Resumen
                    </div>
                    <div className="sum-grid">
                      {[
                        { label: "Filas total", value: rows.length,                                         color: GCOLS[0] },
                        { label: "Con datos",   value: filledCount,                                         color: GCOLS[1] },
                        { label: "Con nombre",  value: rows.filter((r) => r.n1||r.n2||r.n3||r.n4).length, color: GCOLS[2] },
                        { label: "Con fechas",  value: rows.filter((r) => r.a1||r.a2||r.a3||r.a4).length, color: GCOLS[3] },
                      ].map((s) => (
                        <div key={s.label} className="sum-card" style={{ borderLeftColor: s.color }}>
                          <div className="sum-num" style={{ color: s.color }}>{s.value}</div>
                          <div className="sum-lbl">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {toast && (
          <div className="toast" style={{
            background: toast.type === "err" ? "#ef4444" : toast.type === "warn" ? "#d97706" : toast.type === "info" ? "#2563eb" : "#0f172a",
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </>
  );
}
