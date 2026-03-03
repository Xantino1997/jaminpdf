// ─────────────────────────────────────────────────────────────────────────────
//  S-13-S · Registro de Asignación de Territorio
//
//  Agregar en public/index.html dentro de <head>:
//    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
//    <script src="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
//
//  PDF por defecto: public/assets/territorios.pdf
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";

// ── Dimensiones del PDF S-13-S ────────────────────────────────────────────────
const PDF_H = 842.04;

// ── Centros X para escritura (pdf-lib) ───────────────────────────────────────
const CX = {
  num:    54.4,
  ultima: 102.7,
  g1n: 162.5,  g1a: 162.5,  g1c: 215.0,
  g2n: 268.9,  g2a: 268.9,  g2c: 321.8,
  g3n: 375.7,  g3a: 375.7,  g3c: 428.5,
  g4n: 482.4,  g4a: 482.4,  g4c: 535.0,
};

// ── Rangos X de columnas para lectura (pdf.js) ───────────────────────────────
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

// ── Tops de las 40 sub-líneas (y=0 arriba, coordenadas pdfplumber) ────────────
const LINE_TOPS = [
  161, 176,   192, 208,   224, 239,   255, 270,   286, 301,
  318, 333,   349, 364,   380, 395,   412, 427,   443, 458,
  474, 489,   506, 521,   537, 552,   568, 583,   599, 615,
  631, 646,   662, 677,   693, 708,   725, 740,   756, 771,
];

const DEFAULT_ROWS  = 20;
const STORAGE_KEY   = "s13s_v5";
const FS            = 6.5;
const MAX_W         = 48;

// ── Fila vacía ────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  num: "", ultima: "",
  n1: "", a1: "", c1: "",
  n2: "", a2: "", c2: "",
  n3: "", a3: "", c3: "",
  n4: "", a4: "", c4: "",
});

