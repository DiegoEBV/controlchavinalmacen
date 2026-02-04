import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Badge, Alert } from 'react-bootstrap';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { registrarEntrada } from '../services/almacenService';
import { Requerimiento, DetalleRequerimiento, Material } from '../types';

const EntradasAlmacen: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [materialesList, setMaterialesList] = useState<Material[]>([]);

    const [selectedReq, setSelectedReq] = useState<Requerimiento | null>(null);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // Entry Form State
    const [selectedDetail, setSelectedDetail] = useState<DetalleRequerimiento | null>(null);
    const [cantidadIngreso, setCantidadIngreso] = useState(0);
    const [docReferencia, setDocReferencia] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (refreshReqId?: string) => {
        const [reqsData, matsData] = await Promise.all([
            getRequerimientos(),
            getMateriales()
        ]);

        let currentReqs: Requerimiento[] = [];
        if (reqsData.data) {
            // Filter only reqs with items pending
            const pendingReqs = reqsData.data.filter(r =>
                r.detalles?.some(d => d.tipo === 'Material' && d.estado !== 'Atendido' && d.estado !== 'Cancelado')
            );
            setRequerimientos(pendingReqs);
            currentReqs = pendingReqs;
        }
        if (matsData) setMaterialesList(matsData);

        // Sync selectedReq if it exists to prevent stale state
        if (refreshReqId) {
            const updatedReq = currentReqs.find(r => r.id === refreshReqId);
            if (updatedReq) {
                setSelectedReq(updatedReq);
            } else {
                // If it's no longer pending (completed), clear selection
                setSelectedReq(null);
                setSuccessMsg("Requerimiento completado totalmente.");
            }
        }
    };

    const handleSelectReq = (reqId: string) => {
        const req = requerimientos.find(r => r.id === reqId) || null;
        setSelectedReq(req);
        setSelectedDetail(null);
        setCantidadIngreso(0);
        setSuccessMsg('');
    };

    const handleRegister = async () => {
        if (!selectedReq || !selectedDetail) return;

        // Validation: Prevent over-delivery
        const pendiente = selectedDetail.cantidad_solicitada - selectedDetail.cantidad_atendida;

        if (cantidadIngreso <= 0) return alert("Cantidad debe ser mayor a 0");
        if (cantidadIngreso > pendiente) return alert(`Error: La cantidad a ingresar (${cantidadIngreso}) excede lo pendiente (${pendiente}).`);
        if (!docReferencia) return alert("Ingrese Documento de Referencia (Guía/Factura)");

        // Find Material ID
        const material = materialesList.find(m =>
            m.descripcion === selectedDetail.descripcion &&
            m.categoria === selectedDetail.material_categoria
        );

        if (!material) {
            return alert("Error: El material no se encuentra en el catálogo maestro.");
        }

        setLoading(true);
        try {
            await registrarEntrada(
                material.id,
                cantidadIngreso,
                selectedReq.id,
                selectedDetail.id,
                docReferencia
            );
            setSuccessMsg("Entrada registrada correctamente");
            setSelectedDetail(null);
            setDocReferencia('');

            // Refresh and Sync State
            loadData(selectedReq.id);

        } catch (error) {
            console.error(error);
            alert("Error al registrar entrada: " + error);
        }
        setLoading(false);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Registrar Entrada de Almacén</h2>
            </div>
            <p className="text-muted mb-4">Seleccione un requerimiento pendiente para ingresar materiales del inventario.</p>

            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Row className="mb-4">
                <Col md={6}>
                    <Form.Group>
                        <Form.Label>Buscar Requerimiento (Solicitante / Items)</Form.Label>
                        <Form.Select onChange={e => handleSelectReq(e.target.value)} value={selectedReq?.id || ''}>
                            <option value="">Seleccione Requerimiento...</option>
                            {requerimientos.map(r => (
                                <option key={r.id} value={r.id}>
                                    REQ #{r.item_correlativo} - {r.bloque} ({r.solicitante})
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Col>
            </Row>

            {selectedReq && (
                <Card className="custom-card">
                    <h5 className="mb-4 text-primary fw-bold">Detalle del Requerimiento #{selectedReq.item_correlativo}</h5>
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Solicitado</th>
                                    <th>Atendido</th>
                                    <th>Pendiente</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedReq.detalles?.filter(d => d.tipo === 'Material').map(d => {
                                    const pendiente = d.cantidad_solicitada - d.cantidad_atendida;
                                    const isSelected = selectedDetail?.id === d.id;
                                    return (
                                        <tr key={d.id} className={isSelected ? 'table-primary' : ''}>
                                            <td>
                                                <strong>{d.descripcion}</strong> <br />
                                                <small>{d.material_categoria}</small>
                                            </td>
                                            <td>{d.cantidad_solicitada} {d.unidad}</td>
                                            <td>{d.cantidad_atendida}</td>
                                            <td>{pendiente > 0 ? pendiente : 0}</td>
                                            <td>
                                                {pendiente > 0 ? (
                                                    <Button
                                                        size="sm"
                                                        variant={isSelected ? 'secondary' : 'primary'}
                                                        onClick={() => {
                                                            setSelectedDetail(d);
                                                            setCantidadIngreso(pendiente); // Default to max pending
                                                        }}
                                                    >
                                                        Seleccionar
                                                    </Button>
                                                ) : <Badge bg="success">Completo</Badge>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>



                    </div>

                    {
                        selectedDetail && (
                            <div className="bg-light p-4 rounded-3 border-0 mt-4 fade-in">
                                <h6 className="text-primary fw-bold mb-3">Registrar Ingreso: {selectedDetail.descripcion}</h6>
                                <Row className="align-items-end g-3">
                                    <Col md={4}>
                                        <Form.Label>Doc. Referencia</Form.Label>
                                        <Form.Control
                                            value={docReferencia}
                                            onChange={e => setDocReferencia(e.target.value)}
                                            placeholder="Ej. GR-00123"
                                        />
                                    </Col>
                                    <Col md={4}>
                                        <Form.Label>Cantidad a Ingresar</Form.Label>
                                        <Form.Control
                                            type="number"
                                            value={cantidadIngreso}
                                            onChange={e => setCantidadIngreso(parseFloat(e.target.value))}
                                        />
                                    </Col>
                                    <Col md={4}>
                                        <Button
                                            variant="success"
                                            className="w-100 btn-primary"
                                            onClick={handleRegister}
                                            disabled={loading}
                                            style={{ backgroundColor: 'var(--primary-green)', borderColor: 'var(--primary-green)' }}
                                        >
                                            {loading ? 'Procesando...' : 'Confirmar Ingreso'}
                                        </Button>
                                    </Col>
                                </Row>
                            </div>
                        )
                    }
                </Card>
            )}
        </div>
    );
};

export default EntradasAlmacen;
