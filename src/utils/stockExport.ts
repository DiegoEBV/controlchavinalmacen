import * as XLSX from 'xlsx';
import { formatDisplayDate } from './dateUtils';

/**
 * Normaliza los datos polimórficos de inventario_obra para la exportación.
 */
const normalizeStockData = (items: any[]) => {
    return items.map(item => {
        let tipo = 'Desconocido';
        let descripcion = '-';
        let detalle = '-'; // Marca/Código/Tipo
        let categoria = '-';
        let unidad = '-';

        if (item.material) {
            tipo = 'Material';
            descripcion = item.material.descripcion || '-';
            detalle = '-';
            categoria = item.material.categoria || '-';
            unidad = item.material.unidad || '-';
        } else if (item.equipo) {
            tipo = 'Equipo';
            descripcion = item.equipo.nombre || '-';
            detalle = `${item.equipo.marca || ''} [${item.equipo.codigo || ''}]`.trim();
            categoria = 'Equipo';
            unidad = 'UND';
        } else if (item.epp) {
            tipo = 'EPP';
            descripcion = item.epp.descripcion || '-';
            detalle = `${item.epp.tipo || ''} [${item.epp.codigo || ''}]`.trim();
            categoria = item.epp.tipo || '-';
            unidad = item.epp.unidad || '-';
        }

        return {
            'Tipo': tipo,
            'Descripción / Nombre': descripcion,
            'Detalle (Marca/Código/Tipo)': detalle,
            'Categoría': categoria,
            'Unidad': unidad,
            'Stock Actual': Number(item.cantidad_actual || 0).toFixed(2),
            'Último Ingreso': formatDisplayDate(item.ultimo_ingreso)
        };
    });
};

/**
 * Exporta los items de stock a un archivo Excel.
 */
export const exportStockToExcel = (items: any[]) => {
    const normalizedData = normalizeStockData(items);

    // Crear el libro y la hoja
    const ws = XLSX.utils.json_to_sheet(normalizedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Actual");

    // Configurar anchos de columna para legibilidad
    const wscols = [
        { wch: 10 }, // Tipo
        { wch: 40 }, // Descripción / Nombre
        { wch: 30 }, // Detalle
        { wch: 20 }, // Categoría
        { wch: 10 }, // Unidad
        { wch: 15 }, // Stock Actual
        { wch: 15 }  // Último Ingreso
    ];
    ws['!cols'] = wscols;

    // Nombre del archivo con fecha ISO
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Stock_Actual_${dateStr}.xlsx`;

    // Escribir archivo
    XLSX.writeFile(wb, fileName);

    return { count: items.length, fileName };
};
