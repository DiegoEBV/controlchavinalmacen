import type ExcelJS from 'exceljs';
import { Requerimiento } from '../types';
import { supabase } from '../config/supabaseClient';

const DEFAULT_TEMPLATE_URL = 'https://hmrytxzwpjmvynjbmdas.supabase.co/storage/v1/object/public/formatos-obras/defaults/FORMATO.xlsx';

// --- Caching Interface ---
interface InventoryCache {
    items: Record<string, { stock: number; lastIngreso: string }>;
    timestamp: number;
}

// Simple in-memory cache
let inventoryCache: InventoryCache | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Carga el inventario y materiales para mapear Descripción -> Stock / Último Ingreso
 */
const loadInventoryCache = async (): Promise<InventoryCache['items']> => {
    const now = Date.now();
    if (inventoryCache && (now - inventoryCache.timestamp < CACHE_DURATION_MS)) {
        return inventoryCache.items;
    }

    try {
        const { data: invData, error } = await supabase
            .from('inventario_obra')
            .select(`
        cantidad_actual,
        ultimo_ingreso,
        material:materiales (
          descripcion
        )
      `) as any; // Type assertion simple para evitar conflictos de types profundos en supabase-js

        if (error) {
            console.error("Error loading inventory for export:", error);
            return {};
        }

        const map: InventoryCache['items'] = {};

        // Mapear por Descripción
        if (invData) {
            invData.forEach((item: any) => {
                if (item.material?.descripcion) {
                    const key = item.material.descripcion.trim().toLowerCase();
                    map[key] = {
                        stock: item.cantidad_actual,
                        lastIngreso: item.ultimo_ingreso ? new Date(item.ultimo_ingreso).toLocaleDateString() : '-'
                    };
                }
            });
        }

        inventoryCache = {
            items: map,
            timestamp: now
        };

        return map;
    } catch (e) {
        console.error("Error building inventory cache:", e);
        return {};
    }
};

export const exportRequerimiento = async (req: Requerimiento, customFormatUrl?: string | null) => {
    try {
        // Carga dinámica de librerías pesadas
        let ExcelJSModule: any;
        let saveAs: any;

        try {
            const modules = await Promise.all([
                import('exceljs'),
                import('file-saver')
            ]);
            ExcelJSModule = modules[0].default;
            saveAs = modules[1].saveAs;
        } catch (error) {
            console.error("Error loading export modules:", error);
            alert("Error al cargar el módulo de exportación. Por favor verifica tu conexión a internet e inténtalo de nuevo.");
            return;
        }

        // 1. Cargar caché de inventario
        const inventoryMap = await loadInventoryCache();

        // 2. Cargar plantilla
        let templateBuffer: ArrayBuffer | null = null;

        // Intento 1: URL Personalizada
        if (customFormatUrl) {
            try {
                console.log("Attempting to load custom template:", customFormatUrl);
                const response = await fetch(customFormatUrl);
                if (response.ok) {
                    templateBuffer = await response.arrayBuffer();
                } else {
                    console.warn(`Custom template not found or unauthorized (${response.status}). Falling back to default.`);
                }
            } catch (err) {
                console.warn("Error fetching custom template:", err);
            }
        }

        // Intento 2: Default
        if (!templateBuffer) {
            try {
                console.log("Loading default template from:", DEFAULT_TEMPLATE_URL);
                const response = await fetch(DEFAULT_TEMPLATE_URL);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                templateBuffer = await response.arrayBuffer();
            } catch (err) {
                console.error("Error fetching default template:", err);
                throw new Error("No se pudo cargar la plantilla de exportación (ni personalizada ni por defecto).");
            }
        }

        const workbook = new ExcelJSModule.Workbook();
        await workbook.xlsx.load(templateBuffer);

        console.log("Workbook loaded. Sheet count:", workbook.worksheets.length);
        if (workbook.worksheets.length > 0) {
            console.log("First sheet name:", workbook.worksheets[0].name);
        }

        // 3. Preparar datos
        const ITEMS_PER_PAGE = 29;
        const detalles = req.detalles || [];

        // Definir la hoja plantilla (la primera)
        const templateSheet = workbook.worksheets[0];
        if (!templateSheet) throw new Error('La plantilla no tiene hojas (worksheets.length is 0)');

        // Calcular cuántos chunks (páginas) necesitamos
        const totalItems = detalles.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
        // Si no hay items, igual generamos 1 página vacía

        for (let i = 0; i < totalPages; i++) {
            let currentSheet: ExcelJS.Worksheet;

            // Estrategia: Usar hoja existente si está disponible, de lo contrario clonar la ÚLTIMA hoja disponible
            if (i < workbook.worksheets.length) {
                currentSheet = workbook.worksheets[i];
                // Opcional: Renombrar si es necesario, o mantener el nombre de la plantilla
                // currentSheet.name = `Hoja ${i + 1}`; 
            } else {
                // Fallback: Clonar la última hoja
                const lastSheet = workbook.worksheets[workbook.worksheets.length - 1];
                const newName = `Hoja ${i + 1}`;
                currentSheet = workbook.addWorksheet(newName);

                // Copia del modelo para el fallback
                const model = Object.assign({}, lastSheet.model);
                if (lastSheet.model.merges) {
                    model.merges = [...lastSheet.model.merges];
                }
                currentSheet.model = model;
                currentSheet.name = newName;
            }

            // Datos del chunk actual
            const startParam = i * ITEMS_PER_PAGE;
            const endParam = startParam + ITEMS_PER_PAGE;
            const chunk = detalles.slice(startParam, endParam);

            // Llenar Header (repetir en cada hoja)
            fillHeader(currentSheet, req);

            // Llenar Items (con índice global para la numeración)
            fillItems(currentSheet, chunk, inventoryMap, startParam);
        }

        // LIMPIEZA: Eliminar hojas no utilizadas
        // Si la plantilla tiene 5 hojas pero solo usamos 2, eliminamos las hojas 3, 4 y 5.
        while (workbook.worksheets.length > totalPages) {
            const sheetToRemove = workbook.worksheets[workbook.worksheets.length - 1];
            workbook.removeWorksheet(sheetToRemove.id);
        }

        // Generar Blob y Descargar
        const outBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const filename = `REQ-${String(req.item_correlativo).padStart(3, '0')}_${req.bloque || ''}.xlsx`;
        saveAs(blob, filename);

    } catch (error: any) {
        console.error("Error exporting excel:", error);
        alert(`Error al exportar el Excel: ${error.message || error}`);
        throw error;
    }
};

