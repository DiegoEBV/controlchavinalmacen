/* /src/pages/GestionOrdenes.tsx */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Table, Badge, Modal, Form, Row, Col, Spinner, Accordion } from 'react-bootstrap';
import { RiFileExcel2Line } from 'react-icons/ri';

import { getSolicitudesCompra, createOrdenCompra, getOrdenesCompra, getOrdenCompraById, getSolicitudCompraById, getOrdenesCompraExport, updateOrdenCompra } from '../services/comprasService';
import { getSunatExchangeRate } from '../services/sunatService';
import { FaEdit } from 'react-icons/fa';
import { getAllMovimientos } from '../services/almacenService';
import { SolicitudCompra, OrdenCompra, MovimientoAlmacen } from '../types';
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
    const [selectedSCs, setSelectedSCs] = useState<SolicitudCompra[]>([]);
    const [selectedSCIds, setSelectedSCIds] = useState<Set<string>>(new Set());

    // Entradas del Formulario
    const [proveedor, setProveedor] = useState('');
    const [manualOCNumber, setManualOCNumber] = useState('');
    const [fechaAtencion, setFechaAtencion] = useState('');
    const [nFactura, setNFactura] = useState('');
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [itemsToOrder, setItemsToOrder] = useState<any[]>([]);
    const [moneda, setMoneda] = useState<'MN' | 'ME'>('MN');
    const [tipoCambio, setTipoCambio] = useState<number>(1);
    const [isFetchingTC, setIsFetchingTC] = useState(false);
    const [showOnlySelected, setShowOnlySelected] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingOC, setEditingOC] = useState<OrdenCompra | null>(null);
    const [isOCAttended, setIsOCAttended] = useState(false);

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

    const handleOpenCreateMulti = () => {
        const scs = allSolicitudes.filter(sc => selectedSCIds.has(sc.id));
        if (scs.length === 0) return alert("Seleccione al menos una solicitud");

        setSelectedSCs(scs);
        setManualOCNumber('');
        setProveedor('');
        setFechaAtencion('');
        setNFactura('');
        setFechaVencimiento('');
        setMoneda('MN');
        setTipoCambio(1);

        const allItems: any[] = [];
        scs.forEach(sc => {
            const scItems = sc.detalles?.filter(d => (d as any).enviar_a_oc !== false).map(d => {
                const totalPurchased = ordenes.reduce((sum, oc) => {
                    const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                    return sum + (match ? match.cantidad : 0);
                }, 0);

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

                const remaining = Math.max(0, d.cantidad - totalPurchased - totalCajaChica);

                return {
                    sc_id: sc.id,
                    numero_sc: sc.numero_sc,
                    detalle_sc_id: d.id,
                    material_desc: d.material?.descripcion || d.equipo?.nombre || d.epp?.descripcion || 'Sin descripción',
                    cantidad_sc: d.cantidad,
                    unidad: d.unidad || '-',
                    cantidad_pendiente: remaining,
                    cantidad_compra: remaining,
                    precio_unitario: 0,
                    selected: remaining > 0.01,
                    cantidad_caja_chica: totalCajaChica
                };
            }).filter(it => it.cantidad_pendiente > 0.01) || [];
            allItems.push(...scItems);
        });

        setItemsToOrder(allItems);
        setShowModal(true);
    };

    const handleFetchTC = async () => {
        setIsFetchingTC(true);
        try {
            const tc = await getSunatExchangeRate();
            if (tc > 0) {
                setTipoCambio(tc);
            } else {
                alert("No se pudo obtener el tipo de cambio automáticamente. Ingrese el valor manualmente.");
            }
        } finally {
            setIsFetchingTC(false);
        }
    };

    const handleMonedaChange = (newMoneda: 'MN' | 'ME') => {
        setMoneda(newMoneda);
        if (newMoneda === 'ME' && tipoCambio === 1) {
            handleFetchTC();
        }
    };

    const toggleSelectSC = (scId: string) => {
        setSelectedSCIds(prev => {
            const next = new Set(prev);
            if (next.has(scId)) next.delete(scId);
            else next.add(scId);
            return next;
        });
    };

    const toggleSelectAllSCs = (checked: boolean) => {
        if (checked) {
            setSelectedSCIds(new Set(availableSolicitudes.map(sc => sc.id)));
        } else {
            setSelectedSCIds(new Set());
        }
    };

    const isAllSCsSelected = availableSolicitudes.length > 0 && availableSolicitudes.every(sc => selectedSCIds.has(sc.id));

    const toggleSelectAll = (checked: boolean) => {
        setItemsToOrder(prev => prev.map(it => ({ ...it, selected: checked })));
    };

    const isAllSelected = itemsToOrder.length > 0 && itemsToOrder.every(it => it.selected);

    const handleSaveOC = async () => {
        if (selectedSCs.length === 0 || !proveedor || !manualOCNumber) return alert("Ingrese proveedor y número de OC");

        const selectedItems = itemsToOrder.filter(i => i.selected && i.cantidad_compra > 0).map(i => ({
            detalle_sc_id: i.detalle_sc_id,
            cantidad: parseFloat(i.cantidad_compra),
            precio_unitario: moneda === 'ME' 
                ? (parseFloat(i.precio_unitario) || 0) * tipoCambio 
                : (parseFloat(i.precio_unitario) || 0),
            moneda: moneda,
            tipo_cambio: tipoCambio
        }));

        if (selectedItems.length === 0) return alert("Seleccione al menos un item");

        try {
            const ocPayload = {
                sc_id: selectedSCs[0].id, // Referencia a la primera SC
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
            setSelectedSCIds(new Set());
            setProveedor('');
            setManualOCNumber('');
            setFechaAtencion('');
            setNFactura('');
            setFechaVencimiento('');
            // Confiaremos en el tiempo real + actualización optimista local si es necesario, pero el tiempo real suele ser lo suficientemente rápido.
            loadData(); // Mantener por seguridad
        } catch (e: any) {
            console.error(e);
            alert("Error creando OC: " + e.message);
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
            setIsExporting(false);
        }
    };

    const handleOpenEdit = (oc: OrdenCompra) => {
        // Verificar si la OC tiene algún ítem ya atendido en almacén
        const attended = oc.detalles?.some(d => {
            const consumed = historial
                .filter(h =>
                    h.tipo === 'ENTRADA' &&
                    String(h.requerimiento_id) === String((oc as any).sc?.requerimiento_id) &&
                    (
                        (d.detalle_sc?.material_id && h.material_id === d.detalle_sc.material_id) ||
                        (d.detalle_sc?.equipo_id && h.equipo_id === d.detalle_sc.equipo_id) ||
                        (d.detalle_sc?.epp_id && h.epp_id === d.detalle_sc.epp_id)
                    ) &&
                    (h as any).destino_o_uso !== 'COMPRA CAJA CHICA'
                )
                .reduce((sum, h) => sum + h.cantidad, 0);
            return consumed > 0.01 || (d.detalle_sc as any)?.estado === 'Atendido' || (d.detalle_sc as any)?.estado === 'Parcial';
        });

        setIsOCAttended(!!attended);
        setEditingOC(oc);
        setProveedor(oc.proveedor || '');
        setManualOCNumber(oc.numero_oc);
        setFechaAtencion(oc.fecha_aproximada_atencion || '');
        setNFactura(oc.n_factura || '');
        setFechaVencimiento(oc.fecha_vencimiento || '');
        
        // Recuperar moneda y TC del primer item (asumimos consistencia en la OC)
        const firstItem = oc.detalles?.[0];
        const recoveredMoneda = (firstItem as any)?.moneda || 'MN';
        const recoveredTC = (firstItem as any)?.tipo_cambio || 1;
        
        setMoneda(recoveredMoneda as 'MN' | 'ME');
        setTipoCambio(recoveredTC);

        // Cargar ítems para edición
        const items = oc.detalles?.map(d => {
            const itemMoneda = (d as any).moneda || 'MN';
            const itemTC = (d as any).tipo_cambio || 1;
            
            // Si estaba en ME, revertimos el precio para mostrarlo en dólares en el input
            const displayPrice = itemMoneda === 'ME' 
                ? (d.precio_unitario || 0) / itemTC 
                : (d.precio_unitario || 0);

            return {
                detalle_sc_id: d.detalle_sc_id,
                material_desc: d.detalle_sc?.material?.descripcion || d.detalle_sc?.equipo?.nombre || d.detalle_sc?.epp?.descripcion || 'Sin descripción',
                cantidad_sc: d.detalle_sc?.cantidad || 0,
                unidad: d.detalle_sc?.unidad || '-',
                cantidad_compra: d.cantidad,
                precio_unitario: displayPrice,
                selected: true
            };
        }) || [];

        setItemsToOrder(items);
        setShowEditModal(true);
    };

    const handleUpdateOC = async () => {
        if (!editingOC || !proveedor || !manualOCNumber) return alert("Ingrese proveedor y número de OC");

        const items = itemsToOrder.map(i => ({
            detalle_sc_id: i.detalle_sc_id,
            cantidad: parseFloat(i.cantidad_compra),
            precio_unitario: moneda === 'ME' 
                ? (parseFloat(i.precio_unitario) || 0) * tipoCambio 
                : (parseFloat(i.precio_unitario) || 0),
            moneda: moneda,
            tipo_cambio: tipoCambio
        }));

        try {
            const ocData = {
                numero_oc: manualOCNumber,
                proveedor,
                fecha_oc: editingOC.fecha_oc,
                fecha_aproximada_atencion: fechaAtencion || null,
                n_factura: nFactura || null,
                fecha_vencimiento: fechaVencimiento || null
            };

            await updateOrdenCompra(editingOC.id, ocData, items);
            alert("Orden de Compra actualizada!");
            setShowEditModal(false);
            loadData();
        } catch (e: any) {
            console.error(e);
            alert("Error actualizando OC: " + e.message);
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
                    <Card className="custom-card shadow-sm">
                        <Card.Header className="bg-white fw-bold d-flex justify-content-between align-items-center py-3">
                            <span className="fs-5 text-primary">Solicitudes Disponibles</span>
                            <Button
                                variant="primary"
                                className="rounded-pill px-4 fw-bold shadow-sm"
                                disabled={selectedSCIds.size === 0}
                                onClick={handleOpenCreateMulti}
                            >
                                <i className="bi bi-plus-circle me-2"></i>
                                Crear OC ({selectedSCIds.size})
                            </Button>
                        </Card.Header>
                        <Table hover responsive className="table-borderless-custom mb-0 align-middle">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-3" style={{ width: '40px' }}>
                                        <Form.Check
                                            type="checkbox"
                                            checked={isAllSCsSelected}
                                            onChange={e => toggleSelectAllSCs(e.target.checked)}
                                        />
                                    </th>
                                    <th>SC #</th>
                                    <th>Requerimiento</th>
                                    <th>Solicitante</th>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th className="text-end pe-3">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedAvailableSolicitudes.map(sc => (
                                    <tr key={sc.id}>
                                        <td className="ps-3">
                                            <Form.Check
                                                type="checkbox"
                                                checked={selectedSCIds.has(sc.id)}
                                                onChange={() => toggleSelectSC(sc.id)}
                                            />
                                        </td>
                                        <td className="fw-bold text-primary">{sc.numero_sc}</td>
                                        <td>
                                            <div className="fw-medium">REQ #{sc.requerimiento?.item_correlativo}</div>
                                            <small className="text-muted">{sc.requerimiento?.frente?.nombre_frente} / {sc.requerimiento?.bloque}</small>
                                        </td>
                                        <td className="text-muted">{sc.requerimiento?.solicitante}</td>
                                        <td>{sc.fecha_sc}</td>
                                         <td>
                                            <Badge 
                                                className={`fw-normal badge-status-${sc.estado.toLowerCase()}`}
                                            >
                                                {sc.estado}
                                            </Badge>
                                        </td>
                                        <td className="text-end pe-3">
                                            <Button
                                                size="sm"
                                                variant="outline-primary"
                                                className="rounded-pill px-3"
                                                onClick={() => {
                                                    setSelectedSCIds(new Set([sc.id]));
                                                    setTimeout(handleOpenCreateMulti, 0);
                                                }}
                                            >
                                                Crear OC
                                            </Button>

                                        </td>
                                    </tr>
                                ))}
                                {availableSolicitudes.length === 0 && (
                                    <tr><td colSpan={7} className="text-center text-muted py-4">No hay solicitudes disponibles.</td></tr>
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

                                                 <Badge 
                                                    className={`px-3 py-2 fs-6 rounded-pill badge-status-${oc.estado.toLowerCase()}`}
                                                >
                                                    {oc.estado}
                                                </Badge>
                                                {(() => {
                                                    const isAttended = oc.detalles?.some(d => {
                                                        const consumed = historial
                                                            .filter(h =>
                                                                h.tipo === 'ENTRADA' &&
                                                                String(h.requerimiento_id) === String((oc as any).sc?.requerimiento_id) &&
                                                                (
                                                                    (d.detalle_sc?.material_id && h.material_id === d.detalle_sc.material_id) ||
                                                                    (d.detalle_sc?.equipo_id && h.equipo_id === d.detalle_sc.equipo_id) ||
                                                                    (d.detalle_sc?.epp_id && h.epp_id === d.detalle_sc.epp_id)
                                                                ) &&
                                                                (h as any).destino_o_uso !== 'COMPRA CAJA CHICA'
                                                            )
                                                            .reduce((sum, h) => sum + h.cantidad, 0);
                                                        return consumed > 0.01 || (d.detalle_sc as any)?.estado === 'Atendido' || (d.detalle_sc as any)?.estado === 'Parcial';
                                                    });

                                                    return (
                                                        <div
                                                            className={`btn btn-sm btn-outline-success rounded-pill px-3 py-2 ms-3 ${isAttended ? 'disabled' : ''}`}
                                                            style={{ 
                                                                cursor: isAttended ? 'default' : 'pointer', 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center', 
                                                                minWidth: '40px' 
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!isAttended) handleOpenEdit(oc);
                                                            }}
                                                            title={isAttended ? "No se puede editar: OC con ingresos a almacén o materiales atendidos" : "Editar OC"}
                                                        >
                                                            <FaEdit size={14} />
                                                        </div>
                                                    );
                                                })()}
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
                <Modal.Header closeButton className="bg-light border-bottom-0 pt-4 px-4">
                    <Modal.Title className="fw-bold">
                        <i className="bi bi-file-earmark-plus me-2 text-primary"></i>
                        Generar Orden de Compra
                        {selectedSCs.length > 0 && <small className="text-muted ms-2 fw-normal">({selectedSCs.length} Solicitudes)</small>}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="px-4 pb-4">
                    <div className="alert alert-info py-2 small mb-4 border-0 bg-opacity-10 d-flex align-items-center">
                        <i className="bi bi-info-circle-fill me-2 fs-5"></i>
                        Se agruparán los materiales seleccionados en una sola OC manteniendo la trazabilidad por cada solicitud.
                    </div>
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
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Moneda</Form.Label>
                                <div className="d-flex align-items-center gap-2 mt-1">
                                    <span className={moneda === 'MN' ? 'fw-bold text-primary' : 'text-muted'}>MN</span>
                                    <Form.Check 
                                        type="switch"
                                        id="moneda-switch"
                                        checked={moneda === 'ME'}
                                        onChange={(e) => handleMonedaChange(e.target.checked ? 'ME' : 'MN')}
                                    />
                                    <span className={moneda === 'ME' ? 'fw-bold text-primary' : 'text-muted'}>ME</span>
                                </div>
                            </Form.Group>
                        </Col>
                        {moneda === 'ME' && (
                            <Col xs={12} md={3}>
                                <Form.Group>
                                    <Form.Label>TC (SUNAT)</Form.Label>
                                    <div className="d-flex align-items-center gap-1">
                                        <Form.Control
                                            type="number"
                                            step="0.001"
                                            value={tipoCambio}
                                            onChange={e => setTipoCambio(parseFloat(e.target.value) || 0)}
                                            size="sm"
                                        />
                                        <Button 
                                            variant="link" 
                                            size="sm" 
                                            onClick={handleFetchTC}
                                            disabled={isFetchingTC}
                                            className="p-0 text-secondary"
                                        >
                                            {isFetchingTC ? <Spinner animation="border" size="sm" /> : <i className="bi bi-arrow-clockwise fs-5"></i>}
                                        </Button>
                                    </div>
                                </Form.Group>
                            </Col>
                        )}
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
                                <th style={{ width: '40%' }}>
                                    <div className="d-flex align-items-center justify-content-between">
                                        <span>Descripción del Item</span>
                                        <Form.Check
                                            type="switch"
                                            id="filter-selected-switch"
                                            label={<small className="fw-bold text-primary">Ver solo seleccionados</small>}
                                            checked={showOnlySelected}
                                            onChange={(e) => setShowOnlySelected(e.target.checked)}
                                            className="ms-3"
                                        />
                                    </div>
                                </th>
                                <th style={{ width: '15%' }}>Cant. SC</th>
                                <th style={{ width: '20%' }}>A Comprar</th>
                                <th style={{ width: '20%' }}>P. Unit {moneda === 'MN' ? 'S/.' : 'ME'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedSCs.map(sc => {
                                let scItems = itemsToOrder.filter(it => it.sc_id === sc.id && it.cantidad_pendiente > 0.01);
                                if (showOnlySelected) {
                                    scItems = scItems.filter(it => it.selected);
                                }
                                if (scItems.length === 0) return null;

                                return (
                                    <React.Fragment key={sc.id}>
                                        <tr className="bg-light border-top">
                                            <td colSpan={5} className="py-2 px-3 fw-bold text-secondary" style={{ fontSize: '0.85em' }}>
                                                SOLICITUD: <span className="text-primary">{sc.numero_sc}</span>
                                                <span className="mx-2">|</span>
                                                REQ: <span className="text-dark">#{sc.requerimiento?.item_correlativo}</span>
                                                <span className="mx-2">|</span>
                                                BLOQUE: <span className="text-dark">{sc.requerimiento?.bloque}</span>
                                            </td>
                                        </tr>
                                        {scItems.map((it) => {
                                            const globalIdx = itemsToOrder.findIndex(item => item.detalle_sc_id === it.detalle_sc_id);
                                            return (
                                                <tr key={it.detalle_sc_id}>
                                                    <td>
                                                        <Form.Check
                                                            type="checkbox"
                                                            checked={it.selected}
                                                            onChange={e => {
                                                                const newItems = [...itemsToOrder];
                                                                newItems[globalIdx].selected = e.target.checked;
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
                                                        <div className="input-group input-group-sm">
                                                            <Form.Control
                                                                type="number"
                                                                value={it.cantidad_compra}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    const newItems = [...itemsToOrder];
                                                                    newItems[globalIdx].cantidad_compra = parseFloat(val.toFixed(2));
                                                                    setItemsToOrder(newItems);
                                                                }}
                                                                className="bg-light bg-opacity-10 border-end-0"
                                                            />
                                                            <span className="input-group-text bg-white text-muted py-0">{it.unidad}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <Form.Control
                                                            type="number"
                                                            size="sm"
                                                            value={it.precio_unitario}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                const newItems = [...itemsToOrder];
                                                                newItems[globalIdx].precio_unitario = val;
                                                                setItemsToOrder(newItems);
                                                            }}
                                                            placeholder="0.00"
                                                            className="bg-light bg-opacity-10"
                                                        />
                                                        {moneda === 'ME' && tipoCambio > 0 && it.precio_unitario > 0 && (
                                                            <small className="text-muted d-block mt-1" style={{ fontSize: '0.75em' }}>
                                                                ≈ S/. {(it.precio_unitario * tipoCambio).toFixed(2)}
                                                            </small>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-light fw-bold">
                            <tr>
                                <td colSpan={4} className="text-end py-3">Total Estimado {moneda === 'ME' ? '(ME → MN)' : '(MN)'}:</td>
                                <td className="text-end py-3 text-primary fs-5">
                                    S/. {itemsToOrder
                                        .filter(it => it.selected)
                                        .reduce((sum, it) => sum + (it.cantidad_compra * it.precio_unitario * (moneda === 'ME' ? tipoCambio : 1)), 0)
                                        .toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="success" onClick={handleSaveOC}>Generar Orden</Button>
                </Modal.Footer>
            </Modal>

            {/* Modal de Edición de OC */}
            <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="xl">
                <Modal.Header closeButton className="bg-light border-bottom-0 pt-4 px-4">
                    <Modal.Title className="fw-bold">
                        <i className="bi bi-pencil-square me-2 text-warning"></i>
                        Editar Orden de Compra {editingOC?.numero_oc}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="px-4 pb-4">
                    {isOCAttended && (
                        <div className="alert alert-warning py-2 small mb-4 border-0 bg-opacity-10 d-flex align-items-center">
                            <i className="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
                            Esta OC ya tiene ingresos en almacén. Solo se puede editar la información de facturación y datos generales. Las cantidades y precios están bloqueados.
                        </div>
                    )}
                    <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Número de Orden de Compra</Form.Label>
                                <Form.Control
                                    value={manualOCNumber}
                                    onChange={e => setManualOCNumber(e.target.value)}
                                    disabled={isOCAttended}
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Proveedor</Form.Label>
                                <Form.Control
                                    value={proveedor}
                                    onChange={e => setProveedor(e.target.value)}
                                    disabled={isOCAttended}
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
                        {!isOCAttended && (
                            <>
                                <Col xs={12} md={3}>
                                    <Form.Group>
                                        <Form.Label>Moneda</Form.Label>
                                        <div className="d-flex align-items-center gap-2 mt-1">
                                            <span className={moneda === 'MN' ? 'fw-bold text-primary' : 'text-muted'}>MN</span>
                                            <Form.Check 
                                                type="switch"
                                                id="moneda-switch-edit"
                                                checked={moneda === 'ME'}
                                                onChange={(e) => handleMonedaChange(e.target.checked ? 'ME' : 'MN')}
                                            />
                                            <span className={moneda === 'ME' ? 'fw-bold text-primary' : 'text-muted'}>ME</span>
                                        </div>
                                    </Form.Group>
                                </Col>
                                {moneda === 'ME' && (
                                    <Col xs={12} md={3}>
                                        <Form.Group>
                                            <Form.Label>TC (SUNAT)</Form.Label>
                                            <div className="d-flex align-items-center gap-1">
                                                <Form.Control
                                                    type="number"
                                                    step="0.001"
                                                    value={tipoCambio}
                                                    onChange={e => setTipoCambio(parseFloat(e.target.value) || 0)}
                                                    size="sm"
                                                />
                                                <Button 
                                                    variant="link" 
                                                    size="sm" 
                                                    onClick={handleFetchTC}
                                                    disabled={isFetchingTC}
                                                    className="p-0 text-secondary"
                                                >
                                                    {isFetchingTC ? <Spinner animation="border" size="sm" /> : <i className="bi bi-arrow-clockwise fs-5"></i>}
                                                </Button>
                                            </div>
                                        </Form.Group>
                                    </Col>
                                )}
                            </>
                        )}
                    </Row>

                    <Card className="mb-4 bg-light">
                        <Card.Body className="p-3">
                            <h6 className="text-muted fw-bold mb-3"><i className="bi bi-receipt"></i> Información de Facturación</h6>
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
                                <th style={{ width: '40%' }}>Descripción del Item</th>
                                <th style={{ width: '20%' }}>Cant. SC</th>
                                <th style={{ width: '20%' }}>A Comprar</th>
                                <th style={{ width: '20%' }}>P. Unit {moneda === 'MN' ? 'S/.' : 'ME'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToOrder.map((it, idx) => (
                                <tr key={idx}>
                                    <td className="fw-medium text-dark">{it.material_desc}</td>
                                    <td>
                                        <span className="fw-bold">{Number(it.cantidad_sc).toFixed(2)} <small className="text-secondary fw-normal ms-1">{it.unidad}</small></span>
                                    </td>
                                    <td>
                                        <div className="input-group input-group-sm">
                                            <Form.Control
                                                type="number"
                                                value={it.cantidad_compra}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const newItems = [...itemsToOrder];
                                                    newItems[idx].cantidad_compra = parseFloat(val.toFixed(2));
                                                    setItemsToOrder(newItems);
                                                }}
                                                disabled={isOCAttended}
                                                className="bg-light bg-opacity-10 border-end-0"
                                            />
                                            <span className="input-group-text bg-white text-muted py-0">{it.unidad}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <Form.Control
                                            type="number"
                                            size="sm"
                                            value={it.precio_unitario}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const newItems = [...itemsToOrder];
                                                newItems[idx].precio_unitario = val;
                                                setItemsToOrder(newItems);
                                            }}
                                            disabled={isOCAttended}
                                            placeholder="0.00"
                                            className="bg-light bg-opacity-10"
                                        />
                                        {moneda === 'ME' && tipoCambio > 0 && it.precio_unitario > 0 && (
                                            <small className="text-muted d-block mt-1" style={{ fontSize: '0.75em' }}>
                                                ≈ S/. {(it.precio_unitario * tipoCambio).toFixed(2)}
                                            </small>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-light fw-bold border-top">
                            <tr>
                                <td colSpan={3} className="text-end py-3">Total Estimado {moneda === 'ME' ? '(ME → MN)' : '(MN)'}:</td>
                                <td className="text-end py-3 text-warning fs-5">
                                    S/. {itemsToOrder
                                        .reduce((sum, it) => sum + (it.cantidad_compra * it.precio_unitario * (moneda === 'ME' ? tipoCambio : 1)), 0)
                                        .toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
                    <Button variant="warning" onClick={handleUpdateOC}>Guardar Cambios</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionOrdenes;
