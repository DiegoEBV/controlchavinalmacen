import type { Worksheet } from 'exceljs';
import { SolicitudCompra } from '../types';
import { saveAs } from 'file-saver';

const TEMPLATE_URL = '/SCFORMATO.xlsx';

export const exportSolicitudCompra = async (sc: SolicitudCompra) => {
    // Dynamic imports to avoid load-time issues with ExcelJS/FileSaver
    const ExcelJS = (await import('exceljs')).default;
    // file-saver can be tricky with ESM, but we'll try standard import if dynamic fails or vice versa.
    // However, saveAs is already imported statically above which might be fine if only used inside async.
    // Actually, to be safe, let's stick to the dynamic pattern for both if possible, OR if static works.
    // Let's rely on static imports for file-saver (usually fine) and dynamic for exceljs (heavy).

    try {
        console.log("Loading SC template from:", TEMPLATE_URL);
        const response = await fetch(TEMPLATE_URL);
        if (!response.ok) throw new Error(`No se pudo cargar la plantilla Excel desde ${TEMPLATE_URL}`);

        const buffer = await response.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

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
        const solicitante = req.solicitante || 'NO SPECIFIED';

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
                    baseSheet.eachRow((row, rowNumber) => {
                        const newRow = currentSheet.getRow(rowNumber);
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
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

                const materialDesc = item.material?.descripcion || 'Sin descripción';
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
        workbook.eachSheet((sheet, id) => {
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
