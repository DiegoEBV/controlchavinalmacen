import React, { useState, useEffect, useMemo } from 'react';
import { Button, Table, Badge, Accordion, ProgressBar, Row, Col, Form, Card } from 'react-bootstrap';
import { getRequerimientos, createRequerimiento, getObras, getUserAssignedObras, getRequerimientoById } from '../services/requerimientosService';
import { getSolicitudesCompra, getOrdenesCompra, getSolicitudCompraById, getOrdenCompraById } from '../services/comprasService';
import { Requerimiento, Obra, SolicitudCompra, OrdenCompra } from '../types';
import RequerimientoForm from '../components/RequerimientoForm';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const ITEMS_PER_PAGE = 20;

const GestionRequerimientos: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

    const { selectedObra, user, isAdmin } = useAuth();

    // --- Optimized Realtime Subscriptions ---

    // 1. Requerimientos
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            // Fetch full details
            const responses = await Promise.all(Array.from(upserts).map(id => getRequerimientoById(id)));
            const validItems = responses
                .filter(res => res.data !== null)
                .map(res => res.data as Requerimiento);

            setRequerimientos(prev => mergeUpdates(prev, validItems, deletes, 'id', (a, b) => {
                // Sort by item_correlativo descending (newest first)
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
            // Fetch updated SCs
            const responses = await Promise.all(Array.from(upserts).map(id => getSolicitudCompraById(id)));
            const validItems = responses.filter(res => res !== null) as SolicitudCompra[];
            setSolicitudes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setSolicitudes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'solicitudes_compra', throttleMs: 2000 });

    // 3. Ordenes
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

        // Reset pagination
        setVisibleCount(ITEMS_PER_PAGE);

        // Parallel fetching
        const pReqs = getRequerimientos(selectedObra.id);
        const pScs = getSolicitudesCompra(selectedObra.id);
        const pOcs = getOrdenesCompra(selectedObra.id);

        // Fetch Obras based on role
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

    const handleCreate = async (header: any, items: any[]) => {
        await createRequerimiento(header, items);
        // No need to call loadData() - Realtime will catch it! 
        // But for UX responsiveness we might want to opt-in, 
        // keeping it for now to ensure immediate feedback if realtime lags
        loadData();
    };

    const calculateProgress = (req: Requerimiento) => {
        if (!req.detalles?.length) return 0;
        let totalPct = 0;
        req.detalles.forEach(d => {
            totalPct += Math.min((d.cantidad_atendida / d.cantidad_solicitada), 1);
        });
        return Math.round((totalPct / req.detalles.length) * 100);
    };

    const getStatusColor = (status: string) => {
        if (status === 'Pendiente') return 'danger';
        if (status === 'Parcial') return 'warning';
        if (status === 'Atendido') return 'success';
        return 'secondary';
    };

    // Memoize filtering to avoid re-calculation on every render
    const filteredReqs = useMemo(() => {
        return requerimientos.filter(req =>
            req.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(req.item_correlativo).includes(searchTerm) ||
            (req.bloque && req.bloque.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [requerimientos, searchTerm]);

    // Apply pagination to the filtered list
    const visibleReqs = filteredReqs.slice(0, visibleCount);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + ITEMS_PER_PAGE);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Control de Requerimientos</h2>
                <Button onClick={() => setShowForm(true)} className="btn-primary">+ Nuevo Requerimiento</Button>
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
                                    <div className="d-flex flex-column flex-md-row w-100 justify-content-between align-items-md-center me-3 gap-2">
                                        <div>
                                            <strong>REQ #{req.item_correlativo}</strong>
                                            <span className="mx-2 text-muted d-none d-md-inline">|</span>
                                            <div className="d-md-inline d-block">
                                                <span className="text-primary fw-bold">Bloque: {req.bloque}</span>
                                            </div>
                                            <div className="small text-muted mt-1">
                                                Solicitado por: <strong>{req.solicitante}</strong> ({req.fecha_solicitud})
                                            </div>
                                        </div>
                                        <div style={{ width: '100%', maxWidth: '200px', textAlign: 'left' }} className="mt-2 mt-md-0">
                                            <small className="d-block mb-1 text-muted">Atención</small>
                                            <ProgressBar now={progress} label={`${progress}%`} variant={progress === 100 ? 'success' : 'warning'} style={{ height: '20px' }} />
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
                                                // Find related SC item
                                                const relatedSC = solicitudes.find(s => s.requerimiento_id === req.id);
                                                const relatedSCItem = relatedSC?.detalles?.find(sd =>
                                                    sd.material?.descripcion === d.descripcion &&
                                                    sd.material?.categoria === d.material_categoria
                                                );

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
                                                                    <small className="text-muted">{relatedSC?.numero_sc}</small>
                                                                </div>
                                                            ) : '-'}
                                                        </td>
                                                        <td>{d.cantidad_atendida}</td>
                                                        <td><Badge bg={getStatusColor(d.estado)}>{d.estado}</Badge></td>
                                                        <td>
                                                            <small>
                                                                {(() => {
                                                                    // Dynamic lookup of OC based on the SC Item
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

                                                                    // Fallback to static fields
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

                {/* Load More Button */}
                {visibleCount < filteredReqs.length && (
                    <div className="text-center p-3">
                        <Button variant="outline-primary" onClick={handleLoadMore}>
                            Cargar más requerimientos ({filteredReqs.length - visibleCount} restantes)
                        </Button>
                    </div>
                )}
            </div>

            <RequerimientoForm
                show={showForm}
                handleClose={() => setShowForm(false)}
                onSave={handleCreate}
                obras={obras}
            />
        </div>
    );
};

export default GestionRequerimientos;
