import React, { useState, useEffect } from 'react';
import { Button, Table, Badge, Accordion, ProgressBar, Row, Col, Form, Card } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos, createRequerimiento, getObras, getUserAssignedObras, getRequerimientoById } from '../services/requerimientosService';
import { getSolicitudesCompra, getOrdenesCompra, getSolicitudCompraById, getOrdenCompraById } from '../services/comprasService';
import { Requerimiento, Obra, SolicitudCompra, OrdenCompra } from '../types';
import RequerimientoForm from '../components/RequerimientoForm';
import { useAuth } from '../context/AuthContext';

const GestionRequerimientos: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { selectedObra, user, isAdmin } = useAuth();

    // --- Realtime Subscription ---
    useEffect(() => {
        const channel = supabase
            .channel('requerimientos-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'requerimientos' },
                async (payload) => {
                    const { eventType, new: newRecord } = payload;
                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        const { data: newReq } = await getRequerimientoById(newRecord.id);
                        if (newReq) {
                            setRequerimientos(prev => {
                                const exists = prev.find(r => r.id === newReq.id);
                                if (exists) return prev.map(r => r.id === newReq.id ? newReq : r);
                                return [newReq, ...prev];
                            });
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'solicitudes_compra' },
                async (payload) => {
                    const { eventType, new: newRecord } = payload;
                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        const newSC = await getSolicitudCompraById(newRecord.id);
                        if (newSC) {
                            setSolicitudes(prev => {
                                const exists = prev.find(s => s.id === newSC.id);
                                if (exists) return prev.map(s => s.id === newSC.id ? newSC : s);
                                return [newSC, ...prev];
                            });
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'ordenes_compra' },
                async (payload) => {
                    const newOC = await getOrdenCompraById(payload.new.id);
                    if (newOC) {
                        setOrdenes(prev => {
                            if (prev.find(o => o.id === newOC.id)) return prev;
                            return [newOC, ...prev];
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []); // Empty dependency array

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

    const filteredReqs = requerimientos.filter(req =>
        req.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(req.item_correlativo).includes(searchTerm) ||
        (req.bloque && req.bloque.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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
                    {filteredReqs.map((req, idx) => {
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

                <RequerimientoForm
                    show={showForm}
                    handleClose={() => setShowForm(false)}
                    onSave={handleCreate}
                    obras={obras}
                />
            </div>
        </div>
    );
};

export default GestionRequerimientos;