// ── Formatear yyyy-mm-dd → dd/mm/aa ──────────────────────────────────────────
const fmtDate = (v) => {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${(y || "").slice(2)}`;
};

// ── Parsear dd/mm/aa o dd/mm/aaaa → yyyy-mm-dd ───────────────────────────────
const parseDate = (s) => {
  if (!s) return "";
  const parts = s.trim().replace(/[.\-]/g, "/").split("/");
  if (parts.length !== 3) return "";
  let [d, m, y] = parts;
  if (y.length === 2) y = "20" + y;
  d = d.padStart(2, "0");
  m = m.padStart(2, "0");
  if (y.length !== 4 || isNaN(+y) || isNaN(+m) || isNaN(+d)) return "";
  return `${y}-${m}-${d}`;
};

// ── Extraer datos del PDF usando pdf.js ──────────────────────────────────────
const extractPDFData = async (arrayBuffer) => {
  const lib = window.pdfjsLib;
  if (!lib) return null;

  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  try {
    const pdf      = await lib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const page     = await pdf.getPage(1);
    const vp       = page.getViewport({ scale: 1 });
    const pageH    = vp.height;
    const content  = await page.getTextContent();

    // Convertir items a coordenadas con y=0 arriba
    const items = content.items
      .map((it) => ({
        text: it.str.trim(),
        x:    it.transform[4],
        y:    pageH - it.transform[5],
      }))
      .filter((it) => it.text.length > 0);

    // Año
    let yearVal = "";
    const yItem = items.find((it) => it.y > 80 && it.y < 100 && it.x > 100 && it.x < 220);
    if (yItem) yearVal = yItem.text;

    const rows = Array.from({ length: DEFAULT_ROWS }, emptyRow);

    LINE_TOPS.forEach((top, li) => {
      const ri         = Math.floor(li / 2);
      const isNameLine = li % 2 === 0;
      const yMin       = top - 1;
      const yMax       = top + 15;

      items
        .filter((it) => it.y >= yMin && it.y < yMax)
        .forEach((it) => {
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
            if (col.key === "g1")     rows[ri].a1     = parseDate(it.text);
            if (col.key === "g1c")    rows[ri].c1     = parseDate(it.text);
            if (col.key === "g2")     rows[ri].a2     = parseDate(it.text);
            if (col.key === "g2c")    rows[ri].c2     = parseDate(it.text);
            if (col.key === "g3")     rows[ri].a3     = parseDate(it.text);
            if (col.key === "g3c")    rows[ri].c3     = parseDate(it.text);
            if (col.key === "g4")     rows[ri].a4     = parseDate(it.text);
            if (col.key === "g4c")    rows[ri].c4     = parseDate(it.text);
          }
        });
    });

    return { rows, year: yearVal };
  } catch (e) {
    console.error("extractPDFData:", e);
    return null;
  }
};

// ── Helpers de estilos ────────────────────────────────────────────────────────
const thMain = (ex = {}) => ({
  background: "#1a2332", color: "#e2e8f0",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
  textTransform: "uppercase", padding: "9px 4px",
  textAlign: "center", border: "1px solid rgba(255,255,255,0.07)",
  whiteSpace: "nowrap", ...ex,
});
const thSub = (ex = {}) => ({
  background: "#253044", color: "rgba(226,232,240,0.7)",
  fontSize: 9, fontWeight: 500, padding: "4px 3px",
  textAlign: "center", whiteSpace: "nowrap",
  border: "1px solid rgba(255,255,255,0.05)", ...ex,
});
const tdS = (ex = {}) => ({
  padding: "1px 2px", borderRight: "1px solid #e8edf3",
  verticalAlign: "middle", ...ex,
});
const ci = (type) => {
  const base = {
    width: "100%", border: "none", background: "transparent",
    textAlign: "center", padding: "4px 2px", borderRadius: 3,
    boxSizing: "border-box", fontFamily: "inherit",
  };
  if (type === "num")  return { ...base, fontWeight: 700, fontSize: 13, color: "#2563eb" };
  if (type === "last") return { ...base, fontSize: 10, color: "#64748b" };
  if (type === "name") return { ...base, fontSize: 11, color: "#1e293b" };
  return { ...base, fontSize: 10 };
};
const btnS = (bg, ex = {}) => ({
  background: bg, color: "#fff", border: "none", borderRadius: 6,
  padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 5, ...ex,
});

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,       setRows]       = useState([]);
  const [year,       setYear]       = useState("");
  const [pdfBytes,   setPdfBytes]   = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pdfName,    setPdfName]    = useState("territorios.pdf");
  const [status,     setStatus]     = useState("loading"); // loading | ready | error
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

  // ── Activar un ArrayBuffer como PDF activo ────────────────────────────────
  const activatePDF = useCallback(async (buf, name, readData) => {
    setPdfBytes(buf);
    setPdfName(name);
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const blob = new Blob([buf], { type: "application/pdf" });
    blobRef.current = URL.createObjectURL(blob);
    setPreviewUrl(blobRef.current);
    setStatus("ready");

    if (!readData) return;

    setExtracting(true);
    showToast("Leyendo datos del PDF…", "info");
    const result = await extractPDFData(buf);
    setExtracting(false);

    if (!result) {
      showToast("PDF cargado — no se pudieron leer datos", "warn");
      return;
    }

    const hasData = result.rows.some(
      (r) => r.num || r.n1 || r.n2 || r.n3 || r.n4 || r.a1 || r.a2
    );

    if (hasData || result.year) {
      setRows(result.rows);
      setYear(result.year || "");
      persist(result.rows, result.year || "");
      showToast(`✅ Datos cargados del PDF`);
    } else {
      showToast("PDF cargado — no se detectaron datos previos");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Restaurar formulario guardado
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setRows(d.rows || Array.from({ length: DEFAULT_ROWS }, emptyRow));
        setYear(d.year || "");
      } else {
        setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow));
      }
    } catch {
      setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow));
    }

    // Cargar PDF por defecto
    fetch("/assets/territorios.pdf")
      .then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then((buf) => activatePDF(buf, "territorios.pdf", false))
      .catch(() => setStatus("error"));

    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, [activatePDF]);

  // ── Subir PDF desde el dispositivo ───────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const buf = await file.arrayBuffer();
    await activatePDF(buf, file.name, true);
  };

  // ── Edición de filas ──────────────────────────────────────────────────────
  const setField = (idx, field, val) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      persist(next, year);
      return next;
    });
  };
  const setYearVal = (v) => { setYear(v); persist(rows, v); };
  const addRow = () => {
    setRows((p) => { const n = [...p, emptyRow()]; persist(n, year); return n; });
  };
  const delRow = (idx) => {
    if (rows.length <= 1) return;
    setRows((p) => { const n = p.filter((_, i) => i !== idx); persist(n, year); return n; });
  };
  const clearAll = () => {
    if (!window.confirm("¿Limpiar todos los datos?")) return;
    const fresh = Array.from({ length: DEFAULT_ROWS }, emptyRow);
    setRows(fresh); setYear(""); persist(fresh, "");
    showToast("Formulario limpiado");
  };

  // ── Descargar PDF editado ─────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!pdfBytes) { showToast("No hay PDF cargado", "err"); return; }
    if (!window.PDFLib) { showToast("pdf-lib no disponible — recargá la página", "err"); return; }
    setBusy(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
      const doc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const page  = doc.getPages()[0];
      const font  = await doc.embedFont(StandardFonts.Helvetica);
      const black = rgb(0, 0, 0);

      const write = (text, cx, topPP, lineH) => {
        if (!text || !String(text).trim()) return;
        let t = String(text).trim();
        while (font.widthOfTextAtSize(t, FS) > MAX_W && t.length > 1) t = t.slice(0, -1);
        const tw = font.widthOfTextAtSize(t, FS);
        const y  = PDF_H - topPP - lineH / 2 - FS / 3;
        page.drawText(t, { x: cx - tw / 2, y, size: FS, font, color: black });
      };

      if (year) {
        const yw = font.widthOfTextAtSize(year, 9);
        page.drawText(year, { x: 148 - yw / 2, y: PDF_H - 91, size: 9, font, color: black });
      }

      const LH = 14;
      rows.slice(0, 20).forEach((row, i) => {
        const tA  = LINE_TOPS[i * 2];
        const tB  = LINE_TOPS[i * 2 + 1];
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
      console.error(e);
      showToast("Error al generar PDF: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  // ── Valores derivados ─────────────────────────────────────────────────────
  const filledCount = rows.filter((r) => r.num || r.n1 || r.n2 || r.n3 || r.n4).length;
  const canDownload = status === "ready" && !busy && !extracting;

  const toastBg = toast?.type === "err"  ? "#ef4444"
                : toast?.type === "warn" ? "#d97706"
                : toast?.type === "info" ? "#2563eb"
                : "#1a2332";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", minHeight: "100vh", background: "#f0f4f8" }}>

      {/* ── Top bar ── */}
      <div style={{
        background: "#1a2332", color: "#f0f4f8", padding: "11px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            S-13-S · Registro de Asignación de Territorio
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            {extracting  ? "⏳ Leyendo datos del PDF…"
             : status === "loading" ? "Cargando…"
             : status === "ready"   ? `📄 ${pdfName} · ${filledCount} filas con datos · guardado automático`
             : "⚠️ PDF no encontrado — subí uno con el botón"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Subir PDF */}
          <label style={{ ...btnS("#0f766e"), cursor: "pointer" }}>
            📂 Subir PDF
            <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: "none" }} />
          </label>

          {/* Descargar */}
          <button
            onClick={downloadPDF}
            disabled={!canDownload}
            style={btnS(canDownload ? "#7c3aed" : "#4b5563", {
              opacity: !canDownload ? 0.6 : 1, minWidth: 205,
            })}
          >
            {busy ? "⏳ Generando…" : "📥 Descargar PDF editado"}
          </button>

          <button onClick={clearAll} style={btnS("#991b1b")}>
            🗑️ Limpiar
          </button>
        </div>
      </div>

      {/* ── Banners ── */}
      {status === "error" && (
        <div style={{ background: "#fef2f2", borderBottom: "1px solid #fca5a5", padding: "10px 24px", fontSize: 13, color: "#991b1b" }}>
          ⚠️ No se encontró <code>public/assets/territorios.pdf</code>. Usá <strong>Subir PDF</strong> para cargar cualquier S-13-S.
        </div>
      )}
      {extracting && (
        <div style={{ background: "#f0fdf4", borderBottom: "1px solid #86efac", padding: "10px 24px", fontSize: 13, color: "#166534" }}>
          ⏳ Leyendo los datos del PDF, por favor esperá…
        </div>
      )}

      {/* ── Cuerpo ── */}
      <div style={{ maxWidth: 1450, margin: "0 auto", padding: "18px 14px 60px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: previewUrl ? "1fr 370px" : "1fr",
          gap: 18, alignItems: "start",
        }}>

          {/* ════ Formulario ════ */}
          <div>

            {/* Encabezado + año */}
            <div style={{
              background: "#fff", borderRadius: 10, padding: "13px 18px", marginBottom: 12,
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                REGISTRO DE ASIGNACIÓN DE TERRITORIO
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  Año de servicio:
                </span>
                <input
                  value={year}
                  onChange={(e) => setYearVal(e.target.value)}
                  placeholder="____" maxLength={9}
                  style={{
                    border: "none", borderBottom: "2px solid #3b82f6", background: "transparent",
                    fontSize: 17, fontWeight: 700, color: "#1e293b", width: 88,
                    textAlign: "center", outline: "none", padding: "3px 5px",
                  }}
                />
              </div>
            </div>

            {/* Info */}
            <div style={{
              background: "#eff6ff", borderLeft: "4px solid #3b82f6",
              border: "1px solid #bfdbfe", borderRadius: 8,
              padding: "8px 14px", marginBottom: 12,
              fontSize: 12, color: "#1e40af", lineHeight: 1.6,
            }}>
              Podés subir <strong>cualquier PDF S-13-S</strong> — si ya tiene datos escritos,
              se cargan automáticamente en la tabla para que puedas editarlos.
              Luego descargá el PDF actualizado con todos los cambios.
            </div>

            {/* Tabla */}
            <div style={{
              background: "#fff", borderRadius: 10, overflow: "hidden",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1060 }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={thMain({ width: 50 })}>Núm.<br />terr.</th>
                      <th rowSpan={2} style={thMain({ width: 82 })}>Última<br />fecha *</th>
                      {[1, 2, 3, 4].map((g) => (
                        <th key={g} colSpan={3} style={thMain({ borderLeft: "2px solid #3a4a6b" })}>
                          Asignado a
                        </th>
                      ))}
                      <th rowSpan={2} style={{ background: "#1a2332", width: 26 }} />
                    </tr>
                    <tr>
                      {[1, 2, 3, 4].map((g) => (
                        <th key={g} colSpan={3} style={{ padding: 0, background: "#253044", borderLeft: "2px solid #3a4a6b" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                            <div style={thSub({ borderRight: "1px solid rgba(255,255,255,0.08)" })}>Nombre</div>
                            <div style={thSub({ borderRight: "1px solid rgba(255,255,255,0.08)" })}>Fecha asignó</div>
                            <div style={thSub()}>Fecha completó</div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} style={{
                        background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                        borderBottom: "1px solid #e8edf3",
                      }}>
                        {/* Núm */}
                        <td style={tdS()}>
                          <input style={ci("num")} value={row.num}
                            onChange={(e) => setField(idx, "num", e.target.value)} placeholder="#" />
                        </td>
                        {/* Última fecha */}
                        <td style={tdS()}>
                          <input style={ci("last")} value={row.ultima}
                            onChange={(e) => setField(idx, "ultima", e.target.value)} placeholder="dd/mm/aa" />
                        </td>

                        {/* 4 grupos */}
                        {[1, 2, 3, 4].map((g) => (
                          <td key={g} colSpan={3} style={{ padding: 0, borderLeft: "2px solid #dbeafe", borderRight: "1px solid #e8edf3" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                              <div style={{ borderRight: "1px solid #e8edf3" }}>
                                <input style={ci("name")} value={row[`n${g}`]}
                                  onChange={(e) => setField(idx, `n${g}`, e.target.value)} placeholder="Nombre…" />
                              </div>
                              <div style={{ borderRight: "1px solid #e8edf3" }}>
                                <input type="date" style={ci("date")} value={row[`a${g}`]}
                                  onChange={(e) => setField(idx, `a${g}`, e.target.value)} />
                              </div>
                              <div>
                                <input type="date" style={ci("date")} value={row[`c${g}`]}
                                  onChange={(e) => setField(idx, `c${g}`, e.target.value)} />
                              </div>
                            </div>
                          </td>
                        ))}

                        {/* Eliminar */}
                        <td style={{ ...tdS(), width: 26, padding: "1px 3px" }}>
                          <button onClick={() => delRow(idx)} title="Eliminar fila" style={{
                            background: "none", border: "none", color: "#cbd5e1",
                            cursor: "pointer", fontSize: 13, padding: "3px 4px", borderRadius: 4,
                          }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={addRow} style={{
                width: "100%", padding: 9, background: "#f8fafc", border: "none",
                borderTop: "2px dashed #e2e8f0", color: "#94a3b8",
                fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 1,
                borderRadius: "0 0 10px 10px",
              }}>
                + AGREGAR FILA
              </button>
            </div>

            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, paddingLeft: 4 }}>
              * Al comenzar nueva página, anotar la última fecha en que los territorios se completaron. — S-13-S 1/22
            </p>

            {/* Botón descarga grande */}
            <button onClick={downloadPDF} disabled={!canDownload} style={{
              marginTop: 14, width: "100%", padding: "13px 20px",
              background: canDownload ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : "#9ca3af",
              color: "#fff", border: "none", borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: canDownload ? "pointer" : "not-allowed",
              boxShadow: canDownload ? "0 4px 14px rgba(124,58,237,0.4)" : "none",
              opacity: !canDownload ? 0.75 : 1,
              transition: "all 0.2s",
            }}>
              {busy        ? "⏳ Generando PDF…"
               : extracting ? "⏳ Leyendo datos…"
               : canDownload ? "📥 Descargar PDF editado"
               : "⚠️ Esperando PDF…"}
            </button>
          </div>

          {/* ════ Vista previa ════ */}
          {previewUrl && (
            <div style={{ position: "sticky", top: 68 }}>
              <div style={{
                background: "#fff", borderRadius: 10, overflow: "hidden",
                border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{
                  background: "#f1f5f9", padding: "9px 14px",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                    📄 {pdfName}
                  </span>
                  <label style={{ ...btnS("#0f766e", { padding: "4px 10px", fontSize: 11, cursor: "pointer", flexShrink: 0 }) }}>
                    📂 Cambiar PDF
                    <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: "none" }} />
                  </label>
                </div>
                <iframe src={previewUrl} title="preview" width="100%" height="560"
                  style={{ border: "none", display: "block" }} />
              </div>

              {/* Resumen */}
              <div style={{
                marginTop: 10, background: "#fff", borderRadius: 10,
                border: "1px solid #e2e8f0", padding: "13px 15px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 9, textTransform: "uppercase", letterSpacing: 1 }}>
                  Resumen
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {[
                    { label: "Filas total", value: rows.length,                                          color: "#3b82f6" },
                    { label: "Con datos",   value: filledCount,                                          color: "#10b981" },
                    { label: "Con nombre",  value: rows.filter((r) => r.n1||r.n2||r.n3||r.n4).length,  color: "#f59e0b" },
                    { label: "Con fechas",  value: rows.filter((r) => r.a1||r.a2||r.a3||r.a4).length,  color: "#8b5cf6" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      background: "#f8fafc", borderRadius: 8, padding: "9px 11px",
                      borderLeft: `3px solid ${s.color}`,
                    }}>
                      <div style={{ fontSize: 19, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 22, right: 22,
          background: toastBg, color: "#fff",
          padding: "11px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)", zIndex: 9999,
          animation: "fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }
        input:focus { outline: none !important; box-shadow: 0 0 0 2px #bfdbfe !important; background: #fff !important; }
        tbody tr:hover td, tbody tr:hover td > div > div { background: #f0f7ff !important; }
        button:not(:disabled):active { transform: scale(0.97); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media print { button, label { display: none !important; } }
      `}</style>
    </div>
  );
}
