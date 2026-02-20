import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Container, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { getEquipos, createEquipo, updateEquipo, deleteEquipo } from '../services/equiposService';
import { getObras, getUserAssignedObras } from '../services/requerimientosService';
import { Equipo, Obra } from '../types';

const GestionEquipos: React.FC = () => {
    const { selectedObra, selectObra, hasRole, user, isAdmin, loading: authLoading } = useAuth();
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingEquipo, setEditingEquipo] = useState<Equipo | null>(null);
    const [formData, setFormData] = useState<Partial<Equipo>>({
        nombre: '',
        codigo: '',
        marca: ''
    });
    const [error, setError] = useState('');

    const canEdit = hasRole(['admin', 'coordinador', 'logistica']);

    useEffect(() => {
        loadObras();
    }, [user, isAdmin]);

    useEffect(() => {
        if (selectedObra) {
            fetchEquipos();
        }
    }, [selectedObra]);

    const loadObras = async () => {
        if (!user) return;
        try {
            let data: Obra[] = [];
            if (isAdmin) {
                const res = await getObras();
                data = res as Obra[];
            } else {
                data = await getUserAssignedObras(user.id);
            }
            setObras(data || []);
        } catch (err) {
            console.error("Error loading obras:", err);
        }
    };

    const fetchEquipos = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            const data = await getEquipos(selectedObra.id);
            setEquipos(data || []);
        } catch (err) {
            console.error(err);
            setError('Error al cargar equipos.');
        } finally {
            setLoading(false);
        }
    };

    const handleShow = (equipo?: Equipo) => {
        if (equipo) {
            setEditingEquipo(equipo);
            setFormData({
                nombre: equipo.nombre,
                codigo: equipo.codigo,
                marca: equipo.marca
            });
        } else {
            setEditingEquipo(null);
            setFormData({
                nombre: '',
                codigo: '',
                marca: ''
            });
        }
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false);
        setError('');
    };

    const handleSave = async () => {
        if (!selectedObra) return;
        if (!formData.nombre) {
            setError('El nombre es obligatorio.');
            return;
        }

        try {
            if (editingEquipo) {
                await updateEquipo(editingEquipo.id, formData);
            } else {
                await createEquipo({ ...formData, obra_id: selectedObra.id });
            }
            fetchEquipos();
            handleClose();
        } catch (err) {
            console.error(err);
            setError('Error al guardar el equipo.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este equipo?')) return;
        try {
            await deleteEquipo(id);
            fetchEquipos();
        } catch (err) {
            console.error(err);
            setError('Error al eliminar el equipo.');
        }
    };

    if (authLoading) return <div className="text-center mt-5"><Spinner animation="border" /></div>;

    return (
        <Container fluid className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4 fade-in">
                <h2 className="mb-0 fw-bold text-dark">Gestión de Equipos</h2>
                <div style={{ width: '300px' }}>
                    <Form.Select
                        value={selectedObra?.id || ''}
                        onChange={(e) => {
                            const obra = obras.find(o => o.id === e.target.value);
                            if (obra) selectObra(obra);
                        }}
                        className="shadow-sm border-0"
                    >
                        <option value="">Seleccione Obra...</option>
                        {obras.map(o => (
                            <option key={o.id} value={o.id}>{o.nombre_obra}</option>
                        ))}
                    </Form.Select>
                </div>
            </div>
            {error && <Alert variant="danger" className="shadow-sm border-0 rounded-3 mb-4">{error}</Alert>}

            <div className="custom-card fade-in">
                <Row className="mb-4">
                    <Col>
                        {canEdit && (
                            <Button variant="primary" onClick={() => handleShow()}>
                                + Nuevo Equipo
                            </Button>
                        )}
                    </Col>
                </Row>

                {loading ? (
                    <div className="text-center py-5">
                        <Spinner animation="border" variant="primary" />
                    </div>
                ) : (
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Código</th>
                                    <th>Nombre</th>
                                    <th>Marca</th>
                                    {canEdit && <th className="text-end pe-4">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {equipos.map((eq) => (
                                    <tr key={eq.id}>
                                        <td className="ps-4 fw-bold text-primary">{eq.codigo}</td>
                                        <td>{eq.nombre}</td>
                                        <td>{eq.marca}</td>
                                        {canEdit && (
                                            <td className="text-end pe-4">
                                                <Button variant="link" className="text-primary p-0 me-3" onClick={() => handleShow(eq)} title="Editar">
                                                    Editar
                                                </Button>
                                                <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(eq.id)} title="Eliminar">
                                                    Eliminar
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {equipos.length === 0 && (
                                    <tr>
                                        <td colSpan={canEdit ? 4 : 3} className="text-center py-5 text-muted">
                                            No hay equipos registrados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                )}
            </div>

            <Modal show={showModal} onHide={handleClose}>
                <Modal.Header closeButton>
                    <Modal.Title>{editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre *</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Código</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.codigo}
                                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Marca</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.marca}
                                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}>Guardar</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionEquipos;
