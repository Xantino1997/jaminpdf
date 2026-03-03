import { useEffect, useState, useRef, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─────────────────────────────────────────────────────────────────────────────
// Al subir el PDF, esta app:
//  1) Lee TODOS los ítems de texto con sus coordenadas reales
//  2) Muestra en consola (F12) la lista completa para calibración
//  3) Escribe los datos nuevos en posiciones ajustadas manualmente
//
// CÓMO CALIBRAR:
//  - Abrí la consola del navegador (F12 → Console)
//  - Subí tu PDF → vas a ver todos los ítems con x,y
//  - Buscá "18" (número de territorio) → anotá su Y real
//  - Buscá "JORGE" → su Y real
//  - Buscá "03/03/26" → su Y real
//  - Esos valores te dicen exactamente dónde están las filas
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ROWS = 20;
const STORAGE_KEY  = "s13s_v10";

// ── Colores de grupo ──────────────────────────────────────────────────────────
const GC  = ["#3b82f6","#10b981","#f59e0b","#8b5cf6"];
const GBG = ["#eff6ff","#f0fdf4","#fffbeb","#f5f3ff"];
const GHD = ["#1e3a5f","#065f46","#92400e","#4c1d95"];

// ─────────────────────────────────────────────────────────────────────────────
// ESTRUCTURA DE FILAS DEL S-13-S
// Cada fila del formulario tiene DOS bandas de altura:
//   • banda NOMBRE (línea superior de cada par)
//   • banda FECHAS (línea inferior de cada par)
//
// Estas posiciones son en coordenadas pdf-lib (y=0 abajo).
// PDF_H=842 → y_pdflib = 842 - y_desde_arriba
//
// POSICIONES CALIBRADAS (ajustá según tu PDF real):
// ─────────────────────────────────────────────────────────────────────────────
const PDF_H = 842;

// Generamos 20 filas dinámicamente.
// Cada fila ocupa ~32pt (16 nombre + 16 fechas).
// Primera fila comienza en y_desde_arriba ≈ 158 (nombre) y 174 (fechas).
// Ajustá FIRST_NAME_Y y ROW_H si el texto no queda bien.
const FIRST_NAME_Y = 161;  // y desde arriba de la primera línea de nombre
const ROW_H        = 32;   // altura total de cada fila (nombre+fechas)
const NAME_H       = 16;   // altura de la sub-línea de nombre
const DATE_H       = 16;   // altura de la sub-línea de fechas

// Genera las posiciones Y (desde arriba) para cada fila
const getRowY = (rowIdx) => ({
  nameTop: FIRST_NAME_Y + rowIdx * ROW_H,
  dateTop: FIRST_NAME_Y + rowIdx * ROW_H + NAME_H,
});

// Convierte y-desde-arriba a y-pdflib (y=0 abajo)
const toPdfY = (yFromTop, bandH, fontSize) =>
  PDF_H - yFromTop - bandH / 2 + fontSize / 2 - 1;

// ── Posiciones X (centros de cada columna, coordenadas pdf-lib) ──────────────
// Ajustá estos valores si el texto no cae en la columna correcta.
// Abrí el PDF en Adobe/Chrome y usá "Propiedades" para ver tamaño de página.
const COL_X = {
  num:    54,    // Núm. de territorio
  ultima: 103,   // Última fecha en que se completó
  // Grupo 1
  g1n: 163,  g1a: 163,  g1c: 215,
  // Grupo 2
  g2n: 269,  g2a: 269,  g2c: 322,
  // Grupo 3
  g3n: 376,  g3a: 376,  g3c: 429,
  // Grupo 4
  g4n: 482,  g4a: 482,  g4c: 535,
};

// Ancho máximo permitido por celda (pt)
const MAX_W_NAME = 46;
const MAX_W_DATE = 38;

// ── Tamaños de fuente ─────────────────────────────────────────────────────────
const FS_NAME = 7.5;
const FS_DATE = 7.0;
const FS_YEAR = 9.0;

// ─────────────────────────────────────────────────────────────────────────────
// RANGOS X DE LECTURA (pdfjs coordenadas — escala 1)
// Ajustá estos si los nombres/fechas no se leen bien del PDF
// ─────────────────────────────────────────────────────────────────────────────
const READ_COLS = [
  {key:"num",    x0:30,  x1:75 },
  {key:"ultima", x0:75,  x1:140},
  {key:"g1",     x0:140, x1:193},
  {key:"g1c",    x0:193, x1:246},
  {key:"g2",     x0:246, x1:299},
  {key:"g2c",    x0:299, x1:352},
  {key:"g3",     x0:352, x1:405},
  {key:"g3c",    x0:405, x1:458},
  {key:"g4",     x0:458, x1:511},
  {key:"g4c",    x0:511, x1:565},
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  num:"", ultima:"",
  n1:"", a1:"", c1:"",
  n2:"", a2:"", c2:"",
  n3:"", a3:"", c3:"",
  n4:"", a4:"", c4:"",
});

