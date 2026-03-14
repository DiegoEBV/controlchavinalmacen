import React from 'react';
import { PedidoSalida, PedidoSalidaDetalle } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';

interface ValePrintableProps {
    pedido: PedidoSalida;
    items: PedidoSalidaDetalle[];
    format?: 'A4' | 'TICKET';
    isCapturing?: boolean;
}

const ValePrintable: React.FC<ValePrintableProps> = ({ pedido, items, format = 'A4', isCapturing = false }) => {
    const ITEMS_PER_PAGE = format === 'A4' ? 27 : 15; // CANTIDAD DE ITEMS EN EL FORMATO DE PEDIDO

    const getItemInfo = (item: PedidoSalidaDetalle) => {
        let desc = '';
        let unit = '';
        if (item.material) {
            desc = item.material.descripcion;
            unit = item.material.unidad;
        } else if (item.equipo) {
            desc = `${item.equipo.nombre} [${item.equipo.codigo}]`;
            unit = 'UND';
        } else if (item.epp) {
            desc = `${item.epp.descripcion} [${item.epp.codigo}]`;
            unit = item.epp.unidad;
        }
        return { desc, unit };
    };

    const commonStyles = {
        fontFamily: "'Helvetica', 'Arial', sans-serif",
        lineHeight: '1.1',
        color: '#000000',
        WebkitFontSmoothing: 'antialiased',
        fontWeight: 'normal'
    };

    if (format === 'TICKET') {
        return (
            <div id="printable-vale-content" className="printable-ticket bg-white text-dark" style={{ ...commonStyles, width: '58mm', padding: '4mm', margin: '0 auto', fontSize: '8.5pt' }}>
                <div className="text-center mb-2">
                    <h5 className="fw-bold mb-0" style={{ fontSize: '9.5pt', fontWeight: 'bold' }}>VALE DE SALIDA</h5>
                    <small style={{ fontSize: '7pt' }}>Control de Almacén</small>
                </div>

                <div className="mb-2 border-bottom pb-1">
                    <div className="d-flex justify-content-between" style={{ fontWeight: 'bold', fontSize: '7.5pt' }}>
                        <span>VALE:</span>
                        <span>{pedido.numero_vale}</span>
                    </div>
                    <div className="d-flex justify-content-between" style={{ fontSize: '7.5pt' }}>
                        <span>FECHA:</span>
                        <span>{formatDisplayDate(pedido.created_at)}</span>
                    </div>
                </div>

                <div className="mb-2" style={{ fontSize: '6.5pt', lineHeight: '1.2' }}>
                    <div><strong>DEP:</strong> {pedido.bloque?.nombre_bloque || 'N/A'}</div>
                    <div><strong>DEST:</strong> {pedido.destino_o_uso || 'S/D'}</div>
                    <div className="text-truncate"><strong>RET:</strong> {pedido.solicitante_nombre || 'S/N'}</div>
                </div>

                <table className="table table-sm mb-2" style={{ fontSize: '5.5pt', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr className="border-bottom border-dark">
                            <th className="text-start" style={{ padding: '2px 0' }}>Item</th>
                            <th className="text-end" style={{ padding: '2px 0' }}>Cant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => {
                            const { desc } = getItemInfo(item);
                            return (
                                <tr key={idx} className="border-bottom border-light">
                                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{desc}</td>
                                    <td className="text-end" style={{ verticalAlign: 'top', fontWeight: 'bold' }}>{item.cantidad_solicitada}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="text-center mt-4">
                    <div className="border-top border-dark pt-2 mb-4" style={{ marginTop: '25mm' }}>
                        <small style={{ fontSize: '8pt' }}>Firma Recibido</small>
                        <div style={{ fontSize: '7pt', color: '#666' }}>({pedido.solicitante_nombre || '...'})</div>
                    </div>
                    <div className="border-top border-dark pt-2" style={{ marginTop: '10mm' }}>
                        <small style={{ fontSize: '8pt' }}>V°B° Almacén</small>
                    </div>
                </div>

                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        .printable-ticket, .printable-ticket * { visibility: visible; }
                        .printable-ticket {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 58mm !important;
                            border: none !important;
                            box-shadow: none !important;
                            padding: 2mm !important;
                        }
                        @page { size: 58mm auto; margin: 0; }
                        .no-print, .modal-header, .modal-footer, .modal-backdrop { display: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    const pages = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
        pages.push(items.slice(i, i + ITEMS_PER_PAGE));
    }

    return (
        <div id="printable-vale-content" className="a4-container" style={commonStyles}>
            {pages.map((pageItems, pageIdx) => (
                <div
                    key={pageIdx}
                    className={`printable-vale p-4 bg-white text-dark ${isCapturing ? '' : 'mb-4 shadow'}`}
                    style={{
                        width: '210mm',
                        height: '297mm',
                        margin: '0 auto',
                        border: isCapturing ? 'none' : '1px solid #eee',
                        boxSizing: 'border-box',
                        position: isCapturing ? 'static' : 'relative',
                        pageBreakAfter: 'always',
                        backgroundColor: '#ffffff'
                    }}
                >
                    {/* Header */}
                    <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-dark pb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: '1' }}>
                            <h3 className="fw-bold mb-1" style={{ fontSize: '14pt', fontWeight: 'bold', margin: '0' }}>VALE DE SALIDA</h3>
                            <p className="text-muted mb-0" style={{ fontSize: '8pt', margin: '0' }}>Control de Almacén</p>
                        </div>
                        <div className="text-end" style={{ textAlign: 'right', flex: '1' }}>
                            <h4 className="text-primary fw-bold mb-0" style={{ fontSize: '12pt', fontWeight: 'bold', margin: '0' }}>{pedido.numero_vale}</h4>
                            <p className="small mb-0" style={{ fontSize: '8pt', margin: '0' }}>{formatDisplayDate(pedido.created_at)}</p>
                            <small className="text-muted" style={{ fontSize: '7pt' }}>Pág. {pageIdx + 1} de {pages.length}</small>
                        </div>
                    </div>

                    {/* Info Grid (Only on first page) */}
                    {pageIdx === 0 && (
                        <div className="mb-3" style={{ fontSize: '9pt', display: 'flex', flexWrap: 'wrap', width: '100%' }}>
                            <div style={{ width: '50%', marginBottom: '8px', display: 'inline-block', verticalAlign: 'top' }}>
                                <label className="text-muted small d-block" style={{ fontSize: '7.5pt', marginBottom: '1px' }}>Solicitante (Retirador)</label>
                                <span style={{ fontWeight: 'bold', fontSize: '9pt' }}>{pedido.solicitante_nombre ? `${pedido.solicitante_nombre} (DNI: ${pedido.solicitante_dni || 'N/A'})` : 'S/N'}</span>
                            </div>
                            <div style={{ width: '50%', marginBottom: '8px', display: 'inline-block', verticalAlign: 'top' }}>
                                <label className="text-muted small d-block" style={{ fontSize: '7.5pt', marginBottom: '1px' }}>Encargado Responsable</label>
                                <span style={{ fontWeight: 'bold', fontSize: '9pt' }}>{pedido.encargado?.nombre || 'S/N'}</span>
                            </div>
                            <div style={{ width: '50%', marginBottom: '8px', display: 'inline-block', verticalAlign: 'top' }}>
                                <label className="text-muted small d-block" style={{ fontSize: '7.5pt', marginBottom: '1px' }}>Frente / Bloque</label>
                                <span style={{ fontWeight: 'bold', fontSize: '9pt' }}>{pedido.bloque?.nombre_bloque || 'S/N'}</span>
                            </div>
                            <div style={{ width: '50%', marginBottom: '8px', display: 'inline-block', verticalAlign: 'top' }}>
                                <label className="text-muted small d-block" style={{ fontSize: '7.5pt', marginBottom: '1px' }}>Tercero / Empresa</label>
                                <span style={{ fontWeight: 'bold', fontSize: '9pt' }}>{pedido.tercero?.nombre_completo || 'CASA'}</span>
                            </div>
                            <div style={{ width: '100%', borderTop: '1px solid #dee2e6', paddingTop: '6px', marginTop: '2px' }}>
                                <label className="text-muted small d-block" style={{ fontSize: '7.5pt', marginBottom: '1px' }}>Destino / Uso</label>
                                <span style={{ fontSize: '9pt' }}>{pedido.destino_o_uso || 'No especificado'}</span>
                            </div>
                        </div>
                    )}

                    {/* Items Table */}
                    <table className="table table-bordered align-middle mb-2" style={{ fontSize: '9pt', width: '100%', borderCollapse: 'collapse' }}>
                        <thead className="table-light">
                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                                <th style={{ width: '60%', padding: '8px' }}>Descripción del Bien</th>
                                <th className="text-center" style={{ padding: '8px' }}>Cant. Sol.</th>
                                <th className="text-center" style={{ padding: '8px' }}>Cant. Ent.</th>
                                <th className="text-center" style={{ padding: '8px' }}>Und.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((item, idx) => {
                                const { desc, unit } = getItemInfo(item);
                                return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                                        <td style={{ padding: '4px 10px' }}>{desc}</td>
                                        <td className="text-center" style={{ fontWeight: 'bold', padding: '4px' }}>{item.cantidad_solicitada}</td>
                                        <td className="text-center text-primary" style={{ fontWeight: 'bold', padding: '4px' }}>
                                            {pedido.estado === 'Pendiente' ? '___' : item.cantidad_entregada}
                                        </td>
                                        <td className="text-center small" style={{ padding: '4px' }}>{unit}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Signatures */}
                    <div className="row text-center mt-auto pb-4" style={{ position: 'absolute', bottom: '25mm', left: '15mm', right: '15mm', display: 'flex', width: '180mm' }}>
                        <div style={{ width: '33.3%', textAlign: 'center' }}>
                            <div className="border-top border-dark pt-2 mx-1">
                                <small className="d-block" style={{ fontSize: '7.5pt', fontWeight: 'bold' }}>Firma Solicitante</small>
                                <div style={{ fontSize: '7pt' }} className="text-muted text-truncate">{pedido.solicitante_nombre || '...'}</div>
                            </div>
                        </div>
                        <div style={{ width: '33.3%', textAlign: 'center' }}>
                            <div className="border-top border-dark pt-2 mx-1">
                                <small className="d-block" style={{ fontSize: '7.5pt', fontWeight: 'bold' }}>Almacén (Despacho)</small>
                            </div>
                        </div>
                        <div style={{ width: '33.3%', textAlign: 'center' }}>
                            <div className="border-top border-dark pt-2 mx-1">
                                <small className="d-block" style={{ fontSize: '7.5pt', fontWeight: 'bold' }}>V°B° Encargado</small>
                                <div style={{ fontSize: '7pt' }} className="text-muted text-truncate">{pedido.encargado?.nombre || '...'}</div>
                            </div>
                        </div>
                    </div>

                    <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            .a4-container, .a4-container * { visibility: visible; }
                            .a4-container {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 100% !important;
                                background: white !important;
                            }
                            .printable-vale {
                                border: none !important;
                                margin: 0 !important;
                                padding: 15mm !important;
                                box-shadow: none !important;
                                visibility: visible !important;
                            }
                            @page { size: A4; margin: 0; }
                            .no-print, .modal-header, .modal-footer, .modal-backdrop { display: none !important; }
                        }
                    `}</style>
                </div>
            ))}
        </div>
    );
};

export default ValePrintable;
