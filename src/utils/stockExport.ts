import * as XLSX from 'xlsx';

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

        if (item.materiales) {
            tipo = 'Material';
            descripcion = item.materiales.descripcion || '-';
            detalle = '-';
            categoria = item.materiales.categoria || '-';
            unidad = item.materiales.unidad || '-';
        } else if (item.equipos) {
            tipo = 'Equipo';
            descripcion = item.equipos.nombre || '-';
            detalle = `${item.equipos.marca || ''} [${item.equipos.codigo || ''}]`.trim();
            categoria = 'Equipo';
            unidad = 'UND';
        } else if (item.epps_c) {
            tipo = 'EPP';
            descripcion = item.epps_c.descripcion || '-';
            detalle = `${item.epps_c.tipo || ''} [${item.epps_c.codigo || ''}]`.trim();
            categoria = item.epps_c.tipo || '-';
            unidad = item.epps_c.unidad || '-';
        }

        return {
            'Tipo': tipo,
            'Descripción / Nombre': descripcion,
            'Detalle (Marca/Código/Tipo)': detalle,
            'Categoría': categoria,
            'Unidad': unidad,
            'Stock Actual': Number(item.cantidad_actual || 0).toFixed(2),
            'Último Ingreso': item.ultimo_ingreso ? new Date(item.ultimo_ingreso).toLocaleDateString() : '-'
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
