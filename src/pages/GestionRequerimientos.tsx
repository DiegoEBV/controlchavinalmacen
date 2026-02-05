import React, { useState, useEffect } from 'react';
import { Button, Table, Badge, Accordion, ProgressBar, Row, Col, Form, Card } from 'react-bootstrap';
import { getRequerimientos, createRequerimiento, getObras } from '../services/requerimientosService';
import { getSolicitudesCompra, getOrdenesCompra } from '../services/comprasService';
import { Requerimiento, Obra, SolicitudCompra, OrdenCompra } from '../types';
import RequerimientoForm from '../components/RequerimientoForm';

const GestionRequerimientos: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [reqs, scs, obs, ocs] = await Promise.all([
            getRequerimientos(),
            getSolicitudesCompra(),
            getObras(),
            getOrdenesCompra()
        ]);

        if (reqs.data) setRequerimientos(reqs.data);
        if (scs) setSolicitudes(scs);
        setObras(obs || []);
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
                <Form.Group as={Row} className="align-items-center">
                    <Form.Label column sm="auto" className="fw-bold text-secondary">Filtrar:</Form.Label>
                    <Col>
                        <Form.Control
                            placeholder="Buscar por Solicitante, Número o Bloque..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </Col>
                </Form.Group>
            </Card>

            <div className="custom-card p-0 overflow-hidden">
                <Accordion defaultActiveKey="0" flush>
                    {filteredReqs.map((req, idx) => {
                        const progress = calculateProgress(req);
                        return (
                            <Accordion.Item eventKey={String(idx)} key={req.id}>
                                <Accordion.Header>
                                    <div className="d-flex w-100 justify-content-between align-items-center me-3">
                                        <div>
                                            <strong>REQ #{req.item_correlativo}</strong>
                                            <span className="mx-2 text-muted">|</span>
                                            <span className="text-primary fw-bold">Bloque: {req.bloque}</span>
                                            <div className="small text-muted mt-1">
                                                Solicitado por: <strong>{req.solicitante}</strong> ({req.fecha_solicitud})
                                            </div>
                                        </div>
                                        <div style={{ width: 150, textAlign: 'right' }}>
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
                                                        <td>{d.cantidad_solicitada} {d.unidad}</td>
                                                        <td>
                                                            {relatedSCItem ? (
                                                                <div>
                                                                    <div className="fw-bold text-primary">{relatedSCItem.cantidad} {relatedSCItem.unidad}</div>
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
