import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Modal, Spinner } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Obra } from '../types';

const GestionObras = () => {
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [newObraName, setNewObraName] = useState('');
    const [newObraLocation, setNewObraLocation] = useState('');
    const [creating, setCreating] = useState(false);

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
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={3} className="text-center py-4">
                                    <Spinner animation="border" size="sm" /> Cargando obras...
                                </td>
                            </tr>
                        ) : obras.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="text-center py-4">No hay obras registradas.</td>
                            </tr>
                        ) : (
                            obras.map((obra) => (
                                <tr key={obra.id}>
                                    <td className="fw-bold">{obra.nombre_obra}</td>
                                    <td>{obra.ubicacion || '-'}</td>
                                    <td className="text-muted small">{obra.id}</td>
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
        </Container>
    );
};

export default GestionObras;
