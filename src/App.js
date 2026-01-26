import { useEffect, useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";

function App() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [fieldsByPage, setFieldsByPage] = useState({});
  const [currentPDFPage, setCurrentPDFPage] = useState(1);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [availablePages, setAvailablePages] = useState([]);
  const [selectedTerritory, setSelectedTerritory] = useState(null);

  const extractTerritoriesFromPDF = (doc) => {
    const form = doc.getForm();
    const pageCount = doc.getPageCount();
    const pages = [];
    
    // Para cada página, extraer los territorios de esa página específica
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageTerritories = [];
      
      // Intentar leer los 5 campos Terr_ de cada página
      for (let i = 1; i <= 5; i++) {
        try {
          const field = form.getTextField(`Terr_${i}`);
          const widgets = field.acroField.getWidgets();
          
          // Verificar si este campo está en la página actual
          for (const widget of widgets) {
            const widgetPageRef = widget.P();
            if (!widgetPageRef) continue;
            
            const pdfPages = doc.getPages();
            const widgetPageIndex = pdfPages.findIndex(page => page.ref === widgetPageRef);
            
            if (widgetPageIndex === pageNum - 1) {
              const value = field.getText();
              if (value && value.trim() !== "") {
                const num = parseInt(value.trim());
                if (!isNaN(num)) {
                  pageTerritories.push(num);
                } else {
                  pageTerritories.push(null);
                }
              } else {
                pageTerritories.push(null);
              }
              break;
            }
          }
        } catch (e) {
          // Si no existe el campo, agregar null
        }
      }
      
      // Filtrar territorios válidos de esta página
      const validTerritories = pageTerritories.filter(t => t !== null);
      
      if (validTerritories.length > 0) {
        const minTerr = Math.min(...validTerritories);
        const maxTerr = Math.max(...validTerritories);
        
        pages.push({
          index: pageNum - 1,
          pdfPage: pageNum,
          territories: validTerritories,
          label: `${minTerr}-${maxTerr}`
        });
      } else {
        // Si el PDF está vacío, crear territorios por defecto
        const baseNum = (pageNum - 1) * 5 + 1;
        const defaultTerritories = [baseNum, baseNum + 1, baseNum + 2, baseNum + 3, baseNum + 4];
        
        pages.push({
          index: pageNum - 1,
          pdfPage: pageNum,
          territories: defaultTerritories,
          label: `${defaultTerritories[0]}-${defaultTerritories[4]}`,
          isEmpty: true
        });
      }
    }
    
    return pages;
  };

  const extractFieldsFromPage = async (doc, pageNumber) => {
    const form = doc.getForm();
    const fields = form.getFields();
    const pageFields = {};
    
    for (const field of fields) {
      try {
        const widgets = field.acroField.getWidgets();
        
        for (const widget of widgets) {
          const widgetPageRef = widget.P();
          if (!widgetPageRef) continue;
          
          const pages = doc.getPages();
          const widgetPageIndex = pages.findIndex(page => page.ref === widgetPageRef);
          
          if (widgetPageIndex === pageNumber - 1) {
            const fieldName = field.getName();
            if (field.getText) {
              pageFields[fieldName] = field.getText() || "";
            }
          }
        }
      } catch (e) {
        // Ignorar errores
      }
    }
    
    return pageFields;
  };

  const loadPdf = useCallback(async (fileSource) => {
    let bytes;
    
    if (fileSource instanceof ArrayBuffer) {
      bytes = fileSource;
    } else {
      const res = await fetch(fileSource || "/assets/territorios.pdf");
      bytes = await res.arrayBuffer();
    }

    const doc = await PDFDocument.load(bytes);
    const pages = extractTerritoriesFromPDF(doc);
    setAvailablePages(pages);
    
    const allPageFields = {};
    for (let i = 1; i <= doc.getPageCount(); i++) {
      const pageFields = await extractFieldsFromPage(doc, i);
      allPageFields[i] = pageFields;
    }
    
    setFieldsByPage(allPageFields);
    
    if (pages.length > 0) {
      setCurrentPDFPage(1);
    }

    setPdfDoc(doc);
    updateView(bytes);
  }, []);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  const updateView = (bytes) => {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target.result;
      setUploadedFile(file.name);
      await loadPdf(arrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleChange = (name, value) => {
    setFieldsByPage((prev) => ({
      ...prev,
      [currentPDFPage]: {
        ...prev[currentPDFPage],
        [name]: value
      }
    }));
  };

  const handleTerritoryChange = (fieldName, value) => {
    // Actualizar el campo normalmente
    handleChange(fieldName, value);
    
    // Si cambió un campo Terr_, recalcular territorios
    if (fieldName.startsWith("Terr_")) {
      setTimeout(async () => {
        if (pdfDoc) {
          // Crear una copia temporal del documento para recalcular
          const form = pdfDoc.getForm();
          
          // Aplicar todos los cambios actuales
          Object.entries(fieldsByPage).forEach(([page, fields]) => {
            Object.entries(fields).forEach(([name, val]) => {
              try {
                form.getTextField(name).setText(val);
              } catch {}
            });
          });
          
          // Aplicar el nuevo valor
          try {
            form.getTextField(fieldName).setText(value);
          } catch {}
          
          // Recalcular territorios
          const pages = extractTerritoriesFromPDF(pdfDoc);
          setAvailablePages(pages);
        }
      }, 100);
    }
  };

  const savePdf = async () => {
    if (!pdfDoc) return;

    const form = pdfDoc.getForm();

    Object.entries(fieldsByPage).forEach(([page, fields]) => {
      Object.entries(fields).forEach(([name, value]) => {
        try {
          form.getTextField(name).setText(value);
        } catch {}
      });
    });

    const bytes = await pdfDoc.save();
    updateView(bytes);
    
    const newDoc = await PDFDocument.load(bytes);
    setPdfDoc(newDoc);
    
    // Recalcular territorios después de guardar
    const pages = extractTerritoriesFromPDF(newDoc);
    setAvailablePages(pages);
    
    const allPageFields = {};
    for (let i = 1; i <= newDoc.getPageCount(); i++) {
      const pageFields = await extractFieldsFromPage(newDoc, i);
      allPageFields[i] = pageFields;
    }
    setFieldsByPage(allPageFields);
    
    // Sweet Alert
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 400px; text-align: center; animation: slideIn 0.3s ease;">
          <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
          <h3 style="margin: 0 0 8px 0; font-size: 24px; color: #10b981; font-weight: 700;">¡Guardado Exitoso!</h3>
          <p style="margin: 0; color: #64748b; font-size: 15px;">Los cambios se han guardado correctamente en el PDF</p>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      </style>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 2000);
  };

  const clearAll = async () => {
    if (!pdfDoc) return;

    // Confirmación
    const confirmDiv = document.createElement('div');
    confirmDiv.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 400px; text-align: center; animation: slideIn 0.3s ease;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="margin: 0 0 8px 0; font-size: 24px; color: #ef4444; font-weight: 700;">¿Limpiar Todo?</h3>
          <p style="margin: 0 0 20px 0; color: #64748b; font-size: 15px;">Se borrarán todos los datos del formulario</p>
          <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="cancelBtn" style="flex: 1; padding: 10px 20px; border: 1px solid #cbd5e1; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; color: #64748b;">Cancelar</button>
            <button id="confirmBtn" style="flex: 1; padding: 10px 20px; border: none; background: #ef4444; color: white; border-radius: 8px; cursor: pointer; font-weight: 600;">Limpiar</button>
          </div>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      </style>
    `;
    document.body.appendChild(confirmDiv);

    const handleConfirm = async () => {
      confirmDiv.remove();
      
      const form = pdfDoc.getForm();
      form.getFields().forEach((f) => {
        try {
          f.setText("");
        } catch {}
      });

      const emptyPages = {};
      for (let i = 1; i <= pdfDoc.getPageCount(); i++) {
        emptyPages[i] = {};
        const pageFields = await extractFieldsFromPage(pdfDoc, i);
        Object.keys(pageFields).forEach(key => {
          emptyPages[i][key] = "";
        });
      }

      setFieldsByPage(emptyPages);

      const bytes = await pdfDoc.save();
      updateView(bytes);
      
      // Confirmación de limpieza
      const successDiv = document.createElement('div');
      successDiv.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
          <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 400px; text-align: center; animation: slideIn 0.3s ease;">
            <div style="font-size: 48px; margin-bottom: 16px;">🧹</div>
            <h3 style="margin: 0 0 8px 0; font-size: 24px; color: #10b981; font-weight: 700;">¡Limpieza Completa!</h3>
            <p style="margin: 0; color: #64748b; font-size: 15px;">Todos los campos han sido limpiados</p>
          </div>
        </div>
        <style>
          @keyframes slideIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        </style>
      `;
      document.body.appendChild(successDiv);
      setTimeout(() => successDiv.remove(), 2000);
    };

    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
    document.getElementById('cancelBtn').addEventListener('click', () => confirmDiv.remove());
  };

  const download = async () => {
    if (!pdfDoc) return;

    const form = pdfDoc.getForm();
    
    Object.entries(fieldsByPage).forEach(([page, fields]) => {
      Object.entries(fields).forEach(([name, value]) => {
        try {
          form.getTextField(name).setText(value);
        } catch {}
      });
    });

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    
    const currentPage = availablePages.find(p => p.pdfPage === currentPDFPage);
    const pageLabel = currentPage ? currentPage.label : "editado";
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `territorios_${pageLabel}_editado.pdf`;
    a.click();
    
    // Sweet Alert de descarga
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 400px; text-align: center; animation: slideIn 0.3s ease;">
          <div style="font-size: 48px; margin-bottom: 16px;">📥</div>
          <h3 style="margin: 0 0 8px 0; font-size: 24px; color: #10b981; font-weight: 700;">¡Descarga Iniciada!</h3>
          <p style="margin: 0; color: #64748b; font-size: 15px;">El PDF se está descargando</p>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      </style>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 2000);
  };

  const getFieldInfo = (fieldName) => {
    const COLUMNAS = 5;

    if (availablePages.length === 0) {
      return { label: fieldName, category: "otros", orden: 0 };
    }

    const currentPage = availablePages[currentPDFPage - 1];
    if (!currentPage) {
      return { label: fieldName, category: "otros", orden: 0 };
    }

    if (fieldName.startsWith("Terr_")) {
      const columnaEnPDF = parseInt(fieldName.split("_")[1]);
      
      if (columnaEnPDF < 1 || columnaEnPDF > 5) {
        return null;
      }

      return {
        label: `Territorio ${columnaEnPDF}`,
        category: "territorio",
        columna: columnaEnPDF,
        territorioReal: currentPage.territories[columnaEnPDF - 1] || columnaEnPDF,
        orden: columnaEnPDF, // CAMBIO: ordenar por columna (1, 2, 3, 4, 5)
      };
    }

    if (fieldName.startsWith("Name_")) {
      const n = parseInt(fieldName.split("_")[1]) - 1;
      const fila = Math.floor(n / COLUMNAS) + 1;
      const columnaEnPDF = (n % COLUMNAS) + 1;
      
      if (columnaEnPDF < 1 || columnaEnPDF > currentPage.territories.length) {
        return null;
      }
      
      const territorioReal = currentPage.territories[columnaEnPDF - 1];

      return {
        label: `Conduce`,
        category: `territorio${territorioReal}`,
        columna: columnaEnPDF,
        fila,
        territorioReal,
        orden: columnaEnPDF * 100 + fila,
      };
    }

    if (fieldName.startsWith("Date_")) {
      const n = parseInt(fieldName.split("_")[1]) - 1;
      const filaGlobal = Math.floor(n / 2);
      const tipo = n % 2 === 0 ? "Entrega" : "Devolución";
      const fila = Math.floor(filaGlobal / COLUMNAS) + 1;
      const columnaEnPDF = (filaGlobal % COLUMNAS) + 1;
      
      if (columnaEnPDF < 1 || columnaEnPDF > currentPage.territories.length) {
        return null;
      }
      
      const territorioReal = currentPage.territories[columnaEnPDF - 1];

      return {
        label: tipo === "Entrega" ? `Fecha entrega` : `Fecha devolución`,
        category: `territorio${territorioReal}`,
        columna: columnaEnPDF,
        fila,
        territorioReal,
        tipo,
        orden: columnaEnPDF * 100 + fila + (tipo === "Entrega" ? 0.1 : 0.2),
      };
    }

    return { label: fieldName, category: "otros", orden: 9999 };
  };

  const currentFields = fieldsByPage[currentPDFPage] || {};

  const organizedFields = Object.keys(currentFields)
    .map(name => {
      const info = getFieldInfo(name);
      if (!info) return null;
      return { name, ...info };
    })
    .filter(f => f !== null)
    .sort((a, b) => a.orden - b.orden);

  const fieldsByCategory = organizedFields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {});

  const isMobile = window.innerWidth < 1024;
  const currentPage = availablePages.find(p => p.pdfPage === currentPDFPage);
  const currentTerritories = currentPage ? currentPage.territories : [];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)",
      padding: isMobile ? "16px" : "20px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box"
    }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <h2 style={{ 
          marginBottom: 8, 
          fontSize: isMobile ? "24px" : "28px",
          fontWeight: "bold",
          color: "#1e293b"
        }}>
          Editor de Territorios PDF
        </h2>
        <p style={{ 
          marginBottom: 16, 
          color: "#64748b",
          fontSize: isMobile ? "13px" : "14px"
        }}>
          Selecciona la página de territorios a editar
        </p>

        <div style={{
          background: "white",
          padding: isMobile ? "16px" : "20px",
          borderRadius: "12px",
          marginBottom: "16px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0"
        }}>
          <h3 style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#334155",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}>
            🗺️ Seleccionar Territorio
          </h3>
          
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile 
              ? "repeat(auto-fill, minmax(55px, 1fr))" 
              : "repeat(auto-fill, minmax(70px, 1fr))",
            gap: "8px",
            marginBottom: "12px"
          }}>
            {availablePages.flatMap((page) => 
              page.territories.map((terrNum) => {
                const isSelected = currentPDFPage === page.pdfPage && selectedTerritory === terrNum;
                
                return (
                  <button
                    key={`${page.pdfPage}-${terrNum}`}
                    onClick={() => {
                      setCurrentPDFPage(page.pdfPage);
                      setSelectedTerritory(terrNum);
                      setTimeout(() => {
                        const element = document.getElementById(`territory-${terrNum}`);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 100);
                    }}
                    style={{
                      padding: isMobile ? "10px 6px" : "12px 10px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                      background: isSelected 
                        ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                        : "white",
                      color: isSelected ? "white" : "#334155",
                      fontWeight: isSelected ? "700" : "600",
                      fontSize: isMobile ? "13px" : "14px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: isSelected 
                        ? "0 4px 6px rgba(59, 130, 246, 0.3)"
                        : "0 1px 2px rgba(0,0,0,0.05)"
                    }}
                  >
                    {terrNum}
                  </button>
                );
              })
            )}
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            paddingTop: "12px",
            borderTop: "1px solid #e2e8f0"
          }}>
            <label style={{
              flex: 1,
              background: "#f1f5f9",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px dashed #cbd5e1",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "500",
              color: "#475569",
              textAlign: "center",
              transition: "all 0.2s"
            }}>
              📤 {uploadedFile || "Subir PDF"}
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        <div style={{
          display: "flex",
          gap: isMobile ? 16 : 20,
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{
            width: isMobile ? "100%" : 380,
            background: "#fff",
            padding: isMobile ? 20 : 24,
            borderRadius: 12,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
            border: "1px solid #e2e8f0",
            boxSizing: "border-box"
          }}>
            <h3 style={{
              fontSize: isMobile ? "16px" : "18px",
              fontWeight: "600",
              color: "#334155",
              margin: "0 0 8px 0",
              paddingBottom: "8px",
              borderBottom: "1px solid #e2e8f0"
            }}>
              {currentTerritories.length > 0 
                ? `Territorios ${currentTerritories[0]}-${currentTerritories[currentTerritories.length - 1]} (Pág ${currentPDFPage})`
                : "Editando Territorios"}
            </h3>
            
            <p style={{
              fontSize: "12px",
              color: "#64748b",
              marginBottom: "16px"
            }}>
              Cada columna representa un territorio completo
            </p>

            <div style={{ 
              maxHeight: isMobile ? 350 : 500, 
              overflow: "auto",
              marginBottom: 20,
              paddingRight: 8
            }}>
              {/* HEADERS PRIMERO - Número de Territorio */}
              {fieldsByCategory.territorio && (
                <div 
                  style={{ marginBottom: 20 }}
                  id="territory-header"
                >
                  <h4 style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#1e293b",
                    margin: "0 0 10px 0",
                    padding: "6px 10px",
                    background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                    borderRadius: "6px",
                    borderLeft: "3px solid #f59e0b"
                  }}>
                    🔢 Número de Territorio (Header)
                  </h4>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile 
                      ? "1fr" 
                      : "repeat(5, 1fr)",
                    gap: "10px"
                  }}>
                    {fieldsByCategory.territorio
                      .sort((a, b) => a.columna - b.columna) // ORDENAR por columna 1, 2, 3, 4, 5
                      .map((field) => (
                      <div key={field.name}>
                        <label style={{
                          display: "block",
                          fontSize: "10px",
                          fontWeight: "600",
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: 5
                        }}>
                          {field.label}
                        </label>
                        <input
                          type="number"
                          value={currentFields[field.name] || ""}
                          onChange={(e) => handleTerritoryChange(field.name, e.target.value)}
                          placeholder={`Número ${field.columna}`}
                          style={{ 
                            width: "100%", 
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            fontSize: "13px",
                            outline: "none",
                            transition: "all 0.2s",
                            background: "#fffbeb",
                            boxSizing: "border-box"
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DATOS GENERALES */}
              {fieldsByCategory.otros && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#1e293b",
                    margin: "0 0 10px 0",
                    padding: "6px 10px",
                    background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
                    borderRadius: "6px",
                    borderLeft: "3px solid #3b82f6"
                  }}>
                    📋 Datos Generales
                  </h4>
                  {fieldsByCategory.otros.map((field) => (
                    <div key={field.name} style={{ marginBottom: 12 }}>
                      <label style={{
                        display: "block",
                        fontSize: "10px",
                        fontWeight: "600",
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: 5
                      }}>
                        {field.label}
                      </label>
                      <input
                        value={currentFields[field.name] || ""}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        placeholder="Ingrese un valor"
                        style={{ 
                          width: "100%", 
                          padding: "8px 10px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          fontSize: "13px",
                          outline: "none",
                          transition: "all 0.2s",
                          background: "#f8fafc",
                          boxSizing: "border-box"
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* TERRITORIOS */}
              {currentTerritories.map(terrNum => {
                const categoryKey = `territorio${terrNum}`;
                if (!fieldsByCategory[categoryKey]) return null;
                
                return (
                  <div 
                    key={categoryKey} 
                    id={`territory-${terrNum}`}
                    style={{ 
                      marginBottom: 20,
                      scrollMarginTop: "20px"
                    }}
                  >
                    <h4 style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: selectedTerritory === terrNum ? "white" : "#1e293b",
                      margin: "0 0 10px 0",
                      padding: "6px 10px",
                      background: selectedTerritory === terrNum
                        ? "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"
                        : "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                      borderRadius: "6px",
                      borderLeft: "3px solid #2563eb",
                      transition: "all 0.3s"
                    }}>
                      🗺️ Territorio {terrNum}
                    </h4>
                    {fieldsByCategory[categoryKey].map((field) => (
                      <div key={field.name} style={{ marginBottom: 12 }}>
                        <label style={{
                          display: "block",
                          fontSize: "10px",
                          fontWeight: "600",
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: 5
                        }}>
                          {field.label}
                        </label>
                        <input
                          value={currentFields[field.name] || ""}
                          onChange={(e) => handleChange(field.name, e.target.value)}
                          placeholder="Nombre del conductor"
                          style={{ 
                            width: "100%", 
                            padding: "8px 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            fontSize: "13px",
                            outline: "none",
                            transition: "all 0.2s",
                            background: "#f8fafc",
                            boxSizing: "border-box"
                          }}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <button 
              onClick={savePdf} 
              style={{ 
                width: "100%",
                background: "#3b82f6",
                color: "white",
                fontWeight: "600",
                padding: isMobile ? "11px 16px" : "12px 16px",
                borderRadius: "8px",
                border: "none",
                fontSize: "15px",
                cursor: "pointer",
                marginBottom: 12,
                boxShadow: "0 2px 4px rgba(59, 130, 246, 0.3)",
                transition: "all 0.2s"
              }}
            >
              💾 Guardar cambios
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button 
                onClick={clearAll} 
                style={{ 
                  flex: 1,
                  background: "#ef4444",
                  color: "white",
                  fontWeight: "500",
                  padding: isMobile ? "9px 16px" : "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "14px",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(239, 68, 68, 0.3)",
                  transition: "all 0.2s"
                }}
              >
                🧹 Limpiar
              </button>
              <button 
                onClick={download} 
                style={{ 
                  flex: 1,
                  background: "#10b981",
                  color: "white",
                  fontWeight: "500",
                  padding: isMobile ? "9px 16px" : "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "14px",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)",
                  transition: "all 0.2s"
                }}
              >
                📥 Descargar
              </button>
            </div>
          </div>

          <div style={{ 
            flex: 1,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            maxWidth: "100%"
          }}>
            <div style={{ 
              background: "#f1f5f9",
              padding: "12px 16px",
              borderBottom: "1px solid #e2e8f0"
            }}>
              <p style={{ 
                fontSize: "14px",
                fontWeight: "500",
                color: "#334155",
                margin: 0
              }}>
                {currentTerritories.length > 0 
                  ? `📄 Vista previa - Territorios ${currentTerritories[0]} a ${currentTerritories[currentTerritories.length - 1]}`
                  : "📄 Vista previa"}
              </p>
            </div>
            <iframe
              src={pdfUrl ? `${pdfUrl}#page=${currentPDFPage}` : ""}
              title="pdf"
              width="100%"
              height={isMobile ? "500" : "650"}
              style={{ border: "none", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