const fillHeader = (sheet: ExcelJS.Worksheet, req: Requerimiento) => {
    // B10: Solicitante (Row 10, Col 2)
    sheet.getCell(10, 2).value = req.solicitante || '';

    // B6: Frente - Bloque (Row 6, Col 2)
    const frenteNombre = req.frente?.nombre_frente || '';
    const bloque = req.bloque || '';
    sheet.getCell(6, 2).value = `${frenteNombre} ${bloque ? '- ' + bloque : ''}`;

    // B11: Fecha (Row 11, Col 2)
    sheet.getCell(11, 2).value = req.fecha_solicitud || '';

    // B12: REQ - item_correlativo (Row 12, Col 2)
    if (req.item_correlativo !== undefined && req.item_correlativo !== null) {
        sheet.getCell(12, 2).value = `REQ - ${req.item_correlativo}`;
    }
};

const fillItems = (sheet: ExcelJS.Worksheet, items: any[], invMap: InventoryCache['items'], startIndex: number) => {
    const START_ROW = 17;
    // B=2, C=3, D=4, E=5, G=7

    items.forEach((item, index) => {
        const rowNum = START_ROW + index;
        const row = sheet.getRow(rowNum);

        // Col A (1): Item Number (Global Index + 1)
        row.getCell(1).value = startIndex + index + 1;

        // B: Descripción (Col 2)
        row.getCell(2).value = item.descripcion;

        // C: Unidad (Col 3)
        row.getCell(3).value = item.unidad;

        // D: Cantidad Solicitada (Col 4)
        row.getCell(4).value = Number(item.cantidad_solicitada);

        // Buscar datos de inventario
        const key = (item.descripcion || '').trim().toLowerCase();
        const invData = invMap[key];

        if (invData) {
            // E: Stock (Col 5)
            row.getCell(5).value = invData.stock;
            // G: Último Ingreso (Col 7)
            row.getCell(7).value = invData.lastIngreso;
        } else {
            // Si no hay dato, dejar vacío o guión
            row.getCell(5).value = 0;
            row.getCell(7).value = '-';
        }

        row.commit();
    });
};
