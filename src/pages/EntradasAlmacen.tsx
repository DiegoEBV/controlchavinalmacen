import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Form, Table, Button, Row, Col, Alert } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos } from '../services/requerimientosService';
import { getMovimientos, registrarEntradaMasiva, registrarEntradaCajaChica, getAllMovimientos } from '../services/almacenService';
import { getOrdenesCompra, getOrdenCompraById } from '../services/comprasService';
import { Requerimiento, MovimientoAlmacen, OrdenCompra, DetalleOC } from '../types';
import { Modal } from 'react-bootstrap';
import PaginationControls from '../components/PaginationControls';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const EntradasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);

    const [allReqs, setAllReqs] = useState<Requerimiento[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);
    const [fullHistorial, setFullHistorial] = useState<MovimientoAlmacen[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('todo');

    const [selectedOC, setSelectedOC] = useState<OrdenCompra | null>(null);
    const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
    const [showModal, setShowModal] = useState(false);

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [docReferencia, setDocReferencia] = useState('');

    const [showCajaChicaModal, setShowCajaChicaModal] = useState(false);
    const [selectedReqCajaChica, setSelectedReqCajaChica] = useState<Requerimiento | null>(null);
    const [selectedDetalleReqCajaChica, setSelectedDetalleReqCajaChica] = useState<any | null>(null);
    const [cajaChicaFactura, setCajaChicaFactura] = useState('');
    const [cajaChicaCantidad, setCajaChicaCantidad] = useState<number | ''>('');

    // Paginación para historial
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageSize = 20;

    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: newMoves } = await supabase
                .from('movimientos_almacen')
                .select(`
                    *,
                    material:materiales(descripcion, categoria, unidad),
                    equipo:equipos(nombre, marca, codigo),
                    epp:epps_c(descripcion, codigo, unidad),
                    requerimiento:requerimientos(item_correlativo)
                `)
                .in('id', Array.from(upserts))
                .eq('tipo', 'ENTRADA');

            if (newMoves && newMoves.length > 0) {
                setHistorial(prev => {
                    const prevSinNuevos = prev.filter(p => !newMoves.find(n => n.id === p.id));
                    return [...newMoves, ...prevSinNuevos] as MovimientoAlmacen[];
                });
            }
        }
    }, { table: 'movimientos_almacen', event: 'INSERT', throttleMs: 2000 });



    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getOrdenCompraById(id)));
            const validItems = responses.filter(i => i !== null) as OrdenCompra[];
            setOrdenes(prev => mergeUpdates(prev, validItems, new Set()));

            // Actualizar OC Seleccionada si fue modificada
            const currentSelectedId = selectedOC?.id;
            if (currentSelectedId) {
                const updatedSelected = validItems.find(o => o.id === currentSelectedId);
                if (updatedSelected) {
                    setSelectedOC(updatedSelected);
                }
            }
        }
    }, { table: 'ordenes_compra', throttleMs: 2000 });

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllReqs([]);
            setOrdenes([]);
            setHistorial([]);
        }
    }, [selectedObra, currentPage, searchTerm]);

    const loadData = async (refreshOCId?: string) => {
        if (!selectedObra) return;
        const [reqsData, movesData, fullMovesData, ocsData] = await Promise.all([
            getRequerimientos(selectedObra.id),
            getMovimientos(selectedObra.id, currentPage, pageSize, searchTerm, 'ENTRADA'),
            getAllMovimientos(selectedObra.id, 'ENTRADA'),
            getOrdenesCompra(selectedObra.id)
        ]);

        if (reqsData.data) setAllReqs(reqsData.data);
        if (movesData) {
            setHistorial(movesData.data as MovimientoAlmacen[]);
            setTotalItems(movesData.count);
        }
        if (fullMovesData) {
            setFullHistorial(fullMovesData);
        }
        if (ocsData) {
            setOrdenes(ocsData);
            if (refreshOCId) {
                const updated = ocsData.find((o: OrdenCompra) => o.id === refreshOCId);
                setSelectedOC(updated || null);
            }
        }
    };

    const handleSelectOC = (ocId: string) => {
        const oc = ordenes.find(o => o.id === ocId) || null;
        setSelectedOC(oc);
        setSelectedItems(new Map());
        setSuccessMsg('');
    };

    // --- Ayudante para calcular Pendiente para un DetalleOC específico ---
    const getPendingForOCDetail = useCallback((oc_detail: DetalleOC, current_oc_id: string, req_id: string) => {
        if (!oc_detail.detalle_sc) return 0;

        // 1. Ordenar OCs por fecha para asignar la cantidad consumida a las OCs más antiguas primero
        const ocsForThisDetail = ordenes
            .filter(o => o.estado !== 'Anulada' && o.detalles?.some(d => d.detalle_sc_id === oc_detail.detalle_sc_id))
            .sort((a, b) => new Date(a.fecha_oc).getTime() - new Date(b.fecha_oc).getTime());

        // 2. Calcular consumido global para este ítem (solo entradas OC, excluir Caja Chica)
        // Las entradas de Caja Chica son compras independientes y NO deben consumir cantidades pendientes de OC
        const consumed = fullHistorial
            .filter(h =>
                String(h.requerimiento_id) === String(req_id) &&
                h.destino_o_uso !== 'COMPRA CAJA CHICA' &&
                (
                    (oc_detail.detalle_sc!.material_id && h.material_id === oc_detail.detalle_sc!.material_id) ||
                    (oc_detail.detalle_sc!.equipo_id && h.equipo_id === oc_detail.detalle_sc!.equipo_id) ||
                    (oc_detail.detalle_sc!.epp_id && h.epp_id === oc_detail.detalle_sc!.epp_id)
                )
            )
            .reduce((sum, h) => sum + h.cantidad, 0);

        // 3. Asignar secuencialmente
        let remainingConsumed = consumed;
        let pendingForThisOC = 0;

        for (const oc of ocsForThisDetail) {
            const det = oc.detalles?.find(d => d.detalle_sc_id === oc_detail.detalle_sc_id);
            if (det) {
                const allocated = Math.min(det.cantidad, remainingConsumed);
                remainingConsumed = Math.max(0, remainingConsumed - allocated);

                if (oc.id === current_oc_id) {
                    pendingForThisOC = det.cantidad - allocated;
                    break;
                }
            }
        }

        return pendingForThisOC;
    }, [ordenes, fullHistorial]);

    const getPendingOCForReqDetail = useCallback((reqId: string, detReq: any) => {
        const ocsForReq = ordenes.filter(o => o.estado !== 'Anulada' && (o as any).sc?.requerimiento_id === reqId);
        let enOC = 0;
        for (const oc of ocsForReq) {
            for (const detOC of (oc.detalles || [])) {
                const dsc = detOC.detalle_sc;
                if (!dsc) continue;
                const match = (dsc.material_id && detReq.material_id && dsc.material_id === detReq.material_id) ||
                    (dsc.equipo_id && detReq.equipo_id && dsc.equipo_id === detReq.equipo_id) ||
                    (dsc.epp_id && detReq.epp_id && dsc.epp_id === detReq.epp_id) ||
                    (dsc.material?.descripcion === detReq.descripcion && dsc.material?.categoria === detReq.material_categoria);
                if (match) enOC += getPendingForOCDetail(detOC, oc.id, reqId);
            }
        }
        return enOC;
    }, [ordenes, getPendingForOCDetail]);

    const activeOrdenes = useMemo(() => {
        return ordenes.filter(oc => {
            if (oc.estado === 'Anulada') return false;
            if (!oc.detalles || oc.detalles.length === 0) return false;
            // Tiene pendiente si algún detalle de esta OC tiene pendiente > 0
            const reqId = (oc as any).sc?.requerimiento_id;
            if (!reqId) return false;

            return oc.detalles.some(d => getPendingForOCDetail(d, oc.id, reqId) > 0);
        });
    }, [ordenes, getPendingForOCDetail]);

    // Efecto de limpieza automática cuando selectedOC está totalmente atendida
    useEffect(() => {
        if (selectedOC && activeOrdenes.length > 0) {
            const isStillActive = activeOrdenes.find(o => o.id === selectedOC.id);
            if (!isStillActive) setSelectedOC(null);
        } else if (selectedOC && activeOrdenes.length === 0) {
            setSelectedOC(null);
        }
    }, [activeOrdenes, selectedOC]);

    const toggleItemSelection = (detalle: DetalleOC, pending: number) => {
        const newMap = new Map(selectedItems);
        if (newMap.has(detalle.id)) {
            newMap.delete(detalle.id);
        } else {
            newMap.set(detalle.id, pending);
        }
        setSelectedItems(newMap);
    };

    const handleSelectAll = (detalles: DetalleOC[], reqId: string) => {
        const newMap = new Map();
        detalles.forEach(d => {
            const pending = getPendingForOCDetail(d, selectedOC!.id, reqId);
            if (pending > 0) newMap.set(d.id, pending);
        });
        setSelectedItems(newMap);
    };

    const handleBatchRegister = async () => {
        if (!selectedOC) return;
        if (selectedItems.size === 0) return alert("Seleccione al menos un ítem.");
        if (!docReferencia) return alert("Ingrese Documento de Referencia");

        setLoading(true);
        try {
            const itemsToProcess = [];
            const reqId = (selectedOC as any).sc?.requerimiento_id;
            const obraId = (selectedOC as any).sc?.requerimiento?.obra_id || selectedObra?.id;

            for (const [id, cantidad] of selectedItems.entries()) {
                const detalleOc = selectedOC.detalles?.find(d => d.id === id);
                if (!detalleOc || !detalleOc.detalle_sc) continue;

                const pending = getPendingForOCDetail(detalleOc, selectedOC.id, reqId);
                if (cantidad > pending) {
                    throw new Error(`La cantidad ingresada excede el pendiente en esta OC para el ítem.`);
                }

                const parentReq = allReqs.find(r => r.id === reqId);
                const targetDetReq = parentReq?.detalles?.find(d => {
                    const dsc = detalleOc.detalle_sc;
                    if (dsc?.material_id && d.material_categoria === dsc.material?.categoria && d.descripcion === dsc.material?.descripcion) return true;
                    if (dsc?.equipo_id && d.equipo_id === dsc.equipo_id) return true;
                    if (dsc?.epp_id && d.epp_id === dsc.epp_id) return true;
                    return false;
                });

                if (!targetDetReq) throw new Error(`No se encontró detalle de requerimiento para el ítem seleccionado.`);

                itemsToProcess.push({
                    material_id: detalleOc.detalle_sc.material_id || null,
                    equipo_id: detalleOc.detalle_sc.equipo_id || null,
                    epp_id: detalleOc.detalle_sc.epp_id || null,
                    cantidad: cantidad,
                    req_id: reqId,
                    det_req_id: targetDetReq.id,
                    sc_detail_id: detalleOc.detalle_sc_id
                });
            }

            const result = await registrarEntradaMasiva(itemsToProcess, docReferencia, obraId);

            setSuccessMsg(`Entrada Masiva Exitosa! Código VINTAR: ${result.vintar_code}`);
            setSelectedItems(new Map());
            setDocReferencia('');
            setShowModal(false);
            loadData(selectedOC.id);
        } catch (error: any) {
            console.error(error);
            alert("Error: " + error.message);
        }
        setLoading(false);
    };

    // --- Lógica de Caja Chica ---
    const handleRequerimientoCajaChicaSelect = (reqId: string) => {
        const req = allReqs.find(r => r.id === reqId) || null;
        setSelectedReqCajaChica(req);
        setSelectedDetalleReqCajaChica(null);
        setCajaChicaCantidad('');
        setCajaChicaFactura('');
    };

    const handleDetalleReqCajaChicaSelect = (detalleId: string) => {
        const detalle = selectedReqCajaChica?.detalles?.find(d => d.id === detalleId) || null;
        setSelectedDetalleReqCajaChica(detalle);
        setCajaChicaCantidad('');
    };

    const handleRegisterCajaChica = async () => {
        if (!selectedObra) return;
        if (!selectedReqCajaChica || !selectedDetalleReqCajaChica) return alert("Seleccione el requerimiento y el material.");
        if (!cajaChicaFactura) return alert("Ingrese Número de Factura.");
        if (!cajaChicaCantidad || Number(cajaChicaCantidad) <= 0) return alert("Ingrese una cantidad válida.");

        const pendienteEnOC = getPendingOCForReqDetail(selectedReqCajaChica.id, selectedDetalleReqCajaChica);
        const pendienteReal = selectedDetalleReqCajaChica.cantidad_solicitada - (selectedDetalleReqCajaChica.cantidad_atendida || 0) - pendienteEnOC;

        if (Number(cajaChicaCantidad) > pendienteReal) {
            return alert(`La cantidad ${cajaChicaCantidad} excede el saldo pendiente real disponible (${pendienteReal}).`);
        }

        const porcentaje = (Number(cajaChicaCantidad) / selectedDetalleReqCajaChica.cantidad_solicitada) * 100;
        if (porcentaje > 50) {
            const confirmV = window.confirm(`La cantidad de caja chica es el ${porcentaje.toFixed(2)}% del total solicitado. ¿Estás seguro de continuar?`);
            if (!confirmV) return;
        }

        setLoading(true);
        try {
            const vintarCode = await registrarEntradaCajaChica(
                selectedReqCajaChica.id,
                selectedDetalleReqCajaChica.id,
                selectedDetalleReqCajaChica.material_id || null,
                selectedDetalleReqCajaChica.equipo_id || null,
                selectedDetalleReqCajaChica.epp_id || null,
                Number(cajaChicaCantidad),
                cajaChicaFactura,
                "Usuario Local",
                selectedObra.id,
                selectedReqCajaChica.frente_id || null
            );

            setSuccessMsg(`¡Entrada por Caja Chica Registrada Correctamente! Código VINTAR generado: ${vintarCode}`);
            setShowCajaChicaModal(false);
            setDocReferencia('');
            handleRequerimientoCajaChicaSelect('');
            loadData();
        } catch (error: any) {
            console.error(error);
            alert("Error al registrar caja chica: " + error.message);
        }
        setLoading(false);
    };

    const activeRequerimientosCajaChica = useMemo(() => {
        return allReqs.filter(req => {
            if (!req.detalles || req.detalles.length === 0) return false;
            return req.detalles.some(d => {
                const enOC = getPendingOCForReqDetail(req.id, d);
                return (d.cantidad_solicitada - (d.cantidad_atendida || 0) - enOC) > 0;
            });
        });
    }, [allReqs, getPendingOCForReqDetail]);


    return (
        <div className="fade-in">
            <div className="page-header d-flex justify-content-between align-items-center">
                <h2>Registrar Entrada (Vía Orden de Compra/Guía)</h2>
                <Button variant="warning" className="fw-bold" onClick={() => setShowCajaChicaModal(true)}>
                    <i className="bi bi-wallet2 me-2"></i> Compra con Caja Chica
                </Button>
            </div>
            <p className="text-muted mb-4">Seleccione una Orden de Compra (OC) activa para ingresar materiales o use Caja Chica por urgencia.</p>

            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Row className="mb-4">
                <Col xs={12} md={6}>
                    <Form.Group>
                        <Form.Label>Buscar Orden de Compra (Solo Pendientes por Recibir)</Form.Label>
                        <Form.Select onChange={e => handleSelectOC(e.target.value)} value={selectedOC?.id || ''}>
                            <option value="">Seleccione OC...</option>
                            {activeOrdenes.map(oc => {
                                const sc = (oc as any).sc;
                                const reqNum = sc?.requerimiento?.item_correlativo || '-';
                                const scNum = sc?.numero_sc || '-';
                                const provName = oc.proveedor || '';
                                const shortProv = provName.length > 20 ? provName.substring(0, 20) + '...' : provName;

                                return (
                                    <option key={oc.id} value={oc.id}>
                                        {oc.numero_oc} - {scNum} - Req: #{reqNum} - {shortProv}
                                    </option>
                                );
                            })}
                        </Form.Select>
                    </Form.Group>
                </Col>
            </Row>

            {selectedOC && (
                <Card className="custom-card">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <h5 className="mb-0 text-primary fw-bold">Items de OC: {selectedOC.numero_oc}</h5>
                        <div>
                            <span className="badge bg-secondary me-2">Proveedor: {selectedOC.proveedor}</span>
                            <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => selectedOC.detalles && handleSelectAll(selectedOC.detalles, (selectedOC as any).sc?.requerimiento_id)}
                            >
                                Seleccionar Todo
                            </Button>
                        </div>
                    </div>
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th>Material / Item</th>
                                    <th>Cant. en OC</th>
                                    <th>Pendiente por Recibir</th>
                                    <th>Unidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedOC.detalles?.map(d => {
                                    const reqId = (selectedOC as any).sc?.requerimiento_id;
                                    const pending = getPendingForOCDetail(d, selectedOC.id, reqId);

                                    if (pending <= 0) return null;

                                    const isSelected = selectedItems.has(d.id);
                                    let desc = 'Sin Desc';
                                    let cat = '';
                                    const detailSc = d.detalle_sc;

                                    if (detailSc?.material) {
                                        desc = detailSc.material.descripcion;
                                        cat = detailSc.material.categoria;
                                    } else if (detailSc?.equipo) {
                                        desc = detailSc.equipo.nombre;
                                        cat = 'Equipo';
                                    } else if (detailSc?.epp) {
                                        desc = detailSc.epp.descripcion;
                                        cat = 'EPP';
                                    }

                                    return (
                                        <tr key={d.id} className={isSelected ? 'table-primary' : ''}>
                                            <td>
                                                <Form.Check
                                                    checked={isSelected}
                                                    onChange={() => toggleItemSelection(d, pending)}
                                                />
                                            </td>
                                            <td>
                                                <strong>{desc}</strong>
                                                <div className="small text-muted">{cat}</div>
                                            </td>
                                            <td className="text-muted small fw-bold">{d.cantidad}</td>
                                            <td className="fw-bold text-success">{pending}</td>
                                            <td>{detailSc?.unidad || '-'}</td>
                                        </tr>
                                    );
                                })}
                                {selectedOC.detalles?.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center text-muted">No hay items en esta OC.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>

                    <div className="mt-4 d-flex justify-content-end">
                        <Button
                            variant="success"
                            disabled={selectedItems.size === 0}
                            onClick={() => setShowModal(true)}
                        >
                            Procesar Entrada ({selectedItems.size})
                        </Button>
                    </div>
                </Card>
            )}

            {/* Modal de Confirmación */}
            <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Confirmar Entrada Masiva</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group className="mb-3">
                        <Form.Label>Documento de Referencia (Guía de Remisión, Factura, etc.)</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Ej. GR-001-2024"
                            value={docReferencia}
                            onChange={(e) => setDocReferencia(e.target.value)}
                        />
                    </Form.Group>

                    <Table hover className="align-middle mb-0">
                        <colgroup>
                            <col style={{ width: '50%' }} />
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '30%' }} />
                        </colgroup>
                        <thead className="bg-light">
                            <tr>
                                <th className="py-2 border-0">Material / Descripción</th>
                                <th className="py-2 text-center border-0">Pendiente</th>
                                <th className="py-2 text-center border-0">A Ingresar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(selectedItems.entries()).map(([id, qty]) => {
                                const detalle = selectedOC?.detalles?.find(d => d.id === id);
                                if (!detalle) return null;

                                const reqId = (selectedOC as any).sc?.requerimiento_id;
                                const maxPending = getPendingForOCDetail(detalle, selectedOC!.id, reqId);

                                let desc = 'Sin Desc';
                                const dsc = detalle.detalle_sc;
                                if (dsc?.material) desc = dsc.material.descripcion;
                                else if (dsc?.equipo) desc = dsc.equipo.nombre;
                                else if (dsc?.epp) desc = dsc.epp.descripcion;

                                return (
                                    <tr key={id}>
                                        <td className="border-0">
                                            <div className="fw-bold text-dark">{desc}</div>
                                            <div className="small text-muted">{dsc?.material?.categoria || (dsc?.equipo ? 'Equipo' : 'EPP')}</div>
                                        </td>
                                        <td className="text-center border-0">
                                            <span className="badge bg-light text-dark border">
                                                {maxPending} {dsc?.unidad || '-'}
                                            </span>
                                        </td>
                                        <td className="border-0">
                                            <Form.Control
                                                type="number"
                                                min="0"
                                                max={maxPending}
                                                className="text-center fw-bold text-primary"
                                                value={qty}
                                                onChange={(e) => {
                                                    let val = parseFloat(e.target.value);
                                                    if (isNaN(val)) val = 0;
                                                    const newMap = new Map(selectedItems);
                                                    newMap.set(id, val);
                                                    setSelectedItems(newMap);
                                                }}
                                                isInvalid={qty <= 0 || qty > maxPending}
                                            />
                                            {qty > maxPending && <div className="text-danger small mt-1 text-center" style={{ fontSize: '0.8em' }}>Excede máximo</div>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={handleBatchRegister} disabled={loading}>
                        {loading ? 'Procesando...' : 'Generar VINTAR y Guardar'}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Modal Caja Chica */}
            <Modal show={showCajaChicaModal} onHide={() => setShowCajaChicaModal(false)} size="lg">
                <Modal.Header closeButton className="bg-warning text-dark">
                    <Modal.Title><i className="bi bi-wallet2 me-2"></i> Registrar Compra por Caja Chica</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Alert variant="info" className="small">
                        Utilice este formulario solo para ingresos de urgencia que no pasaron por el flujo regular de Solicitudes y Órdenes de Compra.
                    </Alert>

                    <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Seleccionar Requerimiento (Solo con pendientes)</Form.Label>
                                <Form.Select
                                    onChange={e => handleRequerimientoCajaChicaSelect(e.target.value)}
                                    value={selectedReqCajaChica?.id || ''}
                                >
                                    <option value="">Seleccione Requerimiento...</option>
                                    {activeRequerimientosCajaChica.map(r => (
                                        <option key={r.id} value={r.id}>
                                            Req. #{r.item_correlativo} - {r.frente?.nombre_frente || 'Sin Frente'}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>

                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Material / Ítem a Ingresar</Form.Label>
                                <Form.Select
                                    onChange={e => handleDetalleReqCajaChicaSelect(e.target.value)}
                                    value={selectedDetalleReqCajaChica?.id || ''}
                                    disabled={!selectedReqCajaChica}
                                >
                                    <option value="">Seleccione Ítem...</option>
                                    {selectedReqCajaChica?.detalles?.map(d => {
                                        const enOC = getPendingOCForReqDetail(selectedReqCajaChica.id, d);
                                        const disp = d.cantidad_solicitada - (d.cantidad_atendida || 0) - enOC;
                                        if (disp <= 0) return null;
                                        return (
                                            <option key={d.id} value={d.id}>
                                                {d.descripcion} (Pendiente libre: {disp} {d.unidad})
                                            </option>
                                        );
                                    })}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                    </Row>

                    {selectedDetalleReqCajaChica && (
                        <div className="p-3 bg-light rounded border mb-3">
                            {(() => {
                                const enOC = getPendingOCForReqDetail(selectedReqCajaChica!.id, selectedDetalleReqCajaChica);
                                const disp = selectedDetalleReqCajaChica.cantidad_solicitada - (selectedDetalleReqCajaChica.cantidad_atendida || 0) - enOC;
                                return (
                                    <Row>
                                        <Col xs={3}>
                                            <span className="text-muted small">Total Solicitado</span>
                                            <h5 className="mb-0">{selectedDetalleReqCajaChica.cantidad_solicitada} {selectedDetalleReqCajaChica.unidad}</h5>
                                        </Col>
                                        <Col xs={3}>
                                            <span className="text-muted small">Recibido Total</span>
                                            <h5 className="mb-0">{selectedDetalleReqCajaChica.cantidad_atendida || 0} {selectedDetalleReqCajaChica.unidad}</h5>
                                        </Col>
                                        <Col xs={3}>
                                            <span className="text-muted small">En OC (Pendiente)</span>
                                            <h5 className="mb-0 text-warning">{enOC} {selectedDetalleReqCajaChica.unidad}</h5>
                                        </Col>
                                        <Col xs={3}>
                                            <span className="text-muted small text-success fw-bold">Libre para Comprar</span>
                                            <h5 className="mb-0 text-success fw-bold">{disp} {selectedDetalleReqCajaChica.unidad}</h5>
                                        </Col>
                                    </Row>
                                );
                            })()}
                        </div>
                    )}

                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Número de Factura / Ticket <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Ej. F001-002341"
                                    value={cajaChicaFactura}
                                    onChange={(e) => setCajaChicaFactura(e.target.value)}
                                    autoComplete="off"
                                />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Cantidad a Ingresar <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="number"
                                    placeholder="0"
                                    min="0.01"
                                    step="0.01"
                                    value={cajaChicaCantidad}
                                    onChange={(e) => setCajaChicaCantidad(Number(e.target.value))}
                                    disabled={!selectedDetalleReqCajaChica}
                                    isInvalid={
                                        selectedDetalleReqCajaChica &&
                                        cajaChicaCantidad !== '' &&
                                        Number(cajaChicaCantidad) > (selectedDetalleReqCajaChica.cantidad_solicitada - (selectedDetalleReqCajaChica.cantidad_atendida || 0) - getPendingOCForReqDetail(selectedReqCajaChica!.id, selectedDetalleReqCajaChica))
                                    }
                                />
                                {selectedDetalleReqCajaChica && cajaChicaCantidad !== '' && Number(cajaChicaCantidad) > (selectedDetalleReqCajaChica.cantidad_solicitada - (selectedDetalleReqCajaChica.cantidad_atendida || 0) - getPendingOCForReqDetail(selectedReqCajaChica!.id, selectedDetalleReqCajaChica)) && (
                                    <Form.Text className="text-danger">La cantidad ingresada supera el saldo libre del requerimiento.</Form.Text>
                                )}
                            </Form.Group>
                        </Col>
                    </Row>

                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowCajaChicaModal(false)}>
                        Cancelar
                    </Button>
                    <Button
                        variant="warning"
                        onClick={handleRegisterCajaChica}
                        disabled={loading || !selectedDetalleReqCajaChica || !cajaChicaFactura || !cajaChicaCantidad || Number(cajaChicaCantidad) <= 0 || Number(cajaChicaCantidad) > (selectedDetalleReqCajaChica.cantidad_solicitada - (selectedDetalleReqCajaChica.cantidad_atendida || 0) - getPendingOCForReqDetail(selectedReqCajaChica!.id, selectedDetalleReqCajaChica))}
                    >
                        {loading ? 'Procesando...' : 'Registrar Compra por Caja Chica'}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Tabla de Historial */}
            <div className="mt-5">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="text-secondary mb-0">Historial de Entradas Recientes</h4>
                </div>

                <Row className="mb-3">
                    <Col xs={12} md={4}>
                        <Form.Group>
                            <Form.Control
                                type="text"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </Form.Group>
                    </Col>
                    <Col xs={12} md={3}>
                        <Form.Group>
                            <Form.Select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                            >
                                <option value="todo">Todos</option>
                                <option value="material">Material / Descripción</option>
                                <option value="doc">Doc. Referencia</option>
                                <option value="req">N° Requerimiento</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                </Row>

                <Card className="custom-card">
                    <Table hover responsive className="table-borderless-custom mb-0">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>N° Req.</th>
                                <th>Doc. Referencia</th>
                                <th>Material / Descripción</th>
                                <th>Cantidad</th>
                                <th>Unidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center text-muted p-4">No hay entradas registradas.</td>
                                </tr>
                            ) : (
                                historial.map(h => {
                                    const mov = h as any;
                                    let desc = 'Desconocido';
                                    let cat = '';
                                    let unidad = '';

                                    if (mov.material) {
                                        desc = mov.material.descripcion;
                                        cat = mov.material.categoria;
                                        unidad = mov.material.unidad;
                                    } else if (mov.equipo) {
                                        desc = mov.equipo.nombre;
                                        cat = 'Equipo';
                                        unidad = 'UND';
                                    } else if (mov.epp) {
                                        desc = mov.epp.descripcion;
                                        cat = 'EPP';
                                        unidad = mov.epp.unidad;
                                    }

                                    const reqNum = mov.requerimiento ? mov.requerimiento.item_correlativo : '-';

                                    return (
                                        <tr key={h.id}>
                                            <td>{new Date(h.fecha).toLocaleDateString()}</td>
                                            <td className="fw-bold text-primary">
                                                {reqNum !== '-' ? `#${reqNum}` : '-'}
                                            </td>
                                            <td className="fw-bold">{h.documento_referencia || '-'}</td>
                                            <td>
                                                <div>{desc}</div>
                                                <small className="text-muted">{cat}</small>
                                            </td>
                                            <td>{h.cantidad}</td>
                                            <td>{unidad}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </Table>
                </Card>
                <div className="mt-3">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={Math.max(1, Math.ceil(totalItems / pageSize))}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </div>
        </div>
    );
};

export default EntradasAlmacen;
