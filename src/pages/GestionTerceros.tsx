import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Modal, Spinner, InputGroup, Card, Row, Col } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { Obra, Tercero } from '../types';
import { getTerceros, createTercero, updateTercero, deleteTercero } from '../services/tercerosService';
import { supabase } from '../config/supabaseClient';

const GestionTerceros = () => {
    // const { selectedObra } = useAuth(); // If needed later
    const [obras, setObras] = useState<Obra[]>([]);
    const [selectedObraId, setSelectedObraId] = useState('');
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        nombre_completo: '',
        ruc: '',
        dni: '',
        direccion: '',
        telefono: '',
        email: ''
    });

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [terceroToDelete, setTerceroToDelete] = useState<Tercero | null>(null);

    useEffect(() => {
        fetchObras();
    }, []);

    useEffect(() => {
        if (selectedObraId) {
            fetchTerceros();
        } else {
            setTerceros([]);
        }
    }, [selectedObraId]);

    const fetchObras = async () => {
        try {
            const { data, error } = await supabase
                .from('obras')
                .select('*')
                .order('nombre_obra');
            if (error) throw error;
            setObras(data || []);
        } catch (error: any) {
            setError('Error cargando obras: ' + error.message);
        }
    };

    const fetchTerceros = async () => {
        if (!selectedObraId) return;
        setLoading(true);
        try {
            const data = await getTerceros(selectedObraId);
            setTerceros(data);
        } catch (error: any) {
            setError('Error al cargar terceros: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
    };

    const filteredTerceros = terceros.filter(t =>
        t.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.ruc && t.ruc.includes(searchTerm)) ||
        (t.dni && t.dni.includes(searchTerm))
    );

    const handleOpenModal = (tercero?: Tercero) => {
        if (tercero) {
            setEditingId(tercero.id);
            setFormData({
                nombre_completo: tercero.nombre_completo,
                ruc: tercero.ruc || '',
                dni: tercero.dni || '',
                direccion: tercero.direccion || '',
                telefono: tercero.telefono || '',
                email: tercero.email || ''
            });
        } else {
            setEditingId(null);
            setFormData({
                nombre_completo: '',
                ruc: '',
                dni: '',
                direccion: '',
                telefono: '',
                email: ''
            });
        }
        setError(null);
        setShowModal(true);
    };

    const validateForm = () => {
        if (formData.ruc && !/^\d{11}$/.test(formData.ruc)) {
            setError('El RUC debe tener exactamente 11 dígitos numéricos.');
            return false;
        }
        if (formData.dni && !/^\d{8}$/.test(formData.dni)) {
            setError('El DNI debe tener exactamente 8 dígitos numéricos.');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedObraId) return;
        if (!validateForm()) return;

        setSubmitting(true);
        setError(null);

        try {
            if (editingId) {
                await updateTercero(editingId, formData);
                setSuccessMessage('Tercero actualizado correctamente.');
            } else {
                await createTercero({
                    ...formData,
                    obra_id: selectedObraId
                });
                setSuccessMessage('Tercero creado correctamente.');
            }
            setShowModal(false);
            fetchTerceros();
        } catch (error: any) {
            setError(error.message);
        } finally {
            setSubmitting(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleDeleteClick = (tercero: Tercero) => {
        setTerceroToDelete(tercero);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!terceroToDelete) return;
        setSubmitting(true);
        try {
            await deleteTercero(terceroToDelete.id);
            setSuccessMessage(`Se eliminó a ${terceroToDelete.nombre_completo}`);
            setShowDeleteModal(false);
            fetchTerceros();
        } catch (error: any) {
            setError('Error al eliminar: ' + error.message);
        } finally {
            setSubmitting(false);
            setTerceroToDelete(null);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <Container className="mt-4 fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2>Gestión de Terceros</h2>
                    <p className="text-secondary mb-0">Administre los proveedores, subcontratistas y personal externo.</p>
                </div>
            </div>

            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
            {successMessage && <Alert variant="success" onClose={() => setSuccessMessage(null)} dismissible>{successMessage}</Alert>}

            <Card className="mb-4 custom-card shadow-sm border-0">
                <Card.Body>
                    <Form.Group as={Row} className="align-items-center">
                        <Form.Label column sm={2} className="fw-bold text-secondary">Seleccionar Obra:</Form.Label>
                        <Col sm={6}>
                            <Form.Select
                                value={selectedObraId}
                                onChange={e => setSelectedObraId(e.target.value)}
                                className="border-secondary-subtle"
                            >
                                <option value="">-- Seleccione una Obra --</option>
                                {obras.map(o => (
                                    <option key={o.id} value={o.id}>{o.nombre_obra}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col sm={4} className="text-end">
                            <Button
                                variant="success"
                                disabled={!selectedObraId}
                                onClick={() => handleOpenModal()}
                                className="shadow-sm"
                            >
                                <i className="bi bi-plus-lg me-2"></i>Nuevo Tercero
                            </Button>
                        </Col>
                    </Form.Group>
                </Card.Body>
            </Card>

            {selectedObraId ? (
                <>
                    <InputGroup className="mb-4 shadow-sm">
                        <InputGroup.Text className="bg-white text-muted"><i className="bi bi-search"></i></InputGroup.Text>
                        <Form.Control
                            placeholder="Buscar por nombre, RUC o DNI..."
                            value={searchTerm}
                            onChange={handleSearch}
                        />
                    </InputGroup>

                    <div className="card custom-card shadow-sm border-0">
                        <div className="card-header bg-white py-3 border-bottom-0">
                            <h5 className="mb-0 fw-bold text-dark">Listado de Terceros</h5>
                        </div>
                        <div className="table-responsive">
                            <Table hover className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="py-3 ps-4 text-secondary text-uppercase x-small opacity-75 border-0">Nombre Completo</th>
                                        <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">RUC</th>
                                        <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">DNI</th>
                                        <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">Teléfono</th>
                                        <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">Email</th>
                                        <th className="py-3 pe-4 text-end text-secondary text-uppercase x-small opacity-75 border-0">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="border-top-0">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-5 text-muted">
                                                <Spinner animation="border" size="sm" className="me-2" /> Cargando terceros...
                                            </td>
                                        </tr>
                                    ) : filteredTerceros.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-5 text-muted">
                                                <i className="bi bi-people mb-2 d-block text-secondary opacity-50 fs-4"></i>
                                                {searchTerm ? 'No se encontraron resultados para su búsqueda.' : 'No se encontraron terceros registrados en esta obra.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTerceros.map((t) => (
                                            <tr key={t.id} className="border-bottom">
                                                <td className="ps-4 py-3 fw-bold text-dark">{t.nombre_completo}</td>
                                                <td className="py-3">
                                                    {t.ruc ? <span className="badge bg-light text-dark border">{t.ruc}</span> : <span className="text-muted">-</span>}
                                                </td>
                                                <td className="py-3">
                                                    {t.dni ? <span className="badge bg-light text-dark border">{t.dni}</span> : <span className="text-muted">-</span>}
                                                </td>
                                                <td className="py-3 text-muted small">{t.telefono || '-'}</td>
                                                <td className="py-3 text-muted small">{t.email || '-'}</td>
                                                <td className="pe-4 py-3 text-end">
                                                    <div className="d-flex justify-content-end gap-2">
                                                        <Button
                                                            variant="outline-primary"
                                                            size="sm"
                                                            className="rounded-pill px-3 d-inline-flex align-items-center gap-1"
                                                            onClick={() => handleOpenModal(t)}
                                                            title="Editar"
                                                        >
                                                            <i className="bi bi-pencil-fill"></i> Editar
                                                        </Button>
                                                        <Button
                                                            variant="outline-danger"
                                                            size="sm"
                                                            className="rounded-pill px-3 d-inline-flex align-items-center gap-1"
                                                            onClick={() => handleDeleteClick(t)}
                                                            title="Eliminar"
                                                        >
                                                            <i className="bi bi-trash-fill"></i> Eliminar
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </Table>
                        </div>
                    </div>
                </>
            ) : (
                <Alert variant="warning" className="shadow-sm border-0">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    Por favor seleccione una obra para gestionar los terceros.
                </Alert>
            )}

            {/* Modal Create/Edit */}
            <Modal show={showModal} onHide={() => setShowModal(false)} backdrop="static">
                <Modal.Header closeButton>
                    <Modal.Title>{editingId ? 'Editar Tercero' : 'Nuevo Tercero'}</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSubmit}>
                    <Modal.Body>
                        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre Completo *</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.nombre_completo}
                                onChange={e => setFormData({ ...formData, nombre_completo: e.target.value })}
                                required
                                autoFocus
                            />
                        </Form.Group>
                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3">
                                    <Form.Label>RUC (11 dígitos)</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={formData.ruc}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, ''); // Solo números
                                            if (val.length <= 11) setFormData({ ...formData, ruc: val });
                                        }}
                                        placeholder="Opcional"
                                    />
                                    <Form.Text className="text-muted">Solo números</Form.Text>
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group className="mb-3">
                                    <Form.Label>DNI (8 dígitos)</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={formData.dni}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, ''); // Solo números
                                            if (val.length <= 8) setFormData({ ...formData, dni: val });
                                        }}
                                        placeholder="Opcional"
                                    />
                                </Form.Group>
                            </div>
                        </div>
                        <Form.Group className="mb-3">
                            <Form.Label>Dirección</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.direccion}
                                onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                                placeholder="Domicilio Fiscal o dirección"
                            />
                        </Form.Group>
                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group className="mb-3">
                                    <Form.Label>Teléfono</Form.Label>
                                    <Form.Control
                                        type="tel"
                                        value={formData.telefono}
                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group className="mb-3">
                                    <Form.Label>Email</Form.Label>
                                    <Form.Control
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </Form.Group>
                            </div>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" type="submit" disabled={submitting}>
                            {submitting ? <Spinner size="sm" animation="border" /> : (editingId ? 'Guardar Cambios' : 'Crear Tercero')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modal Delete Confirmation */}
            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Confirmar Eliminación</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    ¿Está seguro que desea eliminar al tercero <strong>{terceroToDelete?.nombre_completo}</strong>?
                    <br />
                    <span className="text-muted small">Esta acción no se puede deshacer.</span>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
                    <Button variant="danger" onClick={confirmDelete} disabled={submitting}>
                        {submitting ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionTerceros;
