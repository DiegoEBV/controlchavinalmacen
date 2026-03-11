import React, { useState, useEffect, useMemo } from 'react';
import { Button, Table, Badge, Accordion, ProgressBar, Row, Col, Form, Card, Spinner } from 'react-bootstrap';
import { getRequerimientos, createRequerimiento, updateRequerimiento, getObras, getUserAssignedObras, getRequerimientoById, anularRequerimiento } from '../services/requerimientosService';
import { getSolicitudesCompra, getOrdenesCompra, getSolicitudCompraById, getOrdenCompraById } from '../services/comprasService';
import { Requerimiento, Obra, SolicitudCompra, OrdenCompra } from '../types';
import RequerimientoForm from '../components/RequerimientoForm';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';
import { exportRequerimiento } from '../utils/excelExport';
import { FaFileExcel, FaEdit, FaBan } from 'react-icons/fa';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/PaginationControls';

const GestionRequerimientos: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingReq, setEditingReq] = useState<Requerimiento | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [exportingId, setExportingId] = useState<string | null>(null);

    const { selectedObra, user, isAdmin, profile } = useAuth();

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Requerimientos
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            // Obtener detalles completos
            const responses = await Promise.all(Array.from(upserts).map(id => getRequerimientoById(id)));
            const validItems = responses
                .filter(res => res.data !== null)
                .map(res => res.data as Requerimiento);

            setRequerimientos(prev => mergeUpdates(prev, validItems, deletes, 'id', (a, b) => {
                // Ordenar por item_correlativo descendente (el más nuevo primero)
                if (a.item_correlativo > b.item_correlativo) return -1;
                if (a.item_correlativo < b.item_correlativo) return 1;
                return 0;
            }));
        } else if (deletes.size > 0) {
            setRequerimientos(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'requerimientos', throttleMs: 2000 });

    // 2. Solicitudes
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            // Obtener SCs actualizadas
            const responses = await Promise.all(Array.from(upserts).map(id => getSolicitudCompraById(id)));
            const validItems = responses.filter(res => res !== null) as SolicitudCompra[];
            setSolicitudes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setSolicitudes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'solicitudes_compra', throttleMs: 2000 });

    // 3. Órdenes
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getOrdenCompraById(id)));
            const validItems = responses.filter(res => res !== null) as OrdenCompra[];
            setOrdenes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setOrdenes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'ordenes_compra', throttleMs: 2000 });


    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setRequerimientos([]);
            setSolicitudes([]);
            setOrdenes([]);
        }
    }, [selectedObra]);

    const loadData = async () => {
        if (!selectedObra) return;

        // Obtención paralela
        const pReqs = getRequerimientos(selectedObra.id);
        const pScs = getSolicitudesCompra(selectedObra.id);
        const pOcs = getOrdenesCompra(selectedObra.id);

        // Obtener Obras basadas en rol
        let pObras;
        if (isAdmin) {
            pObras = getObras();
        } else if (user) {
            pObras = getUserAssignedObras(user.id);
        } else {
            pObras = Promise.resolve([]);
        }

        const [reqs, scs, obs, ocs] = await Promise.all([pReqs, pScs, pObras, pOcs]);

        if (reqs.data) setRequerimientos(reqs.data);
        if (scs) setSolicitudes(scs);
        setObras(obs as Obra[] || []);
        setOrdenes(ocs || []);
    };

    const handleSave = async (header: any, items: any[]) => {
        let error;
        if (editingReq) {
            const res = await updateRequerimiento(editingReq.id, header, items);
            error = res.error;
        } else {
            const res = await createRequerimiento(header, items);
            error = res.error;
        }

        if (error) {
            alert(error);
            throw new Error(error);
        }

        loadData();
        setEditingReq(null);
        setShowForm(false);
    };

    const handleEdit = (req: Requerimiento) => {
        setEditingReq(req);
        setShowForm(true);
    };

    const handleCloseModal = () => {
        setShowForm(false);
        setEditingReq(null);
    };

    const handleAnular = async (req: Requerimiento) => {
        if (!user) return;
        const motivo = window.prompt(`¿Por qué deseas anular el requerimiento REQ #${req.item_correlativo}?\nIngresa el motivo (requerido):`);

        if (motivo === null) return; // User cancelled prompt
        if (motivo.trim().length < 5) {
            alert("Debes ingresar un motivo válido (mínimo 5 caracteres).");
            return;
        }

        try {
            const res = await anularRequerimiento(req.id, user.id, motivo.trim());
            if (!res.success) {
                alert(res.message);
            } else {
                alert(res.message);
                loadData();
            }
        } catch (error: any) {
            alert(error.message || 'Error al anular requerimiento');
        }
    };


    const calculateProgress = (req: Requerimiento) => {
        if (!req.detalles?.length) return 0;
        let totalPct = 0;
        req.detalles.forEach(d => {
            const atendidoTotal = Math.min(d.cantidad_atendida, d.cantidad_solicitada);
            totalPct += (atendidoTotal / d.cantidad_solicitada);
        });
        return Math.round((totalPct / req.detalles.length) * 100);
    };

    const getStatusColor = (status: string) => {
        if (status === 'Pendiente') return 'danger';
        if (status === 'Parcial') return 'warning';
        if (status === 'Atendido') return 'success';
        return 'secondary';
    };

    // Memorizar filtrado para evitar re-cálculo en cada renderizado
    const filteredReqs = useMemo(() => {
        return requerimientos.filter(req =>
            req.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(req.item_correlativo).includes(searchTerm) ||
            (req.bloque && req.bloque.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [requerimientos, searchTerm]);

    const { currentPage, totalPages, totalItems, pageSize, paginatedItems: visibleReqs, goToPage } = usePagination(filteredReqs, 15);

    const handleExport = async (req: Requerimiento) => {
        if (exportingId) return; // Prevenir clics múltiples
        setExportingId(req.id);
        try {
            // Obtener datos frescos de la obra si es posible, o usar del contexto
            // Para mantenerlo rápido y simple, usamos del contexto ya que 'getObras' o 'getUserAssignedObras' ya trae los campos.
            const obraData = obras.find(o => o.id === req.obra_id) || selectedObra;
            await exportRequerimiento(req, obraData?.formato_requerimiento_url);
        } catch (error) {
            console.error("Export failed:", error);
            // Alert already handled in utility
        } finally {
            setExportingId(null);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Control de Requerimientos</h2>
                <Button onClick={() => setShowForm(true)} className="btn-primary rounded-pill px-4 shadow-sm">+ Nuevo Requerimiento</Button>
            </div>

            <Card className="custom-card">
                <Row className="align-items-center g-2">
                    <Col xs={12} sm="auto">
                        <Form.Label className="fw-bold text-secondary mb-0">Filtrar:</Form.Label>
                    </Col>
                    <Col xs={12} sm>
                        <Form.Control
                            placeholder="Buscar por Solicitante, Número o Bloque..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </Col>
                </Row>
            </Card>

            <div className="custom-card p-0 overflow-hidden">
                <Accordion defaultActiveKey="0" flush>
                    {visibleReqs.map((req, idx) => {
                        const progress = calculateProgress(req);
                        return (
                            <Accordion.Item eventKey={String(idx)} key={req.id}>
                                <Accordion.Header>
                                    <div
                                        className={`d-flex flex-column flex-md-row w-100 justify-content-between align-items-center me-3 gap-2 ${req.estado === 'Anulado' ? 'text-danger' : ''}`}
                                        style={req.estado === 'Anulado' ? { backgroundColor: '' } : {}}
                                    >
                                        <div className="text-center text-md-start">
                                            <strong>REQ #{req.item_correlativo} {req.estado === 'Anulado' && <Badge bg="danger" className="ms-2">ANULADO</Badge>}</strong>
                                            <span className="mx-2 text-muted d-none d-md-inline">|</span>
                                            <div className="d-md-inline d-block">
                                                <span className="text-primary fw-bold">Bloque: {req.bloque}</span>
                                            </div>
                                            <div className="small text-muted mt-1">
                                                Solicitado por: <strong>{req.solicitante}</strong> ({req.fecha_solicitud})
                                            </div>
                                            {req.estado === 'Anulado' && req.motivo_anulacion && (
                                                <div className="small text-danger mt-1 fw-bold">
                                                    Motivo anulación: <span className="fw-normal">{req.motivo_anulacion}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="d-flex align-items-center justify-content-center justify-content-md-start gap-3 mt-2 mt-md-0">
                                            {/* Progress Bar */}
                                            <div style={{ width: '150px' }}>
                                                <small className="d-block mb-1 text-muted">Atención</small>
                                                <ProgressBar now={progress} label={`${progress}%`} variant={progress === 100 ? 'success' : 'warning'} style={{ height: '20px' }} />
                                            </div>

                                            {/* Export Button - Using div to avoid button-in-button warning from AccordionHeader */}
                                            {/* Export Button - Using div to avoid button-in-button warning from AccordionHeader */}
                                            <div
                                                className={`btn btn-sm btn-outline-success rounded-pill ${exportingId === req.id || req.estado === 'Anulado' ? 'disabled' : ''}`}
                                                style={{ cursor: (exportingId === req.id || req.estado === 'Anulado') ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (exportingId !== req.id && req.estado !== 'Anulado') {
                                                        handleExport(req);
                                                    }
                                                }}
                                                title={req.estado === 'Anulado' ? "No se puede exportar un requerimiento anulado" : "Exportar a Excel"}
                                            >
                                                {exportingId === req.id ? (
                                                    <Spinner animation="border" size="sm" />
                                                ) : (
                                                    <FaFileExcel size={16} />
                                                )}
                                            </div>

                                            {/* Anular Button */}
                                            {(() => {
                                                const hasSC = solicitudes.some(s => s.requerimiento_id === req.id && s.estado !== 'Anulada');
                                                const hasAtencion = req.detalles?.some(d => (d.cantidad_atendida || 0) > 0 || (d.cantidad_caja_chica || 0) > 0);
                                                const isAnulado = req.estado === 'Anulado';

                                                let tooltipMessage = "Anular Requerimiento";
                                                let isDisabled = false;

                                                if (isAnulado) {
                                                    isDisabled = true;
                                                    tooltipMessage = "El requerimiento ya está anulado";
                                                } else if (!(isAdmin || profile?.role === 'coordinador')) {
                                                    isDisabled = true;
                                                    tooltipMessage = "No tienes permisos para anular requerimientos";
                                                } else if (hasSC) {
                                                    isDisabled = true;
                                                    tooltipMessage = "No se puede anular: Este requerimiento ya posee una Solicitud de Compra vinculada.";
                                                } else if (hasAtencion) {
                                                    isDisabled = true;
                                                    tooltipMessage = "No se puede anular: Este requerimiento tiene ítems con atención.";
                                                }

                                                return (
                                                    <div
                                                        className={`btn btn-sm btn-outline-danger rounded-pill ${isDisabled ? 'disabled' : ''}`}
                                                        style={{ cursor: isDisabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!isDisabled) handleAnular(req);
                                                        }}
                                                        title={tooltipMessage}
                                                    >
                                                        <FaBan size={16} />
                                                    </div>
                                                );
                                            })()}

                                            {/* Edit Button */}
                                            <div
                                                className={`btn btn-sm btn-outline-primary rounded-pill ${solicitudes.some(s => s.requerimiento_id === req.id) || req.estado === 'Anulado' ? 'disabled' : ''}`}
                                                style={{ cursor: (solicitudes.some(s => s.requerimiento_id === req.id) || req.estado === 'Anulado') ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!solicitudes.some(s => s.requerimiento_id === req.id) && req.estado !== 'Anulado') {
                                                        handleEdit(req);
                                                    }
                                                }}
                                                title={req.estado === 'Anulado' ? "No se puede editar un requerimiento anulado" : (solicitudes.some(s => s.requerimiento_id === req.id) ? "No se puede editar con SC generada" : "Editar Requerimiento")}
                                            >
                                                <FaEdit size={16} />
                                            </div>
                                        </div>
                                    </div>
                                </Accordion.Header>
                                <Accordion.Body>
                                    <Table hover responsive className="table-borderless-custom mb-0">
                                        <thead>
                                            <tr>
                                                <th>Item</th>
                                                <th>Desc.</th>
                                                <th>Cant. Sol.</th>
                                                <th>SC Aprob.</th>
                                                <th>Cant. Atend.</th>
                                                <th>Estado</th>
                                                <th>Logística</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {req.detalles?.map(d => {
                                                // Encontrar ítem SC relacionado
                                                const relatedSC = solicitudes.find(s => s.requerimiento_id === req.id);
                                                const relatedSCItem = relatedSC?.detalles?.find(sd => {
                                                    if (d.tipo === 'Material') {
                                                        return sd.material?.descripcion === d.descripcion &&
                                                            sd.material?.categoria === d.material_categoria;
                                                    } else if (d.tipo === 'Equipo') {
                                                        return sd.equipo_id === d.equipo_id;
                                                    } else if (d.tipo === 'EPP') {
                                                        return sd.epp_id === d.epp_id;
                                                    }
                                                    return false;
                                                });

                                                return (
                                                    <tr key={d.id}>
                                                        <td>{d.tipo}</td>
                                                        <td>
                                                            <div className="fw-bold">{d.descripcion}</div>
                                                            <small className="text-muted">{d.material_categoria}</small>
                                                        </td>
                                                        <td>{Number(d.cantidad_solicitada).toFixed(2)} {d.unidad}</td>
                                                        <td>
                                                            {relatedSCItem ? (
                                                                <div>
                                                                    <div className="fw-bold text-primary">{Number(relatedSCItem.cantidad).toFixed(2)} {relatedSCItem.unidad}</div>
                                                                    {relatedSCItem.enviar_a_oc !== false ? (
                                                                        <small className="text-muted">{relatedSC?.numero_sc}</small>
                                                                    ) : (
                                                                        <Badge bg="info" className="text-dark bg-opacity-25 border border-info fw-normal" style={{ fontSize: '0.8em' }}>Inter./Stock</Badge>
                                                                    )}
                                                                </div>
                                                            ) : '-'}
                                                        </td>
                                                        <td>
                                                            <div className="d-flex align-items-center">
                                                                <span className="me-2">{d.cantidad_atendida}</span>
                                                                {d.cantidad_caja_chica ? (
                                                                        <Badge 
                                                                            bg="warning" 
                                                                            text="dark" 
                                                                            className="ms-1" 
                                                                            style={{ cursor: 'help' }}
                                                                            title={`${d.cantidad_caja_chica} ingresado por Caja Chica`}
                                                                        >
                                                                            <i className="bi bi-wallet2 me-1"></i>
                                                                            {d.cantidad_caja_chica}
                                                                        </Badge>
                                                                ) : null}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {relatedSCItem && Number(relatedSCItem.cantidad) === 0 ? (
                                                                <Badge
                                                                    bg="secondary"
                                                                    style={{ cursor: 'help', opacity: 0.75 }}
                                                                    className="d-inline-flex align-items-center gap-1"
                                                                    title={`Anulado en SC${relatedSCItem.comentario ? ': ' + relatedSCItem.comentario : ''}`}
                                                                >
                                                                    Sin Atención
                                                                </Badge>
                                                            ) : (
                                                                <Badge bg={getStatusColor(d.estado)}>{d.estado}</Badge>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <small>
                                                                {(() => {
                                                                    // Búsqueda dinámica de OC basada en el Ítem SC
                                                                    const relatedOC = ordenes.find(oc =>
                                                                        oc.estado !== 'Anulada' &&
                                                                        oc.detalles?.some(od => relatedSCItem && od.detalle_sc_id === relatedSCItem.id)
                                                                    );

                                                                    if (relatedOC) {
                                                                        return (
                                                                            <div>
                                                                                <div className="fw-bold text-success">{relatedOC.numero_oc}</div>
                                                                                <div>{relatedOC.proveedor}</div>
                                                                                {relatedOC.fecha_aproximada_atencion && (
                                                                                    <div className="text-primary mt-1" style={{ fontSize: '0.9em' }}>
                                                                                        <i className="bi bi-calendar-event me-1"></i>
                                                                                        {relatedOC.fecha_aproximada_atencion}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Respaldo a campos estáticos
                                                                    return (
                                                                        <>
                                                                            {d.orden_compra ? <div><strong>OC:</strong> {d.orden_compra}</div> : '-'}
                                                                            {d.proveedor && <div><strong>Prov:</strong> {d.proveedor}</div>}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </small>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </Table>
                                </Accordion.Body>
                            </Accordion.Item>
                        );
                    })}

                    {filteredReqs.length === 0 && <p className="text-center text-muted mt-5">No se encontraron requerimientos.</p>}
                </Accordion>
                <div className="px-3 pb-3">
                    <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={goToPage} />
                </div>
            </div>

            <RequerimientoForm
                show={showForm}
                handleClose={handleCloseModal}
                onSave={handleSave}
                obras={obras}
                initialData={editingReq}
            />

        </div >
    );
};

export default GestionRequerimientos;