const fmtDate = v => {
  if (!v) return "";
  const [y,m,d] = v.split("-");
  if (!d||!m||!y) return "";
  return `${d}/${m}/${y.slice(2)}`;
};

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
// CARGA DE PDFJS (CDN)
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
// ─────────────────────────────────────────────────────────────────────────────
const extractPDF = async (buf) => {
  try {
    const lib = await loadPdfjs();
    const pdf = await lib.getDocument({data: new Uint8Array(buf)}).promise;
    const pg  = await pdf.getPage(1);
    const vp  = pg.getViewport({scale:1});
    const pH  = vp.height;
    const ct  = await pg.getTextContent({normalizeWhitespace:true});

    const items = ct.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({
        text: it.str.trim(),
        x:    it.transform[4],
        y:    pH - it.transform[5],  // convertir a y-desde-arriba
      }));

    // ── LOG DIAGNÓSTICO completo ──────────────────────────────────────────
    console.group("📄 PDF extraído — todos los ítems de texto");
    console.log(`Página: ${vp.width.toFixed(1)} × ${vp.height.toFixed(1)} pt`);
    console.log("Formato: x | y-desde-arriba | texto");
    items
      .sort((a,b)=>a.y-b.y)
      .forEach(it => console.log(`  x=${it.x.toFixed(1).padStart(6)} y=${it.y.toFixed(1).padStart(6)}  →  "${it.text}"`));
    console.groupEnd();

    // ── Año de servicio ───────────────────────────────────────────────────
    let yearVal = "";
    // Buscar en zona superior (y 50-130), excluyendo texto fijo del formulario
    const yearCandidates = items.filter(it =>
      it.y > 50 && it.y < 130 && it.x > 60 && it.x < 280 &&
      /^\d{4}/.test(it.text)   // debe empezar con 4 dígitos (año)
    );
    if (yearCandidates.length > 0) yearVal = yearCandidates[0].text;

    // ── Filas de datos ────────────────────────────────────────────────────
    // Usamos una estrategia diferente: agrupar ítems por banda Y
    // Las bandas son franjas de ~16pt de alto
    // Clasificamos cada ítem en su banda y columna

    // Detectar automáticamente la primera fila buscando el primer número de territorio
    // (suele ser 1, 2, 3... o cualquier número en la columna "num")
    const rowBands = [];
    for (let i=0; i<DEFAULT_ROWS; i++) {
      const nameTop = FIRST_NAME_Y + i * ROW_H;
      const dateTop = nameTop + NAME_H;
      rowBands.push({
        ri: i,
        nameBand: {min: nameTop - 3, max: nameTop + NAME_H + 1},
        dateBand: {min: dateTop - 2, max: dateTop + DATE_H + 2},
      });
    }

    const rows = Array.from({length:DEFAULT_ROWS}, emptyRow);

    rowBands.forEach(({ri, nameBand, dateBand}) => {
      // Ítems en la banda de nombre
      items.filter(it => it.y >= nameBand.min && it.y < nameBand.max).forEach(it => {
        const col = READ_COLS.find(c => it.x >= c.x0 && it.x < c.x1);
        if (!col) return;
        if (col.key==="num")    rows[ri].num    = it.text;
        if (col.key==="ultima") rows[ri].ultima = it.text;
        if (col.key==="g1")     rows[ri].n1     = it.text;
        if (col.key==="g2")     rows[ri].n2     = it.text;
        if (col.key==="g3")     rows[ri].n3     = it.text;
        if (col.key==="g4")     rows[ri].n4     = it.text;
      });

      // Ítems en la banda de fechas
      items.filter(it => it.y >= dateBand.min && it.y < dateBand.max).forEach(it => {
        const col = READ_COLS.find(c => it.x >= c.x0 && it.x < c.x1);
        if (!col) return;
        if (col.key==="g1")  rows[ri].a1 = parseDate(it.text);
        if (col.key==="g1c") rows[ri].c1 = parseDate(it.text);
        if (col.key==="g2")  rows[ri].a2 = parseDate(it.text);
        if (col.key==="g2c") rows[ri].c2 = parseDate(it.text);
        if (col.key==="g3")  rows[ri].a3 = parseDate(it.text);
        if (col.key==="g3c") rows[ri].c3 = parseDate(it.text);
        if (col.key==="g4")  rows[ri].a4 = parseDate(it.text);
        if (col.key==="g4c") rows[ri].c4 = parseDate(it.text);
      });
    });

    const filledCount = rows.filter(r=>r.num||r.n1||r.n2||r.n3||r.n4||r.a1||r.a2).length;
    console.log(`✅ Filas con datos: ${filledCount}`);
    rows.filter(r=>r.num||r.n1).forEach((r,i)=>
      console.log(`  Fila ${i}: num="${r.num}" n1="${r.n1}" a1="${r.a1}" c1="${r.c1}"`)
    );

    return {rows, year: yearVal};
  } catch(e) {
    console.error("extractPDF error:", e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [rows,setRows]             = useState([]);
  const [year,setYear]             = useState("");
  const [origBytes,setOrigBytes]   = useState(null);
  const [previewUrl,setPreview]    = useState(null);
  const [pdfName,setPdfName]       = useState("territorios.pdf");
  const [status,setStatus]         = useState("loading");
  const [extracting,setExtracting] = useState(false);
  const [busy,setBusy]             = useState(false);
  const [toast,setToast]           = useState(null);
  // Estado de calibración (se puede ajustar desde la UI)
  const [firstNameY, setFirstNameY] = useState(FIRST_NAME_Y);
  const [rowH,       setRowH]       = useState(ROW_H);
  const blobRef = useRef(null);

  const showToast=(msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),4000); };
  const persist=(r,y)=>{ try{localStorage.setItem(STORAGE_KEY,JSON.stringify({rows:r,year:y}));}catch{} };

  const activatePDF = useCallback(async(buf,name,read)=>{
    const u8=new Uint8Array(buf);
    setOrigBytes(u8); setPdfName(name);
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    const blob=new Blob([u8],{type:"application/pdf"});
    blobRef.current=URL.createObjectURL(blob);
    setPreview(blobRef.current); setStatus("ready");
    if (!read) return;
    setExtracting(true);
    showToast("📖 Leyendo datos del PDF…","info");
    const result=await extractPDF(buf);
    setExtracting(false);
    if (!result){ showToast("No se pudieron leer datos","warn"); setRows(Array.from({length:DEFAULT_ROWS},emptyRow)); return; }
    setRows(result.rows);
    setYear(result.year||"");
    persist(result.rows, result.year||"");
    const f=result.rows.filter(r=>r.num||r.n1||r.n2||r.n3||r.n4||r.a1||r.a2).length;
    showToast(f>0 ? `✅ Se cargaron datos de ${f} filas` : "PDF cargado — formulario vacío, podés completarlo");
  },[]); // eslint-disable-line

  useEffect(()=>{
    try{
      const s=localStorage.getItem(STORAGE_KEY);
      if(s){const d=JSON.parse(s);setRows(d.rows||Array.from({length:DEFAULT_ROWS},emptyRow));setYear(d.year||"");}
      else setRows(Array.from({length:DEFAULT_ROWS},emptyRow));
    }catch{setRows(Array.from({length:DEFAULT_ROWS},emptyRow));}
    fetch("/assets/territorios.pdf")
      .then(r=>{if(!r.ok)throw new Error();return r.arrayBuffer();})
      .then(buf=>activatePDF(buf,"territorios.pdf",false))
      .catch(()=>setStatus("error"));
    return()=>{if(blobRef.current)URL.revokeObjectURL(blobRef.current);};
  },[activatePDF]);

  const handleUpload=async e=>{
    const f=e.target.files[0]; if(!f)return; e.target.value="";
    await activatePDF(await f.arrayBuffer(),f.name,true);
  };
  const setField=(idx,field,val)=>{
    setRows(prev=>{const n=prev.map((r,i)=>i===idx?{...r,[field]:val}:r);persist(n,year);return n;});
  };
  const setYr=v=>{setYear(v);persist(rows,v);};
  const addRow=()=>setRows(p=>{const n=[...p,emptyRow()];persist(n,year);return n;});
  const delRow=idx=>{
    if(rows.length<=1)return;
    setRows(p=>{const n=p.filter((_,i)=>i!==idx);persist(n,year);return n;});
  };
  const clearAll=()=>{
    if(!window.confirm("¿Limpiar todos los datos?"))return;
    const f=Array.from({length:DEFAULT_ROWS},emptyRow);
    setRows(f);setYear("");persist(f,"");showToast("Tabla limpiada");
  };

  // ── Generación del PDF ─────────────────────────────────────────────────────
  // Parte SIEMPRE del PDF original limpio.
  // Escribe nombre en la banda superior de cada fila.
  // Escribe fechas en la banda inferior de cada fila.
  const downloadPDF = async()=>{
    if(!origBytes){showToast("No hay PDF cargado","err");return;}
    setBusy(true);
    try{
      const doc  = await PDFDocument.load(origBytes,{ignoreEncryption:true});
      const page = doc.getPages()[0];
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const black= rgb(0,0,0);

      const writeAt=(text,x,y,fs,maxW)=>{
        if(!text||!String(text).trim())return;
        let t=String(text).trim();
        while(font.widthOfTextAtSize(t,fs)>maxW&&t.length>1) t=t.slice(0,-1);
        const tw=font.widthOfTextAtSize(t,fs);
        page.drawText(t,{x:x-tw/2, y, size:fs, font, color:black});
      };

      // Año
      if(year){
        const yw=font.widthOfTextAtSize(year,FS_YEAR);
        page.drawText(year,{x:148-yw/2, y:PDF_H-91, size:FS_YEAR, font, color:black});
      }

      rows.slice(0,20).forEach((row,i)=>{
        const nameTop = firstNameY + i * rowH;
        const dateTop = nameTop + NAME_H;

        // Y central de cada banda (coordenadas pdf-lib: y=0 abajo)
        const yName = PDF_H - nameTop - NAME_H/2 + FS_NAME/2 - 1;
        const yDate = PDF_H - dateTop - DATE_H/2 + FS_DATE/2 - 1;

        // Número y última fecha (centrados en la banda nombre)
        writeAt(row.num,    COL_X.num,    yName, FS_NAME, 30);
        writeAt(row.ultima, COL_X.ultima, yName, FS_DATE, MAX_W_DATE);

        // Nombres — banda superior
        writeAt(row.n1, COL_X.g1n, yName, FS_NAME, MAX_W_NAME);
        writeAt(row.n2, COL_X.g2n, yName, FS_NAME, MAX_W_NAME);
        writeAt(row.n3, COL_X.g3n, yName, FS_NAME, MAX_W_NAME);
        writeAt(row.n4, COL_X.g4n, yName, FS_NAME, MAX_W_NAME);

        // Fechas — banda inferior
        writeAt(fmtDate(row.a1), COL_X.g1a, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.c1), COL_X.g1c, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.a2), COL_X.g2a, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.c2), COL_X.g2c, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.a3), COL_X.g3a, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.c3), COL_X.g3c, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.a4), COL_X.g4a, yDate, FS_DATE, MAX_W_DATE);
        writeAt(fmtDate(row.c4), COL_X.g4c, yDate, FS_DATE, MAX_W_DATE);
      });

      const out=await doc.save();
      const blob=new Blob([out],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download=`territorios_${year||"editado"}.pdf`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),8000);
      showToast("✅ PDF descargado");
    }catch(e){
      console.error(e); showToast("Error: "+e.message,"err");
    }finally{setBusy(false);}
  };

  const filled =rows.filter(r=>r.num||r.n1||r.n2||r.n3||r.n4).length;
  const canDL  =status==="ready"&&!busy&&!extracting;
  const tbg    =t=>t==="err"?"#ef4444":t==="warn"?"#d97706":t==="info"?"#2563eb":"#0f172a";

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased;}

        .tb{background:#0f172a;color:#f8fafc;padding:13px 20px;display:flex;align-items:center;
          justify-content:space-between;gap:10px;flex-wrap:wrap;position:sticky;top:0;z-index:200;
          box-shadow:0 2px 16px rgba(0,0,0,.5);}
        .tb-t{font-weight:700;font-size:15px;letter-spacing:.02em;}
        .tb-s{font-size:11px;color:#94a3b8;margin-top:3px;}
        .tb-a{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}

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

        .ban{padding:12px 20px;font-size:13px;border-bottom:2px solid;}
        .ban-e{background:#fef2f2;border-color:#fca5a5;color:#991b1b;}
        .ban-i{background:#f0fdf4;border-color:#86efac;color:#166534;}

        .wrap{max-width:1500px;margin:0 auto;padding:20px 16px 60px;}
        .grid{display:grid;grid-template-columns:1fr 390px;gap:22px;align-items:start;}
        @media(max-width:1100px){.grid{grid-template-columns:1fr;}.sb{display:none;}}

        .card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;
          box-shadow:0 1px 3px rgba(0,0,0,.07),0 4px 12px rgba(0,0,0,.04);}
        .cp{padding:16px 20px;}

        .hdr{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
        .hdr-t{font-size:17px;font-weight:700;letter-spacing:.01em;}
        .yr-w{display:flex;align-items:center;gap:10px;margin-left:auto;}
        .yr-l{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;}
        .yr-i{border:none;border-bottom:2.5px solid #3b82f6;background:transparent;
          font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:700;
          color:#0f172a;width:100px;text-align:center;outline:none;padding:4px 6px;}

        .info{background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;
          border-radius:8px;padding:11px 16px;margin-bottom:14px;font-size:13px;color:#1e40af;line-height:1.7;}

        /* Calibración */
        .calib{background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;
          border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:#7c2d12;}
        .calib-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;}
        .calib label{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:600;color:#92400e;}
        .calib input{border:1px solid #fed7aa;border-radius:5px;padding:5px 8px;font-size:13px;
          font-family:'IBM Plex Mono',monospace;outline:none;background:#fffbf5;}
        .calib input:focus{border-color:#f97316;box-shadow:0 0 0 2px rgba(249,115,22,.2);}

        .tc{overflow:hidden;}
        .ts{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        table{border-collapse:collapse;width:100%;min-width:900px;}

        .th-m{background:#0f172a;color:#e2e8f0;font-size:10px;font-weight:700;letter-spacing:.05em;
          text-transform:uppercase;padding:12px 6px;text-align:center;
          border:1px solid rgba(255,255,255,.07);white-space:nowrap;}
        .th-grp{padding:0;border-left:3px solid rgba(255,255,255,.15);}
        .th-grp-in{display:flex;flex-direction:column;}
        .th-grp-title{color:#e2e8f0;font-size:11px;font-weight:700;letter-spacing:.05em;
          text-transform:uppercase;padding:8px 8px 5px;text-align:center;}
        .th-grp-sub{display:grid;grid-template-columns:1fr 1fr;
          border-top:1px solid rgba(255,255,255,.1);}
        .th-grp-sub-cell{color:rgba(226,232,240,.65);font-size:9px;font-weight:500;
          padding:4px 3px;text-align:center;letter-spacing:.03em;text-transform:uppercase;}
        .th-grp-sub-cell:first-child{border-right:1px solid rgba(255,255,255,.08);}

        tbody tr{border-bottom:1px solid #e2e8f0;transition:background .1s;}
        tbody tr:nth-child(even){background:#f8fafc;}
        tbody tr:hover>*{background:#eff6ff!important;}
        td{vertical-align:top;}

        .td{padding:3px;border-right:1px solid #e2e8f0;vertical-align:middle;}
        .td-g{padding:0;border-right:1px solid #e2e8f0;border-left:3px solid;}
        .pyr{display:flex;flex-direction:column;width:100%;}
        .pyr-top{width:100%;border-bottom:1px solid #e2e8f0;}
        .pyr-bot{display:grid;grid-template-columns:1fr 1fr;width:100%;}
        .pyr-bot-l{border-right:1px solid #e2e8f0;}

        .inp{width:100%;border:none;background:transparent;font-family:'IBM Plex Sans',inherit;
          outline:none;transition:background .1s,box-shadow .1s;}
        .inp:focus{background:#fff!important;box-shadow:inset 0 0 0 2px #bfdbfe;border-radius:3px;}

        .i-num{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:14px;
          color:#2563eb;text-align:center;padding:10px 5px;}
        .i-last{font-size:11px;color:#64748b;text-align:center;padding:10px 4px;}
        .i-name{font-size:14px;font-weight:600;color:#0f172a;
          text-align:left;padding:9px 12px 7px;letter-spacing:.01em;}
        .i-name::placeholder{color:#b0bec5;font-weight:400;font-size:13px;}
        .dlabel{font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
          padding:4px 8px 0;display:block;}
        .i-date{font-size:10.5px;color:#374151;text-align:center;padding:4px 4px 7px;}

        .btn-del{background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:15px;
          padding:6px;border-radius:5px;transition:all .15s;display:block;width:100%;text-align:center;}
        .btn-del:hover{color:#ef4444;background:#fef2f2;}
        .btn-add{width:100%;padding:13px;background:#f8fafc;border:none;
          border-top:2px dashed #e2e8f0;color:#94a3b8;font-family:inherit;
          font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.08em;
          text-transform:uppercase;border-radius:0 0 12px 12px;transition:all .15s;}
        .btn-add:hover{background:#eff6ff;color:#3b82f6;border-top-color:#93c5fd;}

        .note{font-size:11px;color:#94a3b8;margin-top:10px;padding-left:4px;line-height:1.7;}

        .sb-s{position:sticky;top:70px;}
        .pv-h{background:#f1f5f9;padding:10px 16px;border-bottom:1px solid #e2e8f0;
          display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .pv-n{font-size:12px;font-weight:600;color:#334155;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;max-width:200px;}
        .sum-g{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
        .sum-c{background:#f8fafc;border-radius:8px;padding:12px 14px;border-left:3px solid;}
        .sum-n{font-size:24px;font-weight:700;font-family:'IBM Plex Mono',monospace;}
        .sum-l{font-size:10px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.06em;}

        .toast{position:fixed;bottom:24px;right:20px;color:#fff;padding:12px 22px;
          border-radius:10px;font-size:13px;font-weight:600;
          box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:9999;animation:su .2s ease;}
        @keyframes su{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}

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
        <header className="tb">
          <div>
            <div className="tb-t">S-13-S · Registro de Asignación de Territorio</div>
            <div className="tb-s">
              {extracting?"📖 Leyendo datos del PDF…"
               :status==="loading"?"Cargando…"
               :status==="ready"?`📄 ${pdfName} · ${filled} filas con datos · guardado automático`
               :"⚠️ PDF no encontrado — subí uno"}
            </div>
          </div>
          <div className="tb-a">
            <label className="btn bt" style={{cursor:"pointer"}}>
              📂 Subir PDF
              <input type="file" accept=".pdf" onChange={handleUpload} style={{display:"none"}}/>
            </label>
            <button onClick={downloadPDF} disabled={!canDL}
              className={`btn ${canDL?"bp":"bgr"}`} style={{minWidth:190}}>
              {busy?"⏳ Generando…":"📥 Descargar PDF editado"}
            </button>
            <button onClick={clearAll} className="btn br">🗑️</button>
          </div>
        </header>

        {status==="error"&&(
          <div className="ban ban-e">
            ⚠️ No se encontró <code>public/assets/territorios.pdf</code>. Usá <strong>Subir PDF</strong>.
          </div>
        )}
        {extracting&&<div className="ban ban-i">📖 Leyendo datos… revisá la consola (F12) para detalles.</div>}

        <div className="wrap">
          <div className="grid">
            <div>
              <div className="card cp hdr">
                <span className="hdr-t">REGISTRO DE ASIGNACIÓN DE TERRITORIO</span>
                <div className="yr-w">
                  <span className="yr-l">Año de servicio:</span>
                  <input className="yr-i" value={year} onChange={e=>setYr(e.target.value)} placeholder="____" maxLength={9}/>
                </div>
              </div>

              <div className="info">
                📌 Subí tu PDF S-13-S → los datos se cargan automáticamente. Editá la tabla y descargá el PDF actualizado.
              </div>

              {/* Panel de calibración */}
              <div className="calib">
                <strong>🔧 Calibración de posición en el PDF</strong> — si el texto no queda en el lugar correcto, ajustá estos valores y volvé a descargar.
                <div className="calib-grid">
                  <label>
                    Y primera fila (desde arriba, pt)
                    <input type="number" value={firstNameY}
                      onChange={e=>setFirstNameY(Number(e.target.value))} step="0.5"/>
                  </label>
                  <label>
                    Altura de cada fila (pt)
                    <input type="number" value={rowH}
                      onChange={e=>setRowH(Number(e.target.value))} step="0.5"/>
                  </label>
                </div>
                <div style={{marginTop:8,fontSize:11,color:"#92400e"}}>
                  💡 Abrí la consola del navegador (F12) después de subir el PDF — verás las coordenadas exactas de cada ítem de texto para ajustar los valores.
                </div>
              </div>

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
                              <div className="th-grp-title" style={{background:GHD[g]}}>Asignado a</div>
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
                          <td className="td" style={{textAlign:"center"}}>
                            <input className="inp i-num" value={row.num}
                              onChange={e=>setField(idx,"num",e.target.value)} placeholder="#"/>
                          </td>
                          <td className="td">
                            <input className="inp i-last" value={row.ultima}
                              onChange={e=>setField(idx,"ultima",e.target.value)} placeholder="dd/mm/aa"/>
                          </td>
                          {[1,2,3,4].map(g=>(
                            <td key={g} className="td-g"
                              style={{borderLeftColor:GC[g-1],background:row[`n${g}`]?GBG[g-1]:"transparent"}}>
                              <div className="pyr">
                                <div className="pyr-top">
                                  <input className="inp i-name" value={row[`n${g}`]}
                                    onChange={e=>setField(idx,`n${g}`,e.target.value)}
                                    placeholder="Nombre completo…"/>
                                </div>
                                <div className="pyr-bot">
                                  <div className="pyr-bot-l">
                                    <span className="dlabel" style={{color:GC[g-1]}}>Asignó</span>
                                    <input type="date" className="inp i-date" value={row[`a${g}`]}
                                      onChange={e=>setField(idx,`a${g}`,e.target.value)}/>
                                  </div>
                                  <div>
                                    <span className="dlabel" style={{color:GC[g-1]}}>Completó</span>
                                    <input type="date" className="inp i-date" value={row[`c${g}`]}
                                      onChange={e=>setField(idx,`c${g}`,e.target.value)}/>
                                  </div>
                                </div>
                              </div>
                            </td>
                          ))}
                          <td className="td" style={{width:32,padding:"2px 4px",verticalAlign:"middle"}}>
                            <button className="btn-del" onClick={()=>delRow(idx)} title="Eliminar">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn-add" onClick={addRow}>+ Agregar fila</button>
              </div>

              <p className="note">* Al comenzar nueva página, anotar la última fecha en que los territorios se completaron. — S-13-S 1/22</p>

              <button onClick={downloadPDF} disabled={!canDL}
                className={`btn btn-big ${!canDL?"bgr":""}`}
                style={!canDL?{background:"#94a3b8",boxShadow:"none"}:{}}>
                {busy?"⏳ Generando PDF…":extracting?"⏳ Leyendo datos…":canDL?"📥 Descargar PDF editado":"⚠️ Esperando PDF…"}
              </button>
            </div>

            {/* Sidebar */}
            <div className="sb">
              {previewUrl&&(
                <div className="sb-s">
                  <div className="card" style={{overflow:"hidden",marginBottom:12}}>
                    <div className="pv-h">
                      <span className="pv-n">📄 {pdfName}</span>
                      <label className="btn bt bs" style={{cursor:"pointer"}}>
                        📂 Cambiar
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

        {toast&&<div className="toast" style={{background:tbg(toast.type)}}>{toast.msg}</div>}
      </div>
    </>
  );
}
