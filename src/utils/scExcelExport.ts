import type { Worksheet, Row, Cell } from 'exceljs';
import { SolicitudCompra } from '../types';
// import { saveAs } from 'file-saver';

const DEFAULT_SC_TEMPLATE_URL = 'https://hmrytxzwpjmvynjbmdas.supabase.co/storage/v1/object/public/formatos-obras/defaults/SCFORMATO.xlsx';

export const exportSolicitudCompra = async (sc: SolicitudCompra, customFormatUrl?: string | null) => {
    let ExcelJS: any;
    let saveAs: any;

    try {
        const modules = await Promise.all([
            import('exceljs'),
            import('file-saver')
        ]);
        ExcelJS = modules[0].default;
        saveAs = modules[1].saveAs;
    } catch (error) {
        console.error("Error loading export modules:", error);
        alert("Error al cargar los módulos de exportación. Verifique su conexión.");
        return;
    }

    try {
        let templateBuffer: ArrayBuffer | null = null;

        // Intento 1: URL Personalizada
        if (customFormatUrl) {
            try {
                console.log("Attempting to load custom SC template:", customFormatUrl);
                const response = await fetch(customFormatUrl);
                if (response.ok) {
                    templateBuffer = await response.arrayBuffer();
                } else {
                    console.warn(`Custom SC template not found or unauthorized (${response.status}). Falling back to default.`);
                }
            } catch (err) {
                console.warn("Error fetching custom SC template:", err);
            }
        }

        // Intento 2: Default
        if (!templateBuffer) {
            try {
                console.log("Loading default SC template from:", DEFAULT_SC_TEMPLATE_URL);
                const response = await fetch(DEFAULT_SC_TEMPLATE_URL);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                templateBuffer = await response.arrayBuffer();
            } catch (err) {
                console.error("Error fetching default SC template:", err);
                throw new Error("No se pudo cargar la plantilla SC (ni personalizada ni por defecto).");
            }
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(templateBuffer);

        // --- PREPARAR DATOS ---
        const ITEMS_PER_PAGE = 23;
        const detalles = sc.detalles || [];
        const totalItems = detalles.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

        // --- DATOS GLOBALES (Header/Footer) ---
        const req = sc.requerimiento;
        if (!req) throw new Error("La Solicitud de Compra no tiene los datos del Requerimiento unidos.");

        // Safe access to nested properties
        const reqNum = req.item_correlativo ? String(req.item_correlativo).padStart(3, '0') : '???';
        const bloque = req.bloque || '';
        const frenteNombre = req.frente?.nombre_frente || '';

        // D11: Frente - Bloque
        const ubicacion = `${frenteNombre} ${bloque ? '- ' + bloque : ''}`.trim();

        // D13: Solicitante
        const solicitante = `${req.solicitante || ''} - ${req.especialidad || ''}`;

        // J5: Número SC
        const numeroSC = sc.numero_sc || 'SC-PENDIENTE';

        // FECHA (O7, P7, Q7)
        const fechaStr = sc.fecha_sc || sc.created_at;

        let day = '', month = '', year = '';
        if (fechaStr) {
            if (fechaStr.length === 10 && fechaStr.includes('-')) {
                const [y, m, d] = fechaStr.split('-');
                year = y;
                month = m;
                day = d;
            } else {
                const dateObj = new Date(fechaStr);
                if (!isNaN(dateObj.getTime())) {
                    day = String(dateObj.getDate()).padStart(2, '0');
                    month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    year = String(dateObj.getFullYear());
                }
            }
        }

        const footerText = `REQ - ${reqNum} - ${bloque}`;


        // --- PAGINACIÓN ---
        for (let i = 0; i < totalPages; i++) {
            let currentSheet: Worksheet;
            const desiredName = `HOJASC${i + 1}`;

            const existing = workbook.getWorksheet(desiredName);

            if (existing) {
                currentSheet = existing;
            } else {
                const baseSheet = workbook.getWorksheet('HOJASC1') || workbook.worksheets[0];
                currentSheet = workbook.addWorksheet(desiredName);

                if (baseSheet) {
                    baseSheet.eachRow((row: Row, rowNumber: number) => {
                        const newRow = currentSheet.getRow(rowNumber);
                        row.eachCell({ includeEmpty: true }, (cell: Cell, colNumber: number) => {
                            const newCell = newRow.getCell(colNumber);
                            newCell.value = cell.value;
                            newCell.style = cell.style;
                            newCell.numFmt = cell.numFmt;
                        });
                        newRow.height = row.height;
                        newRow.commit();
                    });
                }
            }


            // --- LLENAR DATOS ---
            currentSheet.getCell('I5').value = numeroSC;
            currentSheet.getCell('D11').value = ubicacion;
            currentSheet.getCell('D13').value = solicitante;
            currentSheet.getCell('O7').value = day;
            currentSheet.getCell('P7').value = month;
            currentSheet.getCell('Q7').value = year;
            currentSheet.getCell('B56').value = footerText;


            // --- LLENAR ITEMS ---
            const startIdx = i * ITEMS_PER_PAGE;
            const endIdx = startIdx + ITEMS_PER_PAGE;
            const chunk = detalles.slice(startIdx, endIdx);
            const START_ROW = 19;

            chunk.forEach((item, idx) => {
                const rowNum = START_ROW + idx;
                const row = currentSheet.getRow(rowNum);

                const materialDesc = item.material?.descripcion || item.equipo?.nombre || item.epp?.descripcion || 'Sin descripción';
                row.getCell('C').value = materialDesc;
                row.getCell('H').value = item.unidad || '';
                row.getCell('I').value = Number(item.cantidad);
                row.getCell('J').value = "7 DÍAS";
                row.commit();
            });

            for (let j = chunk.length; j < ITEMS_PER_PAGE; j++) {
                const rowNum = START_ROW + j;
                const row = currentSheet.getRow(rowNum);
                row.getCell('C').value = null;
                row.getCell('H').value = null;
                row.getCell('I').value = null;
                row.getCell('J').value = null;
                row.commit();
            }
        }

        // --- LIMPIEZA ---
        const sheetsToDelete: number[] = [];
        workbook.eachSheet((sheet: Worksheet, id: number) => {
            if (sheet.name.startsWith('HOJASC')) {
                const num = parseInt(sheet.name.replace('HOJASC', ''), 10);
                if (!isNaN(num) && num > totalPages) {
                    sheetsToDelete.push(id);
                }
            }
        });

        sheetsToDelete.forEach(id => {
            try {
                workbook.removeWorksheet(id);
            } catch (e) {
                console.warn("Could not remove worksheet", id, e);
            }
        });


        // --- DESCARGAR ---
        const outBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const cleanName = numeroSC.replace(/[\/\\?%*:|"<>]/g, '-');
        saveAs(blob, `${cleanName}.xlsx`);

    } catch (error: any) {
        console.error("Error exporting SC Excel:", error);
        alert(`Error al exportar la SC: ${error.message || error}`);
        throw error;
    }
};
