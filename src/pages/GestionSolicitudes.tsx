import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { Card, Button, Table, Badge, Modal, Form, Row, Col, Accordion, Spinner } from 'react-bootstrap';

import { getRequerimientos, getMaterialesCatalog, getRequerimientoById } from '../services/requerimientosService';
import { getOrdenesCompra, getSolicitudesCompra, createSolicitudCompra, getSolicitudCompraById } from '../services/comprasService';
import { getAllMovimientos } from '../services/almacenService';
import { useAuth } from '../context/AuthContext';
import { Requerimiento, SolicitudCompra, Material, MovimientoAlmacen, OrdenCompra } from '../types';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';
import { exportSolicitudCompra } from '../utils/scExcelExport';
import { FaFileExcel } from 'react-icons/fa';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/PaginationControls';

const GestionSolicitudes: React.FC = () => {
    const { selectedObra, hasRole } = useAuth();
    const canSkipOC = hasRole(['admin', 'coordinador']);
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [materiales, setMateriales] = useState<Material[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);

    // Estado del Modal para Crear SC
    const [showModal, setShowModal] = useState(false);
    const [selectedReq, setSelectedReq] = useState<Requerimiento | null>(null);
    const [items, setItems] = useState<any[]>([]); // Ítems para incluir en SC
    const [exportingId, setExportingId] = useState<string | null>(null);

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setRequerimientos([]);
            setSolicitudes([]);
            setHistorial([]);
        }
    }, [selectedObra]);

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Requerimientos (Nuevos Pendientes)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getRequerimientoById(id)));
            const validReqs = responses
                .filter(res => res.data !== null)
                .map(res => res.data as Requerimiento);

            setRequerimientos(prev => mergeUpdates(prev, validReqs, deletes));
        } else if (deletes.size > 0) {
            setRequerimientos(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'requerimientos', throttleMs: 2000 });

    // 2. Solicitudes (Cambios)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getSolicitudCompraById(id)));
            const validItems = responses.filter(i => i !== null) as SolicitudCompra[];
            setSolicitudes(prev => mergeUpdates(prev, validItems, deletes));

            // Eliminación proactiva de la lista de requerimientos pendientes
            const reqIds = validItems.map(s => s.requerimiento_id);
            setRequerimientos(prev => prev.filter(r => !reqIds.includes(r.id)));

        } else if (deletes.size > 0) {
            setSolicitudes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'solicitudes_compra', throttleMs: 2000 });


    const loadData = async () => {
        if (!selectedObra) return;
        const [reqs, scs, mats, movs, ocs] = await Promise.all([
            getRequerimientos(selectedObra.id, true), // Excluir servicios
            getSolicitudesCompra(selectedObra.id),
            getMaterialesCatalog(),
            getAllMovimientos(selectedObra.id),
            getOrdenesCompra(selectedObra.id)
        ]);

        const processedReqIds = new Set(scs?.map(s => s.requerimiento_id));

        if (reqs.data) {
            // Filtrar Requerimientos que ya tienen una SC y que no estén Anulados
            const pending = reqs.data.filter(r => !processedReqIds.has(r.id) && r.estado !== 'Anulado');
            setRequerimientos(pending);
        }
        if (scs) setSolicitudes(scs);
        if (mats) setMateriales(mats);
        if (movs) setHistorial(movs as any);
        if (ocs) setOrdenes(ocs);
    };

    const handleOpenCreate = (req: Requerimiento) => {
        setSelectedReq(req);

        // Auto-emparejar ítems con catálogo
        const initialItems = req.detalles?.map(d => {
            let item: any = {
                descripcion: d.descripcion,
                unidad: d.unidad,
                cantidad_original: d.cantidad_solicitada,
                cantidad: Math.max(0, d.cantidad_solicitada - (d.cantidad_atendida || 0)), // Descontar lo atendido (incl. caja chica)
                cantidad_caja_chica: d.cantidad_caja_chica || 0,
                comentario: '',
                material_id: null,
                equipo_id: null,
                epp_id: null,
                detalle_requerimiento_id: d.id, // Guardar ID para el RPC
                enviar_a_oc: true // Por defecto siempre enviar a OC
            };

            if (d.tipo === 'Material') {
                // Priorizar el material_id ya registrado en el detalle
                if (d.material_id) {
                    item.material_id = d.material_id;
                    item.descripcion = d.descripcion;
                } else {
                    // Fallback legacy (por si acaso hay reqs antiguos sin ID)
                    const mat = materiales.find(m =>
                        m.descripcion === d.descripcion &&
                        m.categoria === d.material_categoria
                    );
                    if (!mat) return null;
                    item.material_id = mat.id;
                    item.descripcion = mat.descripcion;
                }
            } else if (d.tipo === 'Equipo') {
                if (!d.equipo_id) return null;
                item.equipo_id = d.equipo_id;
                item.descripcion = d.equipo?.nombre || d.descripcion;
            } else if (d.tipo === 'EPP') {
                if (!d.epp_id) return null;
                item.epp_id = d.epp_id;
                item.descripcion = d.epp?.descripcion || d.descripcion;
            } else {
                return null;
            }

            return item;
        }).filter(Boolean) || [];

        setItems(initialItems);
        setShowModal(true);
    };

    const handleSaveSC = async () => {
        if (!selectedReq) return;

        try {
            const scPayload = {
                requerimiento_id: selectedReq.id,
                numero_sc: `SC-${new Date().getFullYear()}-${String(solicitudes.length + 1).padStart(3, '0')}`,
                fecha_sc: new Date().toISOString().split('T')[0],
                estado: 'Pendiente' as const
            };

            await createSolicitudCompra(scPayload, items);
            alert("Solicitud de Compra creada con éxito!");
            setShowModal(false);
            loadData();
        } catch (e: any) {
            console.error(e);
            alert("Error creando SC: " + e.message);
        }
    };

    // Filtrar VISTA de Requerimientos Pendientes de nuevo para estar seguros (si llegó SC en tiempo real pero perdimos el evento)
    const processedReqIds = new Set(solicitudes.map(s => s.requerimiento_id));
    const pendingRequerimientos = requerimientos.filter(r => !processedReqIds.has(r.id) && r.estado !== 'Anulado');

    const { currentPage: scPage, totalPages: scTotalPages, totalItems: scTotalItems, pageSize: scPageSize, paginatedItems: pagedSolicitudes, goToPage: goToScPage } = usePagination(solicitudes, 15);
    const {
        paginatedItems: pagedPendingReqs,
        currentPage: pendingPage,
        totalPages: pendingTotalPages,
        totalItems: pendingTotalItems,
        pageSize: pendingPageSize,
        goToPage: goToPendingPage
    } = usePagination(pendingRequerimientos, 10);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Gestión de Solicitudes de Compra (SC)</h2>
            </div>

            <Row>
                <Col xs={12} className="mb-4">
                    <Card className="custom-card">
                        <Card.Header className="bg-white fw-bold">Requerimientos Pendientes</Card.Header>
                        <Table hover responsive className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>Req #</th>
                                    <th>Bloque</th>
                                    <th>Solicitante</th>
                                    <th>Fecha</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedPendingReqs.map(req => (
                                    <tr key={req.id}>
                                        <td>{req.item_correlativo}</td>
                                        <td>{req.bloque}</td>
                                        <td>{req.solicitante}</td>
                                        <td>{req.fecha_solicitud}</td>
                                        <td>
                                            <Button size="sm" onClick={() => handleOpenCreate(req)}>Generar SC</Button>
                                        </td>
                                    </tr>
                                ))}
                                {pendingRequerimientos.length === 0 && <tr><td colSpan={5} className="text-muted text-center">No hay requerimientos pendientes.</td></tr>}
                            </tbody>
                        </Table>
                        {pendingTotalPages > 1 && (
                            <div className="px-3 pb-3 border-top pt-2 mt-auto">
                                <PaginationControls
                                    currentPage={pendingPage}
                                    totalPages={pendingTotalPages}
                                    totalItems={pendingTotalItems}
                                    pageSize={pendingPageSize}
                                    onPageChange={goToPendingPage}
                                />
                            </div>
                        )}
                    </Card>
                </Col>

                <Col xs={12}>
                    <h4 className="text-secondary mt-4">Solicitudes Generadas</h4>
                    <Accordion defaultActiveKey="0" flush className="custom-card p-0 overflow-hidden mt-3">
                        {pagedSolicitudes.map((sc, idx) => {
                            // Pre-calcular estado para el Encabezado
                            let allFullyAttended = true;
                            if (!sc.detalles || sc.detalles.length === 0) allFullyAttended = false;

                            const activeDetails = sc.detalles?.map(d => {
                                const consumed = historial
                                    .filter(h =>
                                        String(h.requerimiento_id) === String(sc.requerimiento_id) &&
                                        (
                                            (d.material_id && h.material_id === d.material_id) ||
                                            (d.equipo_id && h.equipo_id === d.equipo_id) ||
                                            (d.epp_id && h.epp_id === d.epp_id)
                                        ) &&
                                        new Date(h.created_at || h.fecha) >= new Date(sc.created_at)
                                    )
                                    .reduce((sum, h) => sum + h.cantidad, 0);

                                const isAttended = consumed >= d.cantidad;
                                if (!isAttended) allFullyAttended = false;

                                return { ...d, consumed, isAttended };
                            });

                            const headerStatus = allFullyAttended ? 'Atendido' : sc.estado;

                            // Determinar si es una SC puramente interna (sin ítems para OC)
                            const isPurelyInternal = (sc.detalles?.length ?? 0) > 0 && !sc.detalles?.some(d => d.enviar_a_oc !== false);

                            const headerVariant = allFullyAttended ? 'success' : (sc.estado === 'Pendiente' ? 'warning' : 'primary');

                            return (
                                <Accordion.Item eventKey={String(idx)} key={sc.id}>
                                    <Accordion.Header>
                                        <div className="d-flex flex-column flex-md-row w-100 justify-content-between align-items-md-center me-3 gap-2">
                                            <div>
                                                <span className="fw-bold text-primary me-3">{sc.numero_sc}</span>
                                                <span className="text-muted small me-3 d-block d-md-inline">Fecha: {sc.fecha_sc}</span>
                                                <Badge bg={headerVariant}>{headerStatus}</Badge>
                                                {isPurelyInternal && <Badge bg="info" className="ms-2 text-dark bg-opacity-25 border border-info">Procesamiento Interno</Badge>}
                                            </div>
                                            <div className="text-start text-md-end mt-2 mt-md-0 d-flex align-items-center gap-3">
                                                <div
                                                    className={`btn btn-sm btn-outline-success ${exportingId === sc.id ? 'disabled' : ''}`}
                                                    style={{ cursor: exportingId === sc.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (exportingId !== sc.id) {
                                                            setExportingId(sc.id);
                                                            try {
                                                                // Obtener URL personalizada de la obra si existe
                                                                let customUrl = null;
                                                                const obraId = sc.requerimiento?.obra_id;

                                                                if (obraId) {
                                                                    const { data } = await supabase
                                                                        .from('obras')
                                                                        .select('formato_solicitud_url')
                                                                        .eq('id', obraId)
                                                                        .single();
                                                                    customUrl = data?.formato_solicitud_url;
                                                                }

                                                                await exportSolicitudCompra(sc, customUrl);
                                                            } catch (error) {
                                                                console.error("Export failed:", error);
                                                            } finally {
                                                                setExportingId(null);
                                                            }
                                                        }
                                                    }}
                                                    title="Exportar SC a Excel"
                                                >
                                                    {exportingId === sc.id ? (
                                                        <Spinner animation="border" size="sm" />
                                                    ) : (
                                                        <FaFileExcel size={18} />
                                                    )}
                                                </div>
                                                <div>
                                                    <small className="text-muted d-block">Req Origen</small>
                                                    <strong>#{sc.requerimiento?.item_correlativo || 'N/A'}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </Accordion.Header>
                                    <Accordion.Body>
                                        <div className="d-flex justify-content-between align-items-center mb-3">
                                            <h6 className="text-muted fw-bold mb-0">Detalle de Materiales para Compra</h6>
                                            {isPurelyInternal && <small className="text-info fw-bold">Todos los ítems fueron procesados internamente</small>}
                                        </div>
                                        <Table size="sm" hover responsive className="table-borderless-custom mb-0">
                                            <thead className="bg-light">
                                                <tr>
                                                    <th>Material</th>
                                                    <th>Comentario</th>
                                                    <th>Categoría</th>
                                                    <th>Cantidad Aprobada</th>
                                                    <th>Cant. Atendida</th>
                                                    <th>Unidad</th>
                                                    <th>OCs Vinculadas</th>
                                                    <th>Estado Item</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeDetails?.filter(d => d.enviar_a_oc !== false).map(d => {
                                                    // Encontrar OCs vinculadas para este ítem específico
                                                    const linkedOCs = ordenes.filter(o => o.detalles?.some(od => od.detalle_sc_id === d.id));

                                                    return (
                                                        <tr key={d.id}>
                                                            <td>
                                                                {d.material?.descripcion || d.equipo?.nombre || d.epp?.descripcion || 'Sin descripción'}
                                                            </td>
                                                            <td><small className="text-muted">{d.comentario || '-'}</small></td>
                                                            <td className="text-muted small">{d.material?.categoria}</td>
                                                            <td className="fw-bold text-primary">{d.cantidad}</td>
                                                            <td className={`fw-bold ${d.isAttended ? 'text-success' : 'text-warning'}`}>{d.consumed}</td>
                                                            <td>{d.unidad}</td>
                                                            <td>
                                                                {linkedOCs.length > 0 ? (
                                                                    linkedOCs.map(o => (
                                                                        <Badge key={o.id} bg="info" className="me-1 text-dark bg-opacity-25 border border-info">
                                                                            {o.numero_oc}
                                                                        </Badge>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-muted">-</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <Badge bg={d.isAttended ? 'success' : 'secondary'} className="fw-normal">
                                                                    {d.isAttended ? 'Atendido' : d.estado}
                                                                </Badge>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {sc.detalles?.some(d => d.enviar_a_oc === false) && activeDetails?.filter(d => d.enviar_a_oc !== false).length === 0 && (
                                                    <tr>
                                                        <td colSpan={8} className="text-center text-muted py-3">
                                                            Esta solicitud no contiene ítems para Orden de Compra (Atención Interna).
                                                        </td>
                                                    </tr>
                                                )}
                                                {!sc.detalles?.length && <tr><td colSpan={8} className="text-center text-muted">Sin detalles registrados.</td></tr>}
                                            </tbody>
                                        </Table>
                                    </Accordion.Body>
                                </Accordion.Item>
                            );
                        })}
                        {solicitudes.length === 0 && <p className="text-center text-muted p-4">No hay solicitudes generadas aún.</p>}
                    </Accordion>
                    <PaginationControls currentPage={scPage} totalPages={scTotalPages} totalItems={scTotalItems} pageSize={scPageSize} onPageChange={goToScPage} />
                </Col>
            </Row>

            <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Generar SC para Req #{selectedReq?.item_correlativo}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted small">Se han filtrado automáticamente solo los materiales válidos del catálogo.</p>
                    <Table size="sm">
                        <thead>
                            <tr>
                                <th>Desc</th>
                                <th>Cantidad</th>
                                <th>Comentario</th>
                                {canSkipOC && <th title="Si se desactiva, el ítem se marca como atendido sin pasar por OC">¿Enviar a OC?</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, idx) => (
                                <tr key={idx}>
                                    <td>{it.descripcion}</td>
                                    <td>
                                        <div className="d-flex flex-column align-items-start">
                                            <div className="d-flex align-items-center mb-1">
                                                <Form.Control
                                                    type="number"
                                                    value={it.cantidad}
                                                    onChange={(e) => {
                                                        const newItems = [...items];
                                                        newItems[idx].cantidad = parseFloat(e.target.value);
                                                        setItems(newItems);
                                                    }}
                                                    size="sm"
                                                    style={{ maxWidth: '100px', marginRight: '5px' }}
                                                />
                                                <span>{it.unidad}</span>
                                            </div>
                                            {it.cantidad_caja_chica > 0 && (
                                                <small className="text-danger fw-bold mt-1" style={{ fontSize: '0.75em', lineHeight: 1.1 }}>
                                                    *Descontado Caja Chica: {it.cantidad_caja_chica}
                                                </small>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <Form.Control
                                            type="text"
                                            placeholder="Detalle/Marca..."
                                            value={it.comentario || ''}
                                            onChange={(e) => {
                                                const newItems = [...items];
                                                newItems[idx].comentario = e.target.value;
                                                setItems(newItems);
                                            }}
                                            size="sm"
                                        />
                                    </td>
                                    {canSkipOC && (
                                        <td>
                                            <Form.Check
                                                type="switch"
                                                id={`switch-oc-${idx}`}
                                                checked={it.enviar_a_oc}
                                                onChange={(e) => {
                                                    const newItems = [...items];
                                                    newItems[idx].enviar_a_oc = e.target.checked;
                                                    setItems(newItems);
                                                }}
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveSC}>Guardar SC</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionSolicitudes;
