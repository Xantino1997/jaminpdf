import { useEffect, useState, useRef, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DEL FORMULARIO S-13-S
// ─────────────────────────────────────────────────────────────────────────────
const PDF_H = 842.04;

// Centros X donde se escribe en el PDF (coordenadas pdf-lib)
const CX = {
  num:54.4, ultima:102.7,
  g1n:162.5, g1a:162.5, g1c:215.0,
  g2n:268.9, g2a:268.9, g2c:321.8,
  g3n:375.7, g3a:375.7, g3c:428.5,
  g4n:482.4, g4a:482.4, g4c:535.0,
};

// Rangos X de cada columna para leer el PDF (pdfjs coordenadas)
const COL_RANGES = [
  {key:"num",    x0:37,  x1:72 },
  {key:"ultima", x0:72,  x1:136},
  {key:"g1",     x0:136, x1:188},
  {key:"g1c",    x0:188, x1:242},
  {key:"g2",     x0:242, x1:295},
  {key:"g2c",    x0:295, x1:349},
  {key:"g3",     x0:349, x1:402},
  {key:"g3c",    x0:402, x1:455},
  {key:"g4",     x0:455, x1:509},
  {key:"g4c",    x0:509, x1:562},
];

// Posición Y (desde arriba) de cada sub-línea: pares (nombre, fechas)
const LINE_TOPS = [
  161,176, 192,208, 224,239, 255,270, 286,301,
  318,333, 349,364, 380,395, 412,427, 443,458,
  474,489, 506,521, 537,552, 568,583, 599,615,
  631,646, 662,677, 693,708, 725,740, 756,771,
];

const DEFAULT_ROWS = 20;
const STORAGE_KEY  = "s13s_v9";
const FS    = 8.0;   // tamaño fuente en PDF
const MAX_W = 50;    // ancho máximo de texto en PDF

// Colores de grupo
const GC  = ["#3b82f6","#10b981","#f59e0b","#8b5cf6"];
const GBG = ["#eff6ff","#f0fdf4","#fffbeb","#f5f3ff"];
const GHD = ["#1e3a5f","#065f46","#92400e","#4c1d95"];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  num:"",ultima:"",
  n1:"",a1:"",c1:"",
  n2:"",a2:"",c2:"",
  n3:"",a3:"",c3:"",
  n4:"",a4:"",c4:"",
});

// yyyy-mm-dd → dd/mm/aa  (para imprimir en el PDF)
const fmtDate = v => {
  if (!v) return "";
  const [y,m,d] = v.split("-");
  if (!d||!m||!y) return "";
  return `${d}/${m}/${y.slice(2)}`;
};

