import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Modal, Spinner } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Obra } from '../types';

const GestionObras = () => {
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Create Modal State
    const [showModal, setShowModal] = useState(false);
    const [newObraName, setNewObraName] = useState('');
    const [newObraLocation, setNewObraLocation] = useState('');
    const [creating, setCreating] = useState(false);

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingObra, setEditingObra] = useState<Obra | null>(null);
    const [editObraName, setEditObraName] = useState('');
    const [editObraLocation, setEditObraLocation] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        fetchObras();
    }, []);

    const fetchObras = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('obras')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setObras(data || []);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateObra = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from('obras')
                .insert([
                    { nombre_obra: newObraName, ubicacion: newObraLocation }
                ])
                .select()
                .single();

            if (error) throw error;

            setObras([data, ...obras]);
            setSuccessMessage(`Obra "${data.nombre_obra}" creada correctamente.`);
            setShowModal(false);
            setNewObraName('');
            setNewObraLocation('');
        } catch (error: any) {
            setError(error.message);
        } finally {
            setCreating(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleEditClick = (obra: Obra) => {
        setEditingObra(obra);
        setEditObraName(obra.nombre_obra);
        setEditObraLocation(obra.ubicacion || '');
        setShowEditModal(true);
    };

    const handleUpdateObra = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingObra) return;

        setUpdating(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from('obras')
                .update({ nombre_obra: editObraName, ubicacion: editObraLocation })
                .eq('id', editingObra.id)
                .select()
                .single();

            if (error) throw error;

            setObras(obras.map((obra) => (obra.id === editingObra.id ? data : obra)));
            setSuccessMessage(`Obra "${data.nombre_obra}" actualizada correctamente.`);
            setShowEditModal(false);
            setEditingObra(null);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setUpdating(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <Container className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>Gestión de Obras</h2>
                <Button variant="success" onClick={() => setShowModal(true)}>
                    + Nueva Obra
                </Button>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <div className="table-responsive shadow-sm">
                <Table hover className="align-middle bg-white">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre de Obra</th>
                            <th>Ubicación</th>
                            <th>ID</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="text-center py-4">
                                    <Spinner animation="border" size="sm" /> Cargando obras...
                                </td>
                            </tr>
                        ) : obras.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center py-4">No hay obras registradas.</td>
                            </tr>
                        ) : (
                            obras.map((obra) => (
                                <tr key={obra.id}>
                                    <td className="fw-bold">{obra.nombre_obra}</td>
                                    <td>{obra.ubicacion || '-'}</td>
                                    <td className="text-muted small">{obra.id}</td>
                                    <td>
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => handleEditClick(obra)}
                                        >
                                            <i className="bi bi-pencil"></i> Editar
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>

            {/* Create Obra Modal */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Crear Nueva Obra</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateObra}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre de la Obra</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Residencial Los Pinos"
                                value={newObraName}
                                onChange={(e) => setNewObraName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Ubicación</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Av. Principal 123"
                                value={newObraLocation}
                                onChange={(e) => setNewObraLocation(e.target.value)}
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="primary" type="submit" disabled={creating}>
                            {creating ? 'Creando...' : 'Crear Obra'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Edit Obra Modal */}
            <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Editar Obra</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleUpdateObra}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre de la Obra</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Residencial Los Pinos"
                                value={editObraName}
                                onChange={(e) => setEditObraName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Ubicación</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Av. Principal 123"
                                value={editObraLocation}
                                onChange={(e) => setEditObraLocation(e.target.value)}
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="primary" type="submit" disabled={updating}>
                            {updating ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </Container>
    );
};

export default GestionObras;
