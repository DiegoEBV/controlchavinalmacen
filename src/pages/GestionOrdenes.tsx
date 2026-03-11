/* /src/pages/GestionOrdenes.tsx */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Table, Badge, Modal, Form, Row, Col, Spinner, Accordion } from 'react-bootstrap';
import { RiFileExcel2Line } from 'react-icons/ri';

import { getSolicitudesCompra, createOrdenCompra, getOrdenesCompra, getOrdenCompraById, getSolicitudCompraById, getOrdenesCompraExport } from '../services/comprasService';
import { getAllMovimientos } from '../services/almacenService';
import { SolicitudCompra, OrdenCompra, MovimientoAlmacen } from '../types';
import { exportSolicitudCompra } from '../utils/scExcelExport';
import { exportOrdenesCompra } from '../utils/ocExcelExport';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/PaginationControls';

const GestionOrdenes: React.FC = () => {
    const { selectedObra } = useAuth();
    const [allSolicitudes, setAllSolicitudes] = useState<SolicitudCompra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    // Estado del Modal
    const [showModal, setShowModal] = useState(false);
    const [selectedSC, setSelectedSC] = useState<SolicitudCompra | null>(null);
    const [exportingId, setExportingId] = useState<string | null>(null);

    // Entradas del Formulario
    const [proveedor, setProveedor] = useState('');
    const [manualOCNumber, setManualOCNumber] = useState('');
    const [fechaAtencion, setFechaAtencion] = useState('');
    const [nFactura, setNFactura] = useState('');
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [itemsToOrder, setItemsToOrder] = useState<any[]>([]);

    // Estado para Exportación
    const [fechaInicialExport, setFechaInicialExport] = useState('');
    const [fechaFinalExport, setFechaFinalExport] = useState(new Date().toISOString().split('T')[0]);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllSolicitudes([]);
            setOrdenes([]);
        }
    }, [selectedObra]);

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Órdenes Compra (Actualizaciones o Inserciones)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getOrdenCompraById(id)));
            const validItems = responses.filter(i => i !== null) as OrdenCompra[];
            setOrdenes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setOrdenes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'ordenes_compra', throttleMs: 2000 });

    // 2. Solicitudes Compra (Nuevas SCs o Actualizaciones a existentes)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getSolicitudCompraById(id)));
            const validItems = responses.filter(i => i !== null) as SolicitudCompra[];
            setAllSolicitudes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setAllSolicitudes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'solicitudes_compra', throttleMs: 2000 });

    const loadData = async () => {
        if (!selectedObra) return;
        const [scs, ocs, movs] = await Promise.all([
            getSolicitudesCompra(selectedObra.id),
            getOrdenesCompra(selectedObra.id),
            getAllMovimientos(selectedObra.id)
        ]);

        if (scs) setAllSolicitudes(scs);
        if (ocs) setOrdenes(ocs);
        if (movs) setHistorial(movs as any);
    };

    // Estado Derivado: SCs Disponibles
    const availableSolicitudes = useMemo(() => {
        return allSolicitudes.filter(sc => {
            if (!sc.detalles) return false;

            // Verificar si cada ítem en esta SC está totalmente comprado o cubierto
            const isFullyPurchased = sc.detalles.every(d => {
                // Si el ítem no se envía a OC (Skip OC), se considera "atendido" para esta vista
                if ((d as any).enviar_a_oc === false) return true;

                // Total comprometido en OCs
                const totalPurchased = ordenes.reduce((sum, oc) => {
                    const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                    return sum + (match ? match.cantidad : 0);
                }, 0);

                // Total cubierto exclusivamente por Caja Chica
                const totalCajaChica = historial
                    .filter(h =>
                        h.tipo === 'ENTRADA' &&
                        (h as any).destino_o_uso === 'COMPRA CAJA CHICA' &&
                        String(h.requerimiento_id) === String(sc.requerimiento_id) &&
                        (
                            (h.material_id && d.material_id === h.material_id) ||
                            (h.equipo_id && d.equipo_id === h.equipo_id) ||
                            (h.epp_id && d.epp_id === h.epp_id)
                        )
                    )
                    .reduce((sum, h) => sum + h.cantidad, 0);

                return (totalPurchased + totalCajaChica) >= d.cantidad;
            });

            return !isFullyPurchased;
        });
    }, [allSolicitudes, ordenes, historial]);

    const handleOpenCreate = (sc: SolicitudCompra) => {
        setSelectedSC(sc);
        // Reiniciar
        setManualOCNumber('');
        // Reiniciar
        setProveedor('');
        setFechaAtencion('');
        setNFactura('');
        setFechaVencimiento('');
        // Pre-llenar con ítems de la SC que sí van a OC
        const initialItems = sc.detalles?.filter(d => (d as any).enviar_a_oc !== false).map(d => {
            // Calcular lo que ya se ha comprado/comprometido en OCs anteriores
            const totalPurchased = ordenes.reduce((sum, oc) => {
                const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                return sum + (match ? match.cantidad : 0);
            }, 0);

            // Calcular ingresos exclusivamente por CAJA CHICA
            const totalCajaChica = historial
                .filter(h =>
                    h.tipo === 'ENTRADA' &&
                    (h as any).destino_o_uso === 'COMPRA CAJA CHICA' &&
                    String(h.requerimiento_id) === String(sc.requerimiento_id) &&
                    (
                        (h.material_id && d.material_id === h.material_id) ||
                        (h.equipo_id && d.equipo_id === h.equipo_id) ||
                        (h.epp_id && d.epp_id === h.epp_id)
                    )
                )
                .reduce((sum, h) => sum + h.cantidad, 0);

            // Lo pendiente = SC original - (comprometido en OCs) - (cubierto por caja chica)
            const remaining = Math.max(0, d.cantidad - totalPurchased - totalCajaChica);

            return {
                detalle_sc_id: d.id,
                material_desc: d.material?.descripcion || d.equipo?.nombre || d.epp?.descripcion || 'Sin descripción',
                cantidad_sc: d.cantidad,
                unidad: d.unidad || '-',
                cantidad_pendiente: remaining,
                cantidad_compra: remaining,
                precio_unitario: 0,
                selected: remaining > 0,
                cantidad_caja_chica: totalCajaChica  // Solo lo genuinamente de Caja Chica
            };
        }) || [];
        setItemsToOrder(initialItems);
        setShowModal(true);
    };

    const toggleSelectAll = (checked: boolean) => {
        setItemsToOrder(prev => prev.map(it => ({ ...it, selected: checked })));
    };

    const isAllSelected = itemsToOrder.length > 0 && itemsToOrder.every(it => it.selected);

    const handleSaveOC = async () => {
        if (!selectedSC || !proveedor || !manualOCNumber) return alert("Ingrese proveedor y número de OC");

        const selectedItems = itemsToOrder.filter(i => i.selected && i.cantidad_compra > 0).map(i => ({
            detalle_sc_id: i.detalle_sc_id,
            cantidad: parseFloat(i.cantidad_compra),
            precio_unitario: parseFloat(i.precio_unitario) || 0
        }));

        if (selectedItems.length === 0) return alert("Seleccione al menos un item");

        try {
            const ocPayload = {
                sc_id: selectedSC.id,
                numero_oc: manualOCNumber,
                proveedor,
                fecha_oc: new Date().toISOString().split('T')[0],
                fecha_aproximada_atencion: fechaAtencion || undefined,
                n_factura: nFactura || undefined,
                fecha_vencimiento: fechaVencimiento || undefined,
                estado: 'Emitida' as const
            };

            await createOrdenCompra(ocPayload, selectedItems);
            alert("Orden de Compra creada!");
            setShowModal(false);
            setProveedor('');
            setManualOCNumber('');
            setFechaAtencion('');
            setNFactura('');
            setFechaVencimiento('');
            // Confiaremos en el tiempo real + actualización optimista local si es necesario, pero el tiempo real suele ser lo suficientemente rápido.
            // Realmente, para retroalimentación inmediata de nuestra PROPIA acción, tal vez recargar o actualización optimista.
            // El tiempo real también lo capturará.
            loadData(); // Mantener por seguridad
        } catch (e: any) {
            console.error(e);
            alert("Error creando OC: " + e.message);
        }
    };

    const handleExportSC = async (sc: SolicitudCompra) => {
        try {
            setExportingId(sc.id);
            await exportSolicitudCompra(sc);
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            setExportingId(null);
        }
    };

    const handleExportOC = async () => {
        if (!selectedObra) return alert("Seleccione una obra");
        if (!fechaInicialExport || !fechaFinalExport) return alert("Seleccione un rango de fechas para exportar");
        if (fechaInicialExport > fechaFinalExport) return alert("La fecha inicial no puede ser mayor que la final");

        setIsExporting(true);
        try {
            const dataToExport = await getOrdenesCompraExport(selectedObra.id, fechaInicialExport, fechaFinalExport);
            if (dataToExport.length === 0) {
                alert("No hay órdenes de compra en el rango de fechas seleccionado.");
                return;
            }
            await exportOrdenesCompra(dataToExport, fechaInicialExport, fechaFinalExport);
        } catch (error) {
            console.error("Export OC failed:", error);
        } finally {
            setIsExporting(true);
        }
    };

    const { currentPage: ocPage, totalPages: ocTotalPages, totalItems: ocTotalItems, pageSize: ocPageSize, paginatedItems: pagedOrdenes, goToPage: goToOcPage } = usePagination(ordenes, 15);

    const { currentPage: availablePage, totalPages: availableTotalPages, totalItems: availableTotalItems, pageSize: availablePageSize, paginatedItems: pagedAvailableSolicitudes, goToPage: goToAvailablePage } = usePagination(availableSolicitudes, 10);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Gestión de Ordenes de Compra (OC)</h2>
            </div>

            <Row>
                <Col xs={12} className="mb-4">
                    <Card className="custom-card">
                        <Card.Header className="bg-white fw-bold">Solicitudes Disponibles</Card.Header>
                        <Table hover responsive className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>SC #</th>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedAvailableSolicitudes.map(sc => (
                                    <tr key={sc.id}>
                                        <td>{sc.numero_sc}</td>
                                        <td>{sc.fecha_sc}</td>
                                        <td><Badge bg="info">{sc.estado}</Badge></td>
                                        <td>
                                            <Button size="sm" variant="success" onClick={() => handleOpenCreate(sc)}>Crear OC</Button>
                                            <Button
                                                size="sm"
                                                variant="outline-success"
                                                className="ms-2"
                                                onClick={() => handleExportSC(sc)}
                                                disabled={exportingId === sc.id}
                                            >
                                                {exportingId === sc.id ? (
                                                    <Spinner animation="border" size="sm" />
                                                ) : (
                                                    <RiFileExcel2Line size={16} />
                                                )}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {availableSolicitudes.length === 0 && (
                                    <tr><td colSpan={4} className="text-center text-muted">No hay solicitudes disponibles.</td></tr>
                                )}
                            </tbody>
                        </Table>
                        {availableTotalPages > 1 && (
                            <div className="px-3 pb-3 border-top pt-2 mt-auto">
                                <PaginationControls
                                    currentPage={availablePage}
                                    totalPages={availableTotalPages}
                                    totalItems={availableTotalItems}
                                    pageSize={availablePageSize}
                                    onPageChange={goToAvailablePage}
                                />
                            </div>
                        )}
                    </Card>
                </Col>

                <Col md={12}>
                    <div className="d-flex justify-content-between align-items-center mt-4 mb-2">
                        <h4 className="text-secondary mb-0">Ordenes Emitidas</h4>
                        <div className="d-flex align-items-center gap-2">
                            <Form.Control
                                type="date"
                                size="sm"
                                value={fechaInicialExport}
                                onChange={e => setFechaInicialExport(e.target.value)}
                                title="Fecha Inicial"
                            />
                            <span className="text-muted">a</span>
                            <Form.Control
                                type="date"
                                size="sm"
                                value={fechaFinalExport}
                                onChange={e => setFechaFinalExport(e.target.value)}
                                title="Fecha Final"
                            />
                            <Button
                                size="sm"
                                variant="outline-success"
                                onClick={handleExportOC}
                                disabled={isExporting || !fechaInicialExport || !fechaFinalExport}
                                className="d-flex align-items-center gap-1 text-nowrap"
                            >
                                {isExporting ? <Spinner animation="border" size="sm" /> : <RiFileExcel2Line size={16} />}
                                Exportar
                            </Button>
                        </div>
                    </div>

                    <Accordion defaultActiveKey="0" flush className="custom-card p-0 overflow-hidden mt-3">
                        {pagedOrdenes.map((oc, idx) => {
                            const detalles = oc.detalles || [];
                            const subtotalOC = detalles.reduce((sum, d) => sum + (d.cantidad * (d.precio_unitario || 0)), 0);
                            const igvOC = subtotalOC * 0.18;
                            const totalOC = subtotalOC + igvOC;

                            return (
                                <Accordion.Item eventKey={String(idx)} key={oc.id}>
                                    <Accordion.Header>
                                        <div className="d-flex flex-column flex-md-row w-100 justify-content-between align-items-center me-3 gap-2">
                                            <div className="text-center text-md-start">
                                                <strong className="text-success" style={{ fontSize: '1.1em' }}>{oc.numero_oc}</strong>
                                                <span className="mx-2 text-muted d-none d-md-inline">|</span>
                                                <div className="d-md-inline d-block">
                                                    <span className="fw-bold">{oc.proveedor}</span>
                                                </div>
                                                <div className="small text-muted mt-1">
                                                    SC Ref: <strong>{(oc as any).sc?.numero_sc || '-'}</strong> ({oc.fecha_oc})
                                                </div>
                                            </div>
                                            <div className="d-flex align-items-center justify-content-center justify-content-md-start gap-4 mt-2 mt-md-0">
                                                <div className="text-end">
                                                    <small className="d-block text-muted" style={{ fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total OC + IGV</small>
                                                    <strong className="text-success fs-6">S/. {totalOC.toFixed(2)}</strong>
                                                </div>
                                                
                                                <div className="text-center px-3 border-start text-muted">
                                                    <small className="d-block text-muted" style={{ fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fechas y Docs</small>
                                                    <div style={{ fontSize: '0.85em' }}>
                                                        <i className="bi bi-calendar-check me-1"></i> {oc.fecha_aproximada_atencion || 'S/F Aten.'}
                                                        <span className="mx-2">|</span>
                                                        <i className="bi bi-receipt me-1"></i> Fac: <strong>{oc.n_factura || '-'}</strong>
                                                    </div>
                                                </div>

                                                <Badge bg="secondary" className="px-3 py-2 fs-6 rounded-pill">{oc.estado}</Badge>
                                            </div>
                                        </div>
                                    </Accordion.Header>
                                    <Accordion.Body>
                                        <div className="p-2">
                                            <h6 className="text-muted fw-bold mb-3 ps-2">
                                                <i className="bi bi-box-seam me-1 mt-1"></i> Detalle de Materiales
                                            </h6>
                                            <Table size="sm" hover responsive className="table-borderless-custom mb-0" style={{ backgroundColor: '#fff', borderRadius: '12px' }}>
                                                <thead style={{ backgroundColor: '#f8fafc' }}>
                                                    <tr>
                                                        <th style={{ width: 40, borderTopLeftRadius: '12px' }} className="py-3">#</th>
                                                        <th className="py-3">Descripción</th>
                                                        <th className="text-center py-3" style={{ width: 80 }}>Und</th>
                                                        <th className="text-end py-3" style={{ width: 100 }}>Cantidad</th>
                                                        <th className="text-end py-3" style={{ width: 120 }}>P.U. (S/.)</th>
                                                        <th className="text-end py-3" style={{ width: 130, borderTopRightRadius: '12px' }}>Sub Total (S/.)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detalles.map((det, detailIdx) => {
                                                        const desc = det.detalle_sc?.material?.descripcion
                                                            || det.detalle_sc?.equipo?.nombre
                                                            || det.detalle_sc?.epp?.descripcion
                                                            || 'Sin descripción';
                                                        const unidad = det.detalle_sc?.unidad || '-';
                                                        const pu = det.precio_unitario || 0;
                                                        const subtotal = det.cantidad * pu;

                                                        return (
                                                            <tr key={det.id}>
                                                                <td className="text-center text-muted fw-bold">{detailIdx + 1}</td>
                                                                <td className="fw-bold">{desc}</td>
                                                                <td className="text-center text-muted">{unidad}</td>
                                                                <td className="text-end fw-bold">{Number(det.cantidad).toFixed(2)}</td>
                                                                <td className="text-end text-muted">S/. {pu.toFixed(2)}</td>
                                                                <td className="text-end fw-bold text-success">S/. {subtotal.toFixed(2)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td colSpan={5} className="text-end text-muted fw-bold py-2">SUBTOTAL:</td>
                                                        <td className="text-end fw-bold text-dark fs-6 py-2">S/. {subtotalOC.toFixed(2)}</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={5} className="text-end text-muted fw-bold py-2">IGV (18%):</td>
                                                        <td className="text-end fw-bold text-dark fs-6 py-2">S/. {igvOC.toFixed(2)}</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={5} className="text-end text-muted fw-bold py-3" style={{ borderBottomLeftRadius: '12px' }}>TOTAL:</td>
                                                        <td className="text-end fw-bold text-success fs-6 py-3" style={{ borderBottomRightRadius: '12px' }}>S/. {totalOC.toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </Table>
                                        </div>
                                    </Accordion.Body>
                                </Accordion.Item>
                            );
                        })}
                        {pagedOrdenes.length === 0 && <p className="text-center text-muted p-4">No se encontraron órdenes de compra emitidas.</p>}
                    </Accordion>
                    <PaginationControls currentPage={ocPage} totalPages={ocTotalPages} totalItems={ocTotalItems} pageSize={ocPageSize} onPageChange={goToOcPage} />
                </Col>
            </Row>

            <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Crear OC para {selectedSC?.numero_sc}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                           <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Número de Orden de Compra</Form.Label>
                                <Form.Control
                                    value={manualOCNumber}
                                    onChange={e => setManualOCNumber(e.target.value)}
                                    placeholder="Ej: OC-001-2026"
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Proveedor</Form.Label>
                                <Form.Control
                                    value={proveedor}
                                    onChange={e => setProveedor(e.target.value)}
                                    placeholder="Nombre del proveedor"
                                />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Fecha Aproximada de Atención</Form.Label>
                                <Form.Control
                                    type="date"
                                    value={fechaAtencion}
                                    onChange={e => setFechaAtencion(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                    </Row>

                    <Card className="mb-4 bg-light">
                        <Card.Body className="p-3">
                            <h6 className="text-muted fw-bold mb-3"><i className="bi bi-receipt"></i> Información de Facturación (Opcional)</h6>
                            <Row>
                                <Col xs={12} md={6}>
                                    <Form.Group>
                                        <Form.Label className="text-sm">N° Factura</Form.Label>
                                        <Form.Control
                                            value={nFactura}
                                            onChange={e => setNFactura(e.target.value)}
                                            placeholder="Ej: F001-000123"
                                        />
                                    </Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                    <Form.Group>
                                        <Form.Label className="text-sm">Fecha Vencimiento</Form.Label>
                                        <Form.Control
                                            type="date"
                                            value={fechaVencimiento}
                                            onChange={e => setFechaVencimiento(e.target.value)}
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>

                    <Table responsive hover className="table-borderless-custom align-middle">
                        <thead className="bg-light">
                            <tr>
                                <th style={{ width: '50px' }}>
                                    <Form.Check
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={e => toggleSelectAll(e.target.checked)}
                                    />
                                </th>
                                <th style={{ width: '40%' }}>Descripción del Item</th>
                                <th style={{ width: '15%' }}>Cant. SC</th>
                                <th style={{ width: '20%' }}>A Comprar</th>
                                <th style={{ width: '20%' }}>P. Unit S/.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToOrder.map((it, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <Form.Check
                                            type="checkbox"
                                            checked={it.selected}
                                            onChange={e => {
                                                const newItems = [...itemsToOrder];
                                                newItems[idx].selected = e.target.checked;
                                                setItemsToOrder(newItems);
                                            }}
                                        />
                                    </td>
                                    <td className="fw-medium text-dark">{it.material_desc}</td>
                                    <td>
                                        <div className="d-flex flex-column text-muted">
                                            <span className="fw-bold">{Number(it.cantidad_sc).toFixed(2)} <small className="text-secondary fw-normal ms-1">{it.unidad}</small></span>
                                            {it.cantidad_caja_chica > 0 && (
                                                <small className="text-danger fw-bold" style={{ fontSize: '0.7em', lineHeight: 1.1 }}>
                                                    *Caja Chica: {it.cantidad_caja_chica}
                                                </small>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="input-group">
                                            <Form.Control
                                                type="number"
                                                value={it.cantidad_compra}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const newItems = [...itemsToOrder];
                                                    newItems[idx].cantidad_compra = parseFloat(val.toFixed(2));
                                                    setItemsToOrder(newItems);
                                                }}
                                                className="bg-light bg-opacity-10"
                                            />
                                            <span className="input-group-text bg-white text-muted">{it.unidad}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <Form.Control
                                            type="number"
                                            value={it.precio_unitario}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const newItems = [...itemsToOrder];
                                                newItems[idx].precio_unitario = val;
                                                setItemsToOrder(newItems);
                                            }}
                                            placeholder="0.00"
                                            className="bg-light bg-opacity-10"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="success" onClick={handleSaveOC}>Generar Orden</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionOrdenes;
