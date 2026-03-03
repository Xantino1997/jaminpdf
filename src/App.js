import { useEffect, useState, useCallback, useRef } from "react";

const PDF_URL = "/mnt/user-data/uploads/S-13_S.pdf";

// Usamos pdf-lib via CDN en el navegador
// Este componente carga el PDF, detecta los campos del formulario y permite editarlos

export default function App() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState("");
  const [toast, setToast] = useState(null);
  const pdfBytesRef = useRef(null);

  const DEFAULT_ROWS = 20;

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const makeEmptyRow = () => ({
    num: "",
    ultima: "",
    a1: "", c1: "",
    a2: "", c2: "",
    a3: "", c3: "",
    a4: "", c4: "",
  });

  // Cargar el PDF original para preview
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true);
        // Intentar cargar el PDF del servidor
        const res = await fetch(PDF_URL);
        if (!res.ok) throw new Error("No se pudo cargar el PDF");
        const bytes = await res.arrayBuffer();
        pdfBytesRef.current = bytes;

        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (e) {
        // Si no puede cargar el PDF, igual mostramos el formulario
        console.warn("PDF no disponible para preview:", e);
        setError("Vista previa del PDF no disponible, pero podés editar los datos abajo.");
      } finally {
        setLoading(false);
      }
    };
    loadPDF();

    // Cargar datos guardados
    try {
      const saved = localStorage.getItem("s13s_v2");
      if (saved) {
        const data = JSON.parse(saved);
        setRows(data.rows || initRows());
        setYear(data.year || "");
        return;
      }
    } catch {}
    setRows(initRows());
  }, []);

  const initRows = () => Array.from({ length: DEFAULT_ROWS }, makeEmptyRow);

  const saveLocal = (newRows, newYear) => {
    try {
      localStorage.setItem("s13s_v2", JSON.stringify({ rows: newRows, year: newYear }));
    } catch {}
  };

  const handleRowChange = (idx, field, value) => {
    const updated = rows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    setRows(updated);
    saveLocal(updated, year);
  };

  const handleYearChange = (v) => {
    setYear(v);
    saveLocal(rows, v);
  };

  const addRow = () => {
    const updated = [...rows, makeEmptyRow()];
    setRows(updated);
    saveLocal(updated, year);
  };

  const deleteRow = (idx) => {
    if (rows.length <= 1) return;
    const updated = rows.filter((_, i) => i !== idx);
    setRows(updated);
    saveLocal(updated, year);
  };

  const clearAll = () => {
    if (!window.confirm("¿Limpiar todos los datos?")) return;
    const fresh = initRows();
    setRows(fresh);
    setYear("");
    saveLocal(fresh, "");
    showToast("Datos limpiados");
  };

  const exportCSV = () => {
    const header = "Num.Terr.,Ultima fecha,Asignado1-Fecha,Asignado1-Completó,Asignado2-Fecha,Asignado2-Completó,Asignado3-Fecha,Asignado3-Completó,Asignado4-Fecha,Asignado4-Completó";
    const lines = rows.map(r =>
      [r.num, r.ultima, r.a1, r.c1, r.a2, r.c2, r.a3, r.c3, r.a4, r.c4]
        .map(v => `"${(v || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = "\uFEFF" + header + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `S-13-S_${year || "sin-año"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exportado");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    showToast("PDF cargado para preview");
  };

  const filledRows = rows.filter(r => r.num || r.ultima || r.a1 || r.a2 || r.a3 || r.a4);

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#f0f4f8" }}>
      {/* Topbar */}
      <div style={{
        background: "#1a2332", color: "#f0f4f8",
        padding: "12px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>S-13-S · Registro de Asignación de Territorio</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            {filledRows.length} de {rows.length} filas con datos · guardado automático
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={btnStyle("#334155")}>
            📂 Cargar PDF
            <input type="file" accept=".pdf" onChange={handleFileUpload} style={{ display: "none" }} />
          </label>
          <button onClick={exportCSV} style={btnStyle("#1d4ed8")}>📊 CSV</button>
          <button onClick={() => window.print()} style={btnStyle("#374151")}>🖨️ Imprimir</button>
          <button onClick={clearAll} style={btnStyle("#991b1b")}>🗑️ Limpiar</button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Dos columnas: formulario + preview */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 20, alignItems: "start" }}>

          {/* ===== FORMULARIO ===== */}
          <div>
            {/* Año */}
            <div style={{
              background: "#fff", borderRadius: 10, padding: "16px 20px",
              marginBottom: 16, border: "1px solid #e2e8f0",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap"
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
                Registro de Asignación de Territorio
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  Año de servicio:
                </label>
                <input
                  value={year}
                  onChange={e => handleYearChange(e.target.value)}
                  placeholder="____"
                  maxLength={9}
                  style={{
                    border: "none", borderBottom: "2px solid #3b82f6",
                    background: "transparent", fontSize: 18, fontWeight: 700,
                    color: "#1e293b", width: 90, textAlign: "center",
                    outline: "none", padding: "4px 6px"
                  }}
                />
              </div>
            </div>

            {/* Info */}
            <div style={{
              background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "4px solid #3b82f6",
              borderRadius: 8, padding: "8px 14px", marginBottom: 14,
              fontSize: 12, color: "#1e40af", lineHeight: 1.5
            }}>
              ✏️ Hacé clic en cualquier celda para editar. Los datos se guardan automáticamente.
              &nbsp;·&nbsp; * Al comenzar nueva página, anotá la última fecha en que se completó cada territorio.
            </div>

            {/* Tabla */}
            <div style={{
              background: "#fff", borderRadius: 10, overflow: "hidden",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={thMain({ width: 56 })}>Núm.<br/>terr.</th>
                      <th rowSpan={2} style={thMain({ width: 90 })}>Última<br/>fecha *</th>
                      <th colSpan={2} style={thMain({ borderLeft: "2px solid #3a4a6b" })}>Asignado a</th>
                      <th colSpan={2} style={thMain({ borderLeft: "2px solid #3a4a6b" })}>Asignado a</th>
                      <th colSpan={2} style={thMain({ borderLeft: "2px solid #3a4a6b" })}>Asignado a</th>
                      <th colSpan={2} style={thMain({ borderLeft: "2px solid #3a4a6b" })}>Asignado a</th>
                      <th rowSpan={2} style={{ background: "#1a2332", width: 28 }}></th>
                    </tr>
                    <tr>
                      {[1,2,3,4].map(g => (
                        <>
                          <th key={`a${g}`} style={thSub({ borderLeft: g > 1 ? "2px solid #3a4a6b" : undefined })}>Fecha asignó</th>
                          <th key={`c${g}`} style={thSub()}>Fecha completó</th>
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} style={{
                        background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                        borderBottom: "1px solid #e8edf3",
                        transition: "background 0.1s"
                      }}>
                        <td style={td()}><input style={cellInput("num")} value={row.num} onChange={e => handleRowChange(idx, "num", e.target.value)} placeholder="#" /></td>
                        <td style={td()}><input style={cellInput("last")} value={row.ultima} onChange={e => handleRowChange(idx, "ultima", e.target.value)} placeholder="dd/mm/aaaa" /></td>

                        <td style={td({ borderLeft: "2px solid #bfdbfe" })}><input type="date" style={cellInput("date")} value={row.a1} onChange={e => handleRowChange(idx, "a1", e.target.value)} /></td>
                        <td style={td()}><input type="date" style={cellInput("date")} value={row.c1} onChange={e => handleRowChange(idx, "c1", e.target.value)} /></td>

                        <td style={td({ borderLeft: "2px solid #bfdbfe" })}><input type="date" style={cellInput("date")} value={row.a2} onChange={e => handleRowChange(idx, "a2", e.target.value)} /></td>
                        <td style={td()}><input type="date" style={cellInput("date")} value={row.c2} onChange={e => handleRowChange(idx, "c2", e.target.value)} /></td>

                        <td style={td({ borderLeft: "2px solid #bfdbfe" })}><input type="date" style={cellInput("date")} value={row.a3} onChange={e => handleRowChange(idx, "a3", e.target.value)} /></td>
                        <td style={td()}><input type="date" style={cellInput("date")} value={row.c3} onChange={e => handleRowChange(idx, "c3", e.target.value)} /></td>

                        <td style={td({ borderLeft: "2px solid #bfdbfe" })}><input type="date" style={cellInput("date")} value={row.a4} onChange={e => handleRowChange(idx, "a4", e.target.value)} /></td>
                        <td style={td()}><input type="date" style={cellInput("date")} value={row.c4} onChange={e => handleRowChange(idx, "c4", e.target.value)} /></td>

                        <td style={{ ...td(), width: 28, padding: "2px 4px" }}>
                          <button onClick={() => deleteRow(idx)} title="Eliminar" style={{
                            background: "none", border: "none", color: "#cbd5e1",
                            cursor: "pointer", fontSize: 14, padding: "3px 5px",
                            borderRadius: 4, transition: "color 0.15s"
                          }}
                            onMouseOver={e => e.target.style.color = "#ef4444"}
                            onMouseOut={e => e.target.style.color = "#cbd5e1"}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addRow} style={{
                width: "100%", padding: 10,
                background: "#f8fafc", border: "none",
                borderTop: "2px dashed #e2e8f0",
                color: "#94a3b8", fontSize: 13, fontWeight: 600,
                cursor: "pointer", letterSpacing: 1,
                borderRadius: "0 0 10px 10px",
                transition: "all 0.15s"
              }}
                onMouseOver={e => { e.target.style.background = "#eff6ff"; e.target.style.color = "#3b82f6"; }}
                onMouseOut={e => { e.target.style.background = "#f8fafc"; e.target.style.color = "#94a3b8"; }}
              >
                + AGREGAR FILA
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, paddingLeft: 4 }}>
              * Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron. · S-13-S 1/22
            </div>
          </div>

          {/* ===== PREVIEW PDF ===== */}
          <div style={{ position: "sticky", top: 70 }}>
            <div style={{
              background: "#fff", borderRadius: 10, overflow: "hidden",
              border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
            }}>
              <div style={{
                background: "#f1f5f9", padding: "10px 16px",
                borderBottom: "1px solid #e2e8f0",
                fontSize: 13, fontWeight: 600, color: "#334155",
                display: "flex", alignItems: "center", gap: 8
              }}>
                📄 Vista previa del formulario original
              </div>
              {loading && (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  Cargando PDF...
                </div>
              )}
              {error && !pdfUrl && (
                <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>
                  {error}
                  <br /><br />
                  <label style={{ ...btnStyle("#3b82f6"), display: "inline-block", cursor: "pointer" }}>
                    📂 Cargar PDF manualmente
                    <input type="file" accept=".pdf" onChange={handleFileUpload} style={{ display: "none" }} />
                  </label>
                </div>
              )}
              {pdfUrl && (
                <iframe
                  src={pdfUrl}
                  title="S-13-S Preview"
                  width="100%"
                  height="580"
                  style={{ border: "none", display: "block" }}
                />
              )}
            </div>

            {/* Stats */}
            <div style={{
              marginTop: 12, background: "#fff", borderRadius: 10,
              border: "1px solid #e2e8f0", padding: "14px 16px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                Resumen
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Filas totales", value: rows.length, color: "#3b82f6" },
                  { label: "Con datos", value: filledRows.length, color: "#10b981" },
                  { label: "Asignaciones", value: rows.filter(r => r.a1 || r.a2 || r.a3 || r.a4).length, color: "#f59e0b" },
                  { label: "Completados", value: rows.filter(r => r.c1 || r.c2 || r.c3 || r.c4).length, color: "#8b5cf6" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "#f8fafc", borderRadius: 8, padding: "10px 12px",
                    borderLeft: `3px solid ${s.color}`
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: toast.type === "error" ? "#ef4444" : "#1a2332",
          color: "#fff", padding: "10px 20px", borderRadius: 8,
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          animation: "fadeIn 0.2s ease",
          zIndex: 9999
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @media print {
          button, label[for], .topbar { display: none !important; }
          iframe { display: none !important; }
        }
        input:focus { outline: none; box-shadow: 0 0 0 2px #bfdbfe; background: #fff !important; }
        tr:hover { background: #f0f7ff !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// Style helpers
function thMain(extra = {}) {
  return {
    background: "#1a2332", color: "#e2e8f0",
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", padding: "10px 6px",
    textAlign: "center", border: "1px solid rgba(255,255,255,0.07)",
    ...extra
  };
}
function thSub(extra = {}) {
  return {
    background: "#253044", color: "rgba(226,232,240,0.6)",
    fontSize: 10, fontWeight: 500, padding: "5px 4px",
    textAlign: "center", border: "1px solid rgba(255,255,255,0.05)",
    whiteSpace: "nowrap", ...extra
  };
}
function td(extra = {}) {
  return { padding: "2px 3px", borderRight: "1px solid #e8edf3", verticalAlign: "middle", ...extra };
}
function cellInput(type) {
  const base = {
    width: "100%", border: "none", background: "transparent",
    fontSize: 12, textAlign: "center", padding: "5px 3px",
    borderRadius: 3, transition: "background 0.15s, box-shadow 0.15s",
    boxSizing: "border-box"
  };
  if (type === "num") return { ...base, fontWeight: 700, fontSize: 13, color: "#2563eb" };
  if (type === "last") return { ...base, color: "#64748b", fontSize: 11 };
  if (type === "date") return { ...base, fontSize: 11 };
  return base;
}
function btnStyle(bg) {
  return {
    background: bg, color: "#fff", border: "none",
    padding: "7px 14px", borderRadius: 6, cursor: "pointer",
    fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
    transition: "opacity 0.15s"
  };
}