// dd/mm/aa o dd/mm/aaaa → yyyy-mm-dd  (para el input type=date)
const parseDate = s => {
  if (!s) return "";
  const p = s.trim().replace(/[.-]/g,"/").split("/");
  if (p.length!==3) return "";
  let [d,m,y]=p;
  if (y.length===2) y="20"+y;
  d=d.padStart(2,"0"); m=m.padStart(2,"0");
  if (y.length!==4||isNaN(+y)||isNaN(+m)||isNaN(+d)) return "";
  return `${y}-${m}-${d}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// CARGA DINÁMICA DE PDFJS (CDN)
// ─────────────────────────────────────────────────────────────────────────────
const loadPdfjs = () => new Promise((res,rej) => {
  if (window.pdfjsLib) { res(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    res(window.pdfjsLib);
  };
  s.onerror = () => rej(new Error("No se pudo cargar pdfjs"));
  document.head.appendChild(s);
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACCIÓN DE DATOS DEL PDF
// Estrategia:
//   • Probamos primero con scale=1 (PDF nativo)
//   • Si no encontramos suficientes ítems, renderizamos a canvas con scale=2
//     y usamos pdfjs textLayer para mayor precisión
//   • Buscamos el año en la zona superior de la página
//   • Para cada fila (20 filas × 2 sub-líneas):
//       sub-línea par  → nombre + núm + última
//       sub-línea impar → fechas
// ─────────────────────────────────────────────────────────────────────────────
const extractPDF = async buf => {
  try {
    const lib = await loadPdfjs();
    const pdf = await lib.getDocument({data: new Uint8Array(buf)}).promise;
    const pg  = await pdf.getPage(1);

    // Intentamos con scale 1 y luego 1.5 si el resultado es pobre
    const tryExtract = async scale => {
      const vp   = pg.getViewport({scale});
      const pH   = vp.height;
      const ct   = await pg.getTextContent({normalizeWhitespace:true});
      return ct.items
        .filter(it => it.str && it.str.trim())
        .map(it => ({
          text: it.str.trim(),
          x:    it.transform[4] * scale,
          y:    pH - it.transform[5] * scale,
          // ancho del ítem para diagnóstico
          w:    Math.abs(it.width) * scale,
        }));
    };

    let items = await tryExtract(1);

    // Si hay muy pocos ítems de texto, probamos escala mayor
    if (items.length < 5) {
      items = await tryExtract(1.5);
      // Normalizar a escala 1
      items = items.map(it=>({...it, x:it.x/1.5, y:it.y/1.5}));
    }

    // DEBUG: loguear todos los ítems para ver qué lee
    console.log("📄 ítems leídos del PDF:", items.length);
    items.forEach(it => console.log(`  x=${it.x.toFixed(1)} y=${it.y.toFixed(1)} → "${it.text}"`));

    // Buscar año de servicio (zona superior ~y 80-110, x 80-250)
    let yearVal = "";
    const yItem = items.find(it => it.y > 75 && it.y < 115 && it.x > 80 && it.x < 260);
    if (yItem) yearVal = yItem.text;

    // Inicializar filas vacías
    const rows = Array.from({length:DEFAULT_ROWS}, emptyRow);

    // Para cada sub-línea buscar ítems que caigan en esa banda Y
    LINE_TOPS.forEach((top, li) => {
      const ri      = Math.floor(li / 2);   // índice de fila (0-19)
      const isName  = li % 2 === 0;          // par=nombre, impar=fechas
      const yMin    = top - 3;
      const yMax    = top + 16;

      items
        .filter(it => it.y >= yMin && it.y < yMax)
        .forEach(it => {
          // Buscar en qué columna cae este ítem
          const col = COL_RANGES.find(c => it.x >= c.x0 && it.x < c.x1);
          if (!col) return;

          if (isName) {
            if (col.key==="num")    rows[ri].num    = it.text;
            if (col.key==="ultima") rows[ri].ultima = it.text;
            if (col.key==="g1")     rows[ri].n1     = it.text;
            if (col.key==="g2")     rows[ri].n2     = it.text;
            if (col.key==="g3")     rows[ri].n3     = it.text;
            if (col.key==="g4")     rows[ri].n4     = it.text;
          } else {
            if (col.key==="g1")  rows[ri].a1 = parseDate(it.text);
            if (col.key==="g1c") rows[ri].c1 = parseDate(it.text);
            if (col.key==="g2")  rows[ri].a2 = parseDate(it.text);
            if (col.key==="g2c") rows[ri].c2 = parseDate(it.text);
            if (col.key==="g3")  rows[ri].a3 = parseDate(it.text);
            if (col.key==="g3c") rows[ri].c3 = parseDate(it.text);
            if (col.key==="g4")  rows[ri].a4 = parseDate(it.text);
            if (col.key==="g4c") rows[ri].c4 = parseDate(it.text);
          }
        });
    });

    console.log("✅ Filas extraídas:", rows.filter(r=>r.num||r.n1||r.n2).length);
    return {rows, year:yearVal};
  } catch(e) {
    console.error("extractPDF error:", e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITURA EN PDF
// Borra el contenido existente clonando una página limpia y sobreescribiendo
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,setRows]             = useState([]);
  const [year,setYear]             = useState("");
  const [origBytes,setOrigBytes]   = useState(null); // bytes ORIGINALES sin editar
  const [previewUrl,setPreview]    = useState(null);
  const [pdfName,setPdfName]       = useState("territorios.pdf");
  const [status,setStatus]         = useState("loading");
  const [extracting,setExtracting] = useState(false);
  const [busy,setBusy]             = useState(false);
  const [toast,setToast]           = useState(null);
  const blobRef = useRef(null);

  const showToast=(msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),4000); };
  const persist=(r,y)=>{ try{localStorage.setItem(STORAGE_KEY,JSON.stringify({rows:r,year:y}));}catch{} };

  // ── Activar un PDF: guardarlo + mostrar preview + leer datos ──────────────
  const activatePDF = useCallback(async(buf, name, readData) => {
    const u8 = new Uint8Array(buf);
    setOrigBytes(u8);       // guardamos el ORIGINAL para escribir sobre él limpio
    setPdfName(name);

    // Preview
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const blob = new Blob([u8], {type:"application/pdf"});
    blobRef.current = URL.createObjectURL(blob);
    setPreview(blobRef.current);
    setStatus("ready");

    if (!readData) return;

    // Extraer datos
    setExtracting(true);
    showToast("📖 Leyendo datos del PDF…","info");
    const result = await extractPDF(buf);
    setExtracting(false);

    if (!result) {
      showToast("PDF cargado — no se pudieron leer datos","warn");
      setRows(Array.from({length:DEFAULT_ROWS},emptyRow));
      return;
    }

    // Siempre reemplazamos la tabla con lo que viene del PDF
    // (incluye filas vacías si el PDF no tiene datos)
    setRows(result.rows);
    setYear(result.year || "");
    persist(result.rows, result.year || "");

    const filled = result.rows.filter(r=>r.num||r.n1||r.n2||r.n3||r.n4||r.a1||r.a2).length;
    if (filled > 0 || result.year) {
      showToast(`✅ Se cargaron ${filled} filas del PDF`);
    } else {
      showToast("PDF cargado — el formulario estaba vacío, podés completarlo");
    }
  }, []); // eslint-disable-line

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Restaurar datos guardados (sólo si no se carga un PDF)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setRows(d.rows || Array.from({length:DEFAULT_ROWS},emptyRow));
        setYear(d.year || "");
      } else {
        setRows(Array.from({length:DEFAULT_ROWS},emptyRow));
      }
    } catch { setRows(Array.from({length:DEFAULT_ROWS},emptyRow)); }

    // Cargar PDF por defecto (sin leer datos, solo preview)
    fetch("/assets/territorios.pdf")
      .then(r=>{ if(!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then(buf=>activatePDF(buf,"territorios.pdf",false))
      .catch(()=>setStatus("error"));

    return ()=>{ if(blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, [activatePDF]);

  // ── Subir PDF desde dispositivo → leer datos automáticamente ──────────────
  const handleUpload = async e => {
    const f = e.target.files[0];
    if (!f) return;
    e.target.value = "";
    const buf = await f.arrayBuffer();
    await activatePDF(buf, f.name, true);  // readData=true → extrae datos
  };

  // ── Edición de la tabla ────────────────────────────────────────────────────
  const setField = (idx,field,val) => {
    setRows(prev => {
      const n = prev.map((r,i) => i===idx ? {...r,[field]:val} : r);
      persist(n,year);
      return n;
    });
  };
  const setYr = v => { setYear(v); persist(rows,v); };
  const addRow = () => setRows(p => { const n=[...p,emptyRow()]; persist(n,year); return n; });
  const delRow = idx => {
    if (rows.length<=1) return;
    setRows(p => { const n=p.filter((_,i)=>i!==idx); persist(n,year); return n; });
  };
  const clearAll = () => {
    if (!window.confirm("¿Limpiar todos los datos de la tabla?")) return;
    const f = Array.from({length:DEFAULT_ROWS},emptyRow);
    setRows(f); setYear(""); persist(f,"");
    showToast("Tabla limpiada");
  };

  // ── Descargar PDF editado ──────────────────────────────────────────────────
  // Carga siempre el PDF ORIGINAL y escribe encima los datos actuales de la tabla.
  // Así nunca se acumula texto viejo.
  const downloadPDF = async () => {
    if (!origBytes) { showToast("No hay PDF cargado","err"); return; }
    setBusy(true);
    try {
      // Siempre partir del PDF original
      const doc   = await PDFDocument.load(origBytes, {ignoreEncryption:true});
      const page  = doc.getPages()[0];
      const font  = await doc.embedFont(StandardFonts.Helvetica);
      const black = rgb(0,0,0);

      // Función para escribir un texto centrado en X, centrado verticalmente en su banda Y
      const write = (text, cx, topPP, lineH) => {
        if (!text || !String(text).trim()) return;
        let t = String(text).trim();
        // Truncar si es demasiado ancho
        while (font.widthOfTextAtSize(t, FS) > MAX_W && t.length > 1) t = t.slice(0,-1);
        const tw = font.widthOfTextAtSize(t, FS);
        const y  = PDF_H - topPP - (lineH/2) + (FS/2) - 1;
        page.drawText(t, {x: cx - tw/2, y, size:FS, font, color:black});
      };

      // Año de servicio
      if (year) {
        const yw = font.widthOfTextAtSize(year, 9);
        page.drawText(year, {x: 148-yw/2, y: PDF_H-91, size:9, font, color:black});
      }

      const LH = 14;
      rows.slice(0,20).forEach((row,i) => {
        const tA  = LINE_TOPS[i*2];
        const tB  = LINE_TOPS[i*2+1];
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
      const blob = new Blob([out],{type:"application/pdf"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`territorios_${year||"editado"}.pdf`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),8000);
      showToast("✅ PDF descargado con éxito");
    } catch(e) {
      console.error(e);
      showToast("Error al generar PDF: "+e.message,"err");
    } finally { setBusy(false); }
  };

  // ── Valores derivados ──────────────────────────────────────────────────────
  const filled  = rows.filter(r=>r.num||r.n1||r.n2||r.n3||r.n4).length;
  const canDL   = status==="ready" && !busy && !extracting;
  const tbg     = t => t==="err"?"#ef4444":t==="warn"?"#d97706":t==="info"?"#2563eb":"#0f172a";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased;}

        /* Topbar */
        .tb{background:#0f172a;color:#f8fafc;padding:13px 20px;display:flex;align-items:center;
          justify-content:space-between;gap:10px;flex-wrap:wrap;position:sticky;top:0;z-index:200;
          box-shadow:0 2px 16px rgba(0,0,0,.5);}
        .tb-t{font-weight:700;font-size:15px;letter-spacing:.02em;}
        .tb-s{font-size:11px;color:#94a3b8;margin-top:3px;}
        .tb-a{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}

        /* Botones */
        .btn{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:8px;
          cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;padding:9px 16px;
          transition:filter .15s,transform .1s;white-space:nowrap;color:#fff;}
        .btn:active:not(:disabled){transform:scale(.97);}
        .btn:disabled{opacity:.5;cursor:not-allowed;}
        .btn:hover:not(:disabled){filter:brightness(1.12);}
        .bt{background:#0f766e;} .bp{background:#7c3aed;} .br{background:#991b1b;} .bgr{background:#475569;}
        .bs{padding:6px 12px;font-size:12px;border-radius:6px;}
        .btn-big{width:100%;justify-content:center;padding:15px 20px;font-size:15px;border-radius:12px;
          margin-top:16px;background:linear-gradient(135deg,#7c3aed,#5b21b6);
          box-shadow:0 4px 16px rgba(124,58,237,.35);}
        .btn-big:hover:not(:disabled){box-shadow:0 6px 22px rgba(124,58,237,.5);}

        /* Banners */
        .ban{padding:12px 20px;font-size:13px;border-bottom:2px solid;}
        .ban-e{background:#fef2f2;border-color:#fca5a5;color:#991b1b;}
        .ban-i{background:#f0fdf4;border-color:#86efac;color:#166534;}
        .ban-w{background:#fffbeb;border-color:#fde68a;color:#92400e;}

        /* Layout */
        .wrap{max-width:1500px;margin:0 auto;padding:20px 16px 60px;}
        .grid{display:grid;grid-template-columns:1fr 390px;gap:22px;align-items:start;}
        @media(max-width:1100px){.grid{grid-template-columns:1fr;}.sb{display:none;}}

        /* Card */
        .card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;
          box-shadow:0 1px 3px rgba(0,0,0,.07),0 4px 12px rgba(0,0,0,.04);}
        .cp{padding:16px 20px;}

        /* Header card */
        .hdr{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
        .hdr-t{font-size:17px;font-weight:700;letter-spacing:.01em;}
        .yr-w{display:flex;align-items:center;gap:10px;margin-left:auto;}
        .yr-l{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;}
        .yr-i{border:none;border-bottom:2.5px solid #3b82f6;background:transparent;
          font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:700;
          color:#0f172a;width:100px;text-align:center;outline:none;padding:4px 6px;}

        /* Info box */
        .info{background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;
          border-radius:8px;padding:11px 16px;margin-bottom:14px;font-size:13px;color:#1e40af;line-height:1.7;}

        /* Tabla */
        .tc{overflow:hidden;}
        .ts{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        table{border-collapse:collapse;width:100%;min-width:900px;}

        .th-m{background:#0f172a;color:#e2e8f0;font-size:10px;font-weight:700;letter-spacing:.05em;
          text-transform:uppercase;padding:12px 6px;text-align:center;
          border:1px solid rgba(255,255,255,.07);white-space:nowrap;}

        /* Encabezado de grupo — pirámide igual que la celda */
        .th-grp{padding:0;border-left:3px solid rgba(255,255,255,.15);}
        .th-grp-in{display:flex;flex-direction:column;}
        .th-grp-title{color:#e2e8f0;font-size:11px;font-weight:700;letter-spacing:.05em;
          text-transform:uppercase;padding:8px 8px 5px;text-align:center;}
        .th-grp-sub{display:grid;grid-template-columns:1fr 1fr;
          border-top:1px solid rgba(255,255,255,.1);}
        .th-grp-sub-cell{color:rgba(226,232,240,.65);font-size:9px;font-weight:500;
          padding:4px 3px;text-align:center;letter-spacing:.03em;text-transform:uppercase;}
        .th-grp-sub-cell:first-child{border-right:1px solid rgba(255,255,255,.08);}

        /* Filas */
        tbody tr{border-bottom:1px solid #e2e8f0;transition:background .1s;}
        tbody tr:nth-child(even){background:#f8fafc;}
        tbody tr:hover>*{background:#eff6ff!important;}
        td{vertical-align:top;}

        .td{padding:3px;border-right:1px solid #e2e8f0;vertical-align:middle;}

        /* ─── CELDA PIRÁMIDE ───
           ┌─────────────────────────┐
           │  Nombre completo        │  ← fila 1: ancho total
           ├────────────┬────────────┤
           │  Asignó    │  Completó  │  ← fila 2: mitad y mitad
           └────────────┴────────────┘
        */
        .td-g{padding:0;border-right:1px solid #e2e8f0;border-left:3px solid;}
        .pyr{display:flex;flex-direction:column;width:100%;}
        .pyr-top{width:100%;border-bottom:1px solid #e2e8f0;}
        .pyr-bot{display:grid;grid-template-columns:1fr 1fr;width:100%;}
        .pyr-bot-l{border-right:1px solid #e2e8f0;}

        /* Inputs */
        .inp{width:100%;border:none;background:transparent;
          font-family:'IBM Plex Sans',inherit;outline:none;transition:background .1s,box-shadow .1s;}
        .inp:focus{background:#fff!important;box-shadow:inset 0 0 0 2px #bfdbfe;border-radius:3px;}

        /* Número */
        .i-num{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:14px;
          color:#2563eb;text-align:center;padding:10px 5px;}
        /* Última fecha */
        .i-last{font-size:11px;color:#64748b;text-align:center;padding:10px 4px;}

        /* NOMBRE — grande y visible */
        .i-name{font-size:14px;font-weight:600;color:#0f172a;
          text-align:left;padding:9px 12px 7px;letter-spacing:.01em;}
        .i-name::placeholder{color:#b0bec5;font-weight:400;font-size:13px;}

        /* Etiqueta mini */
        .dlabel{font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
          padding:4px 8px 0;display:block;}

        /* Fecha */
        .i-date{font-size:10.5px;color:#374151;text-align:center;padding:4px 4px 7px;}

        /* Botón eliminar */
        .btn-del{background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:15px;
          padding:6px;border-radius:5px;transition:all .15s;display:block;width:100%;text-align:center;}
        .btn-del:hover{color:#ef4444;background:#fef2f2;}

        /* Agregar fila */
        .btn-add{width:100%;padding:13px;background:#f8fafc;border:none;
          border-top:2px dashed #e2e8f0;color:#94a3b8;font-family:inherit;
          font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.08em;
          text-transform:uppercase;border-radius:0 0 12px 12px;transition:all .15s;}
        .btn-add:hover{background:#eff6ff;color:#3b82f6;border-top-color:#93c5fd;}

        /* Nota */
        .note{font-size:11px;color:#94a3b8;margin-top:10px;padding-left:4px;line-height:1.7;}

        /* Sidebar */
        .sb-s{position:sticky;top:70px;}
        .pv-h{background:#f1f5f9;padding:10px 16px;border-bottom:1px solid #e2e8f0;
          display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .pv-n{font-size:12px;font-weight:600;color:#334155;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;max-width:200px;}
        .sum-g{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
        .sum-c{background:#f8fafc;border-radius:8px;padding:12px 14px;border-left:3px solid;}
        .sum-n{font-size:24px;font-weight:700;font-family:'IBM Plex Mono',monospace;}
        .sum-l{font-size:10px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.06em;}

        /* Toast */
        .toast{position:fixed;bottom:24px;right:20px;color:#fff;padding:12px 22px;
          border-radius:10px;font-size:13px;font-weight:600;
          box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:9999;animation:su .2s ease;}
        @keyframes su{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}

        /* Mobile */
        @media(max-width:640px){
          .tb{padding:11px 12px;} .tb-t{font-size:13px;}
          .tb-a .btn{padding:8px 11px;font-size:12px;}
          .wrap{padding:12px 10px 50px;}
          .hdr{flex-direction:column;align-items:flex-start;gap:10px;}
          .yr-w{margin-left:0;}
          .btn-big{font-size:14px;padding:13px;}
        }
        @media print{.btn,label,.tb{display:none!important;}}
      `}</style>

      <div>
        {/* ── Topbar ── */}
        <header className="tb">
          <div>
            <div className="tb-t">S-13-S · Registro de Asignación de Territorio</div>
            <div className="tb-s">
              {extracting ? "📖 Leyendo datos del PDF…"
               : status==="loading" ? "Cargando…"
               : status==="ready"   ? `📄 ${pdfName} · ${filled} filas con datos · guardado automático`
               : "⚠️ PDF no encontrado — subí uno con el botón"}
            </div>
          </div>
          <div className="tb-a">
            <label className="btn bt" style={{cursor:"pointer"}}>
              📂 Subir PDF
              <input type="file" accept=".pdf" onChange={handleUpload} style={{display:"none"}}/>
            </label>
            <button onClick={downloadPDF} disabled={!canDL}
              className={`btn ${canDL?"bp":"bgr"}`} style={{minWidth:185}}>
              {busy?"⏳ Generando…":"📥 Descargar PDF editado"}
            </button>
            <button onClick={clearAll} className="btn br" title="Limpiar tabla">🗑️</button>
          </div>
        </header>

        {/* Banners */}
        {status==="error" && (
          <div className="ban ban-e">
            ⚠️ No se encontró <code>public/assets/territorios.pdf</code>.
            Usá <strong>Subir PDF</strong> para cargar tu S-13-S.
          </div>
        )}
        {extracting && (
          <div className="ban ban-i">
            📖 Leyendo datos del PDF — esto puede tardar unos segundos…
          </div>
        )}

        <div className="wrap">
          <div className="grid">

            {/* ════ Formulario ════ */}
            <div>
              {/* Header */}
              <div className="card cp hdr">
                <span className="hdr-t">REGISTRO DE ASIGNACIÓN DE TERRITORIO</span>
                <div className="yr-w">
                  <span className="yr-l">Año de servicio:</span>
                  <input className="yr-i" value={year}
                    onChange={e=>setYr(e.target.value)} placeholder="____" maxLength={9}/>
                </div>
              </div>

              {/* Info */}
              <div className="info">
                📌 <strong>Subí tu PDF S-13-S</strong> — los datos que ya tenga se cargan automáticamente
                en la tabla. Editá lo que necesites y descargá el PDF actualizado.
                El PDF descargado siempre parte del original, nunca superpone texto.
              </div>

              {/* Tabla */}
              <div className="card tc">
                <div className="ts">
                  <table>
                    <thead>
                      <tr>
                        <th className="th-m" style={{width:50}}>Núm.<br/>terr.</th>
                        <th className="th-m" style={{width:80}}>Última<br/>fecha *</th>
                        {[0,1,2,3].map(g=>(
                          <th key={g} className="th-grp" style={{background:GHD[g],minWidth:180}}>
                            <div className="th-grp-in">
                              <div className="th-grp-title" style={{background:GHD[g]}}>
                                Asignado a
                              </div>
                              <div className="th-grp-sub" style={{background:GHD[g]}}>
                                <div className="th-grp-sub-cell">📅 Asignó</div>
                                <div className="th-grp-sub-cell">✅ Completó</div>
                              </div>
                            </div>
                          </th>
                        ))}
                        <th className="th-m" style={{width:32}}/>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((row,idx)=>(
                        <tr key={idx}>
                          {/* Número */}
                          <td className="td" style={{textAlign:"center"}}>
                            <input className="inp i-num" value={row.num}
                              onChange={e=>setField(idx,"num",e.target.value)} placeholder="#"/>
                          </td>

                          {/* Última fecha */}
                          <td className="td">
                            <input className="inp i-last" value={row.ultima}
                              onChange={e=>setField(idx,"ultima",e.target.value)} placeholder="dd/mm/aa"/>
                          </td>

                          {/* 4 grupos en pirámide */}
                          {[1,2,3,4].map(g=>(
                            <td key={g} className="td-g"
                              style={{
                                borderLeftColor: GC[g-1],
                                background: row[`n${g}`] ? GBG[g-1] : "transparent"
                              }}>
                              <div className="pyr">
                                {/* Fila 1: NOMBRE — ancho completo */}
                                <div className="pyr-top">
                                  <input
                                    className="inp i-name"
                                    value={row[`n${g}`]}
                                    onChange={e=>setField(idx,`n${g}`,e.target.value)}
                                    placeholder="Nombre completo…"
                                  />
                                </div>
                                {/* Fila 2: fechas lado a lado */}
                                <div className="pyr-bot">
                                  <div className="pyr-bot-l">
                                    <span className="dlabel" style={{color:GC[g-1]}}>Asignó</span>
                                    <input
                                      type="date"
                                      className="inp i-date"
                                      value={row[`a${g}`]}
                                      onChange={e=>setField(idx,`a${g}`,e.target.value)}
                                    />
                                  </div>
                                  <div>
                                    <span className="dlabel" style={{color:GC[g-1]}}>Completó</span>
                                    <input
                                      type="date"
                                      className="inp i-date"
                                      value={row[`c${g}`]}
                                      onChange={e=>setField(idx,`c${g}`,e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          ))}

                          {/* Eliminar */}
                          <td className="td" style={{width:32,padding:"2px 4px",verticalAlign:"middle"}}>
                            <button className="btn-del" onClick={()=>delRow(idx)} title="Eliminar fila">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn-add" onClick={addRow}>+ Agregar fila</button>
              </div>

              <p className="note">
                * Al comenzar nueva página, anotar la última fecha en que los territorios se completaron. — S-13-S 1/22
              </p>

              {/* Botón grande de descarga */}
              <button onClick={downloadPDF} disabled={!canDL}
                className={`btn btn-big ${!canDL?"bgr":""}`}
                style={!canDL?{background:"#94a3b8",boxShadow:"none"}:{}}>
                {busy       ? "⏳ Generando PDF…"
                 :extracting? "⏳ Leyendo datos…"
                 :canDL     ? "📥 Descargar PDF editado"
                 :            "⚠️ Esperando PDF…"}
              </button>
            </div>

            {/* ════ Sidebar preview ════ */}
            <div className="sb">
              {previewUrl && (
                <div className="sb-s">
                  <div className="card" style={{overflow:"hidden",marginBottom:12}}>
                    <div className="pv-h">
                      <span className="pv-n">📄 {pdfName}</span>
                      <label className="btn bt bs" style={{cursor:"pointer"}}>
                        📂 Cambiar PDF
                        <input type="file" accept=".pdf" onChange={handleUpload} style={{display:"none"}}/>
                      </label>
                    </div>
                    <iframe src={previewUrl} title="preview" width="100%" height="570"
                      style={{border:"none",display:"block"}}/>
                  </div>

                  <div className="card cp">
                    <div style={{fontSize:10,fontWeight:700,color:"#334155",marginBottom:11,
                      textTransform:"uppercase",letterSpacing:".08em"}}>Resumen</div>
                    <div className="sum-g">
                      {[
                        {label:"Filas total",value:rows.length,           color:GC[0]},
                        {label:"Con datos",  value:filled,                color:GC[1]},
                        {label:"Con nombre", value:rows.filter(r=>r.n1||r.n2||r.n3||r.n4).length, color:GC[2]},
                        {label:"Con fechas", value:rows.filter(r=>r.a1||r.a2||r.a3||r.a4).length, color:GC[3]},
                      ].map(s=>(
                        <div key={s.label} className="sum-c" style={{borderLeftColor:s.color}}>
                          <div className="sum-n" style={{color:s.color}}>{s.value}</div>
                          <div className="sum-l">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="toast" style={{background:tbg(toast.type)}}>{toast.msg}</div>
        )}
      </div>
    </>
  );
}
