import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Requerimiento } from '../types';
import { supabase } from '../config/supabaseClient';
import templateUrl from '../assets/FORMATO.xlsx?url';

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

export const exportRequerimiento = async (req: Requerimiento) => {
    try {
        // 1. Cargar caché de inventario
        const inventoryMap = await loadInventoryCache();

        // 2. Cargar plantilla
        console.log("Loading template from:", templateUrl);
        const response = await fetch(templateUrl);
        if (!response.ok) throw new Error(`No se pudo cargar la plantilla Excel desde ${templateUrl}`);

        const buffer = await response.arrayBuffer();
        console.log("Template buffer size:", buffer.byteLength);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        console.log("Workbook loaded. Sheet count:", workbook.worksheets.length);
        if (workbook.worksheets.length > 0) {
            console.log("First sheet name:", workbook.worksheets[0].name);
        }

        // 3. Preparar datos
        const ITEMS_PER_PAGE = 29;
        const detalles = req.detalles || [];

        // Llenar Hoja 1
        // Usar la primera hoja disponible independientemente de su ID
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('La plantilla no tiene hojas (worksheets.length is 0)');

        fillHeader(sheet, req);
        fillItems(sheet, detalles.slice(0, ITEMS_PER_PAGE), inventoryMap);

        // TODO: Manejar paginación si items > 29 clonando hoja.
        // ExcelJS no tiene un método nativo robusto para clonar hojas con estilos completos de forma sencilla.
        // Por simplicidad y robustez, actualmente truncamos en 29 o llenamos solo la primera página.
        // Si hay más items, podríamos intentar agregarlos en nuevas filas pero rompería el formato de pie de página.

        // Generar Blob y Descargar
        const outBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const filename = `REQ-${String(req.item_correlativo).padStart(3, '0')}_${req.bloque || ''}.xlsx`;
        saveAs(blob, filename);

    } catch (error) {
        console.error("Error exporting excel:", error);
        alert("Error al exportar el Excel. Verifica que la plantilla exista en /public/FORMATO.xlsx");
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
};

const fillItems = (sheet: ExcelJS.Worksheet, items: any[], invMap: InventoryCache['items']) => {
    const START_ROW = 17;
    // B=2, C=3, D=4, E=5, G=7

    items.forEach((item, index) => {
        const rowNum = START_ROW + index;
        const row = sheet.getRow(rowNum);

        // Descripción (Col 2)
        row.getCell(2).value = item.descripcion;

        // Unidad (Col 3)
        row.getCell(3).value = item.unidad;

        // Cantidad Solicitada (Col 4)
        row.getCell(4).value = Number(item.cantidad_solicitada);

        // Buscar datos de inventario
        const key = (item.descripcion || '').trim().toLowerCase();
        const invData = invMap[key];

        if (invData) {
            // Stock (Col 5)
            row.getCell(5).value = invData.stock;
            // Último Ingreso (Col 7)
            row.getCell(7).value = invData.lastIngreso;
        } else {
            // Si no hay dato, dejar vacío o guión
            row.getCell(5).value = 0;
            row.getCell(7).value = '-';
        }

        row.commit();
    });
};
