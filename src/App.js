// ─────────────────────────────────────────────────────────────────────────────
//  S-13-S · Registro de Asignación de Territorio
//  Requiere en public/index.html dentro de <head>:
//    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
//  PDF base en: public/assets/territorios.pdf
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from "react";

// ── Dimensiones del PDF S-13-S (puntos) ──────────────────────────────────────
const PDF_H = 842.04;

// ── Centros X de cada columna en el PDF (puntos) ─────────────────────────────
const CX = {
  num:    54.4,
  ultima: 102.7,
  // Cada grupo "Asignado a" comparte el mismo CX para nombre y fecha asignó
  // porque están en filas distintas (línea A = nombres, línea B = fechas)
  g1n: 162.5,  g1a: 162.5,  g1c: 215.0,
  g2n: 268.9,  g2a: 268.9,  g2c: 321.8,
  g3n: 375.7,  g3a: 375.7,  g3c: 428.5,
  g4n: 482.4,  g4a: 482.4,  g4c: 535.0,
};

// ── Tops de las 40 sub-líneas del PDF (pdfplumber, y=0 arriba) ───────────────
// Cada par [i*2, i*2+1] corresponde a la fila i:
//   i*2   → línea de nombres
//   i*2+1 → línea de fechas
const LINE_TOPS = [
  161, 176,   192, 208,   224, 239,   255, 270,   286, 301,
  318, 333,   349, 364,   380, 395,   412, 427,   443, 458,
  474, 489,   506, 521,   537, 552,   568, 583,   599, 615,
  631, 646,   662, 677,   693, 708,   725, 740,   756, 771,
];

const DEFAULT_ROWS  = 20;
const STORAGE_KEY   = "s13s_v4";
const PDF_FONT_SIZE = 6.5;
const MAX_TEXT_W    = 48; // ancho máximo en puntos para truncar texto

// ── Fila vacía ────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  num: "", ultima: "",
  n1: "", a1: "", c1: "",
  n2: "", a2: "", c2: "",
  n3: "", a3: "", c3: "",
  n4: "", a4: "", c4: "",
});

