import { OrdenCompra } from '../types';

export const exportOrdenesCompra = async (ordenes: OrdenCompra[], fechaInicial: string, fechaFinal: string) => {
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
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Ordenes de Compra');

        // Configurar columnas con anchos fijos
        worksheet.columns = [
            { header: 'N° OC', key: 'numero_oc', width: 20 },
            { header: 'Proveedor', key: 'proveedor', width: 40 },
            { header: 'N° SC Ref.', key: 'sc_ref', width: 20 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Fecha OC', key: 'fecha_oc', width: 15 },
            { header: 'F. Est. Atención', key: 'fecha_atencion', width: 20 },
            { header: 'N° Factura', key: 'n_factura', width: 20 },
            { header: 'F. Vencimiento', key: 'fecha_vencimiento', width: 20 },
            { header: 'Total S/.', key: 'total_monto', width: 15 },
        ];

        // Estilos para la cabecera
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF000000' } // Negro
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Añadir filtro automático a la primera fila
        worksheet.autoFilter = {
            from: 'A1',
            to: 'I1',
        };

        // Llenar datos
        ordenes.forEach(oc => {
            // Calcular el monto total de la OC sumando los detalles (cantidad * precio_unitario)
            const totalMonto = oc.detalles?.reduce((sum, d) => sum + (d.cantidad * (d.precio_unitario || 0)), 0) || 0;

            const row = worksheet.addRow({
                numero_oc: oc.numero_oc,
                proveedor: oc.proveedor,
                sc_ref: (oc as any).sc?.numero_sc || '-',
                estado: oc.estado,
                fecha_oc: oc.fecha_oc,
                fecha_atencion: oc.fecha_aproximada_atencion || '-',
                n_factura: oc.n_factura || '-',
                fecha_vencimiento: oc.fecha_vencimiento || '-',
                total_monto: totalMonto,
            });

            // Aplicar formato de moneda a la columna de Total S/.
            row.getCell('total_monto').numFmt = '"S/."#,##0.00';
        });

        // Configurar nombre del archivo
        const fileName = `Ordenes_Compra_${fechaInicial}_al_${fechaFinal}.xlsx`;

        // Descargar
        const outBuffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, fileName);

    } catch (error: any) {
        console.error("Error exporting OC Excel:", error);
        alert(`Error al exportar las Órdenes de Compra: ${error.message || error}`);
        throw error;
    }
};