// ── Formatear fecha yyyy-mm-dd → dd/mm/aa ─────────────────────────────────────
const fmtDate = (v) => {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${(y || "").slice(2)}`;
};

// ─────────────────────────────────────────────────────────────────────────────
//  ESTILOS
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  topbar: {
    background: "#1a2332", color: "#f0f4f8",
    padding: "11px 20px",
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    gap: 12, flexWrap: "wrap",
    position: "sticky", top: 0, zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  },
  page: {
    maxWidth: 1450, margin: "0 auto",
    padding: "18px 14px 60px",
  },
  card: {
    background: "#fff", borderRadius: 10,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  infoBox: {
    background: "#eff6ff", borderLeft: "4px solid #3b82f6",
    border: "1px solid #bfdbfe", borderRadius: 8,
    padding: "7px 13px", marginBottom: 12,
    fontSize: 12, color: "#1e40af", lineHeight: 1.5,
  },
  errorBox: {
    background: "#fef2f2", borderBottom: "1px solid #fca5a5",
    padding: "10px 24px", fontSize: 13, color: "#991b1b",
  },
  addRowBtn: {
    width: "100%", padding: 9,
    background: "#f8fafc", border: "none",
    borderTop: "2px dashed #e2e8f0",
    color: "#94a3b8", fontSize: 12, fontWeight: 600,
    cursor: "pointer", letterSpacing: 1,
    borderRadius: "0 0 10px 10px",
  },
  footNote: {
    fontSize: 11, color: "#94a3b8",
    marginTop: 8, paddingLeft: 4,
  },
};

const thMain = (extra = {}) => ({
  background: "#1a2332", color: "#e2e8f0",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
  textTransform: "uppercase", padding: "9px 4px",
  textAlign: "center", border: "1px solid rgba(255,255,255,0.07)",
  whiteSpace: "nowrap", ...extra,
});

const thSub = (extra = {}) => ({
  background: "#253044", color: "rgba(226,232,240,0.7)",
  fontSize: 9, fontWeight: 500, padding: "4px 3px",
  textAlign: "center", whiteSpace: "nowrap",
  border: "1px solid rgba(255,255,255,0.05)", ...extra,
});

const tdS = (extra = {}) => ({
  padding: "1px 2px",
  borderRight: "1px solid #e8edf3",
  verticalAlign: "middle", ...extra,
});

const cellInp = (type) => {
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

const btnS = (bg, extra = {}) => ({
  background: bg, color: "#fff", border: "none",
  borderRadius: 6, padding: "7px 14px",
  cursor: "pointer", fontSize: 12, fontWeight: 600,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,       setRows]       = useState([]);
  const [year,       setYear]       = useState("");
  const [pdfBytes,   setPdfBytes]   = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status,     setStatus]     = useState("loading"); // loading | ready | error
  const [toast,      setToast]      = useState(null);
  const [busy,       setBusy]       = useState(false);
  const blobRef = useRef(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Persistencia ────────────────────────────────────────────────────────────
  const persist = (r, y) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: r, year: y }));
    } catch {}
  };

  // ── Carga inicial ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Restaurar datos guardados
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setRows(d.rows  || Array.from({ length: DEFAULT_ROWS }, emptyRow));
        setYear(d.year  || "");
      } else {
        setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow));
      }
    } catch {
      setRows(Array.from({ length: DEFAULT_ROWS }, emptyRow));
    }

    // Cargar PDF desde public/assets/
    fetch("/assets/territorios.pdf")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        setPdfBytes(buf);
        const blob = new Blob([buf], { type: "application/pdf" });
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = URL.createObjectURL(blob);
        setPreviewUrl(blobRef.current);
        setStatus("ready");
      })
      .catch((err) => {
        console.warn("PDF no encontrado:", err);
        setStatus("error");
      });

    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutaciones de filas ─────────────────────────────────────────────────────
  const setField = (idx, field, val) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      persist(next, year);
      return next;
    });
  };

  const setYearVal = (v) => {
    setYear(v);
    persist(rows, v);
  };

  const addRow = () => {
    setRows((prev) => {
      const next = [...prev, emptyRow()];
      persist(next, year);
      return next;
    });
  };

  const delRow = (idx) => {
    if (rows.length <= 1) return;
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      persist(next, year);
      return next;
    });
  };

  const clearAll = () => {
    if (!window.confirm("¿Limpiar todos los datos?")) return;
    const fresh = Array.from({ length: DEFAULT_ROWS }, emptyRow);
    setRows(fresh);
    setYear("");
    persist(fresh, "");
    showToast("Datos limpiados");
  };

  // ── Generar PDF con los datos escritos y descargarlo ────────────────────────
  const downloadPDF = async () => {
    if (!pdfBytes) {
      showToast("El PDF base no cargó aún", "err");
      return;
    }
    const PDFLib = window.PDFLib;
    if (!PDFLib) {
      showToast("pdf-lib no disponible — recargá la página", "err");
      return;
    }

    setBusy(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = PDFLib;

      const doc  = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const page = doc.getPages()[0];
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const black = rgb(0, 0, 0);

      // Escribir texto centrado en (cx, y_pdf)
      const write = (text, cx, pdfplumberTop, lineH) => {
        if (!text || !String(text).trim()) return;
        let t = String(text).trim();
        // Truncar si excede el ancho máximo
        while (font.widthOfTextAtSize(t, PDF_FONT_SIZE) > MAX_TEXT_W && t.length > 1) {
          t = t.slice(0, -1);
        }
        const tw  = font.widthOfTextAtSize(t, PDF_FONT_SIZE);
        // Convertir coordenada pdfplumber → PDF (invertir eje Y)
        const pdfY = PDF_H - pdfplumberTop - lineH / 2 - PDF_FONT_SIZE / 3;
        page.drawText(t, {
          x: cx - tw / 2, y: pdfY,
          size: PDF_FONT_SIZE, font, color: black,
        });
      };

      // Año (zona superior izquierda)
      if (year) {
        const yw = font.widthOfTextAtSize(year, 9);
        page.drawText(year, {
          x: 148 - yw / 2, y: PDF_H - 91,
          size: 9, font, color: black,
        });
      }

      const LH_NAME = 14; // alto de sub-línea de nombres
      const LH_DATE = 14; // alto de sub-línea de fechas

      rows.slice(0, 20).forEach((row, i) => {
        const topA = LINE_TOPS[i * 2];       // top línea nombres
        const topB = LINE_TOPS[i * 2 + 1];   // top línea fechas

        // Núm. terr. y Última fecha: centrados verticalmente entre las dos sub-líneas
        const midH = (topB - topA) + LH_DATE;
        write(row.num,    CX.num,    topA, midH);
        write(row.ultima, CX.ultima, topA, midH);

        // Nombres (línea A)
        write(row.n1, CX.g1n, topA, LH_NAME);
        write(row.n2, CX.g2n, topA, LH_NAME);
        write(row.n3, CX.g3n, topA, LH_NAME);
        write(row.n4, CX.g4n, topA, LH_NAME);

        // Fechas (línea B) — formateadas dd/mm/aa
        write(fmtDate(row.a1), CX.g1a, topB, LH_DATE);
        write(fmtDate(row.c1), CX.g1c, topB, LH_DATE);
        write(fmtDate(row.a2), CX.g2a, topB, LH_DATE);
        write(fmtDate(row.c2), CX.g2c, topB, LH_DATE);
        write(fmtDate(row.a3), CX.g3a, topB, LH_DATE);
        write(fmtDate(row.c3), CX.g3c, topB, LH_DATE);
        write(fmtDate(row.a4), CX.g4a, topB, LH_DATE);
        write(fmtDate(row.c4), CX.g4c, topB, LH_DATE);
      });

      const saved = await doc.save();
      const blob  = new Blob([saved], { type: "application/pdf" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href     = url;
      a.download = `territorios_${year || "editado"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      showToast("¡PDF descargado correctamente!");
    } catch (e) {
      console.error(e);
      showToast("Error al generar el PDF: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  // ── Valores derivados ───────────────────────────────────────────────────────
  const filledCount = rows.filter(
    (r) => r.num || r.n1 || r.n2 || r.n3 || r.n4
  ).length;

  const canDownload = status === "ready" && !busy;

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", minHeight: "100vh", background: "#f0f4f8" }}>

      {/* ── Barra superior ─────────────────────────────────────────────────── */}
      <div style={S.topbar}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            S-13-S · Registro de Asignación de Territorio
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            {status === "loading" && "Cargando PDF…"}
            {status === "ready"   && `PDF listo · ${filledCount} filas con datos · guardado automático`}
            {status === "error"   && "⚠️  PDF no encontrado en /assets/territorios.pdf"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={downloadPDF}
            disabled={!canDownload}
            style={btnS(canDownload ? "#7c3aed" : "#4b5563", {
              opacity: busy ? 0.7 : 1, minWidth: 210,
            })}
          >
            {busy ? "⏳ Generando…" : "📥 Descargar PDF editado"}
          </button>
          <button onClick={clearAll} style={btnS("#991b1b")}>
            🗑️ Limpiar todo
          </button>
        </div>
      </div>

      {/* ── Banner de error si no carga el PDF ─────────────────────────────── */}
      {status === "error" && (
        <div style={S.errorBox}>
          ⚠️ No se pudo cargar{" "}
          <code>public/assets/territorios.pdf</code>.
          Verificá que el archivo esté en esa ruta y recargá la página.
        </div>
      )}

      {/* ── Contenido principal ────────────────────────────────────────────── */}
      <div style={S.page}>
        <div style={{
          display: "grid",
          gridTemplateColumns: previewUrl ? "1fr 370px" : "1fr",
          gap: 18, alignItems: "start",
        }}>

          {/* ══ Formulario ════════════════════════════════════════════════════ */}
          <div>

            {/* Encabezado + año */}
            <div style={{ ...S.card, padding: "13px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
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
                  placeholder="____"
                  maxLength={9}
                  style={{
                    border: "none", borderBottom: "2px solid #3b82f6",
                    background: "transparent", fontSize: 17, fontWeight: 700,
                    color: "#1e293b", width: 88, textAlign: "center",
                    outline: "none", padding: "3px 5px",
                  }}
                />
              </div>
            </div>

            {/* Nota informativa */}
            <div style={S.infoBox}>
              Completá los datos y hacé clic en{" "}
              <strong>Descargar PDF editado</strong>. El archivo se genera
              escribiendo sobre el PDF original{" "}
              <code>territorios.pdf</code>. Cada "Asignado a" tiene:{" "}
              <strong>Nombre · Fecha asignó · Fecha completó</strong>.
              Los datos se guardan automáticamente en el navegador.
            </div>

            {/* Tabla */}
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1040 }}>
                  <thead>
                    {/* Fila 1 — grupos */}
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
                    {/* Fila 2 — sub-columnas */}
                    <tr>
                      {[1, 2, 3, 4].map((g) => (
                        <>
                          <th key={`n${g}`} style={thSub({ borderLeft: "2px solid #3a4a6b", width: 90 })}>
                            Nombre
                          </th>
                          <th key={`a${g}`} style={thSub({ width: 80 })}>
                            Fecha asignó
                          </th>
                          <th key={`c${g}`} style={thSub({ width: 80 })}>
                            Fecha completó
                          </th>
                        </>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row, idx) => (
                      <tr
                        key={idx}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                          borderBottom: "1px solid #e8edf3",
                        }}
                      >
                        {/* Núm. terr. */}
                        <td style={tdS()}>
                          <input
                            style={cellInp("num")}
                            value={row.num}
                            onChange={(e) => setField(idx, "num", e.target.value)}
                            placeholder="#"
                          />
                        </td>

                        {/* Última fecha */}
                        <td style={tdS()}>
                          <input
                            style={cellInp("last")}
                            value={row.ultima}
                            onChange={(e) => setField(idx, "ultima", e.target.value)}
                            placeholder="dd/mm/aa"
                          />
                        </td>

                        {/* 4 grupos Asignado a */}
                        {[1, 2, 3, 4].map((g) => (
                          <>
                            <td key={`n${g}`} style={tdS({ borderLeft: "2px solid #dbeafe" })}>
                              <input
                                style={cellInp("name")}
                                value={row[`n${g}`]}
                                onChange={(e) => setField(idx, `n${g}`, e.target.value)}
                                placeholder="Nombre…"
                              />
                            </td>
                            <td key={`a${g}`} style={tdS()}>
                              <input
                                type="date"
                                style={cellInp("date")}
                                value={row[`a${g}`]}
                                onChange={(e) => setField(idx, `a${g}`, e.target.value)}
                              />
                            </td>
                            <td key={`c${g}`} style={tdS()}>
                              <input
                                type="date"
                                style={cellInp("date")}
                                value={row[`c${g}`]}
                                onChange={(e) => setField(idx, `c${g}`, e.target.value)}
                              />
                            </td>
                          </>
                        ))}

                        {/* Eliminar fila */}
                        <td style={{ ...tdS(), width: 26, padding: "1px 3px" }}>
                          <button
                            onClick={() => delRow(idx)}
                            title="Eliminar fila"
                            style={{
                              background: "none", border: "none", color: "#cbd5e1",
                              cursor: "pointer", fontSize: 13,
                              padding: "3px 4px", borderRadius: 4,
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Agregar fila */}
              <button onClick={addRow} style={S.addRowBtn}>
                + AGREGAR FILA
              </button>
            </div>

            <p style={S.footNote}>
              * Al comenzar nueva página, anotar la última fecha en que los territorios se completaron. — S-13-S 1/22
            </p>

            {/* Botón grande de descarga */}
            <button
              onClick={downloadPDF}
              disabled={!canDownload}
              style={{
                marginTop: 14, width: "100%", padding: "13px 20px",
                background: canDownload
                  ? "linear-gradient(135deg,#7c3aed,#5b21b6)"
                  : "#9ca3af",
                color: "#fff", border: "none", borderRadius: 10,
                fontSize: 15, fontWeight: 700,
                cursor: canDownload ? "pointer" : "not-allowed",
                boxShadow: canDownload ? "0 4px 14px rgba(124,58,237,0.4)" : "none",
                opacity: busy ? 0.7 : 1,
                transition: "all 0.2s",
              }}
            >
              {busy
                ? "⏳ Generando PDF…"
                : canDownload
                ? "📥 Descargar PDF editado"
                : status === "loading"
                ? "⏳ Cargando PDF…"
                : "⚠️ PDF base no disponible"}
            </button>
          </div>

          {/* ══ Vista previa PDF ══════════════════════════════════════════════ */}
          {previewUrl && (
            <div style={{ position: "sticky", top: 68 }}>
              <div style={{ ...S.card, overflow: "hidden" }}>
                <div style={{
                  background: "#f1f5f9", padding: "9px 14px",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: 12, fontWeight: 600, color: "#334155",
                }}>
                  📄 territorios.pdf — vista previa
                </div>
                <iframe
                  src={previewUrl}
                  title="territorios"
                  width="100%"
                  height="570"
                  style={{ border: "none", display: "block" }}
                />
              </div>

              {/* Resumen */}
              <div style={{ ...S.card, marginTop: 10, padding: "13px 15px" }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#334155",
                  marginBottom: 9, textTransform: "uppercase", letterSpacing: 1,
                }}>
                  Resumen
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {[
                    { label: "Filas total",  value: rows.length,                                              color: "#3b82f6" },
                    { label: "Con datos",    value: filledCount,                                              color: "#10b981" },
                    { label: "Con nombre",   value: rows.filter((r) => r.n1||r.n2||r.n3||r.n4).length,      color: "#f59e0b" },
                    { label: "Con fechas",   value: rows.filter((r) => r.a1||r.a2||r.a3||r.a4).length,      color: "#8b5cf6" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: "#f8fafc", borderRadius: 8,
                        padding: "9px 11px", borderLeft: `3px solid ${s.color}`,
                      }}
                    >
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

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 22, right: 22,
          background: toast.type === "err" ? "#ef4444" : "#1a2332",
          color: "#fff", padding: "11px 20px", borderRadius: 8,
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)", zIndex: 9999,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Estilos globales ───────────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }
        input:focus {
          outline: none !important;
          box-shadow: 0 0 0 2px #bfdbfe !important;
          background: #fff !important;
        }
        tbody tr:hover td { background: #f0f7ff !important; }
        button:active { transform: scale(0.97); }
        @media print {
          button, .no-print { display: none !important; }
        }
        @media (max-width: 768px) {
          .grid-main { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
