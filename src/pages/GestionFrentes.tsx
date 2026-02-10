import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Table, Button, Alert, Modal, Spinner } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Obra, Frente } from '../types';
// import { useAuth } from '../context/AuthContext';

const GestionFrentes: React.FC = () => {
    // const { session } = useAuth();
    const [obras, setObras] = useState<Obra[]>([]);
    const [selectedObraId, setSelectedObraId] = useState('');
    const [frentes, setFrentes] = useState<Frente[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal Create
    const [showModal, setShowModal] = useState(false);
    const [newFrenteName, setNewFrenteName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchObras();
    }, []);

    useEffect(() => {
        if (selectedObraId) {
            fetchFrentes(selectedObraId);
        } else {
            setFrentes([]);
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

    const fetchFrentes = async (obraId: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('frentes')
                .select('*')
                .eq('obra_id', obraId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setFrentes(data || []);
        } catch (error: any) {
            setError('Error cargando frentes: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFrente = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedObraId) return alert('Seleccione una obra primero');

        setCreating(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('frentes')
                .insert([{
                    obra_id: selectedObraId,
                    nombre_frente: newFrenteName
                }])
                .select()
                .single();

            if (error) throw error;

            setFrentes([data, ...frentes]);
            setSuccessMessage(`Frente "${data.nombre_frente}" creado.`);
            setShowModal(false);
            setNewFrenteName('');
        } catch (error: any) {
            setError('Error creando frente: ' + error.message);
        } finally {
            setCreating(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleDeleteFrente = async (id: string) => {
        if (!confirm('¿Seguro que desea eliminar este frente? Esto podría afectar a materiales y requerimientos asociados.')) return;

        try {
            const { error } = await supabase
                .from('frentes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setFrentes(frentes.filter(f => f.id !== id));
            setSuccessMessage('Frente eliminado correctamente.');
        } catch (error: any) {
            setError('Error eliminando frente: ' + error.message);
        } finally {
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <Container className="mt-4 fade-in">
            <h2>Gestión de Frentes de Trabajo</h2>
            <p className="text-secondary">Administre las Unidades de Trabajo (Frentes) por Obra.</p>

            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <Card className="mb-4 custom-card">
                <Card.Body>
                    <Form.Group as={Row} className="align-items-center">
                        <Form.Label column sm={2}>Seleccionar Obra:</Form.Label>
                        <Col sm={6}>
                            <Form.Select
                                value={selectedObraId}
                                onChange={e => setSelectedObraId(e.target.value)}
                            >
                                <option value="">-- Seleccione --</option>
                                {obras.map(o => (
                                    <option key={o.id} value={o.id}>{o.nombre_obra}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col sm={4} className="text-end">
                            <Button
                                variant="primary"
                                disabled={!selectedObraId}
                                onClick={() => setShowModal(true)}
                            >
                                + Nuevo Frente
                            </Button>
                        </Col>
                    </Form.Group>
                </Card.Body>
            </Card>

            <Card className="custom-card">
                <Card.Header>Listado de Frentes</Card.Header>
                <Table hover responsive className="mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre del Frente</th>
                            <th>ID</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={3} className="text-center"><Spinner animation="border" size="sm" /> Cargando...</td></tr>
                        ) : frentes.length === 0 ? (
                            <tr><td colSpan={3} className="text-center">No hay frentes registrados para esta obra.</td></tr>
                        ) : (
                            frentes.map(f => (
                                <tr key={f.id}>
                                    <td className="fw-bold">{f.nombre_frente}</td>
                                    <td className="text-muted small">{f.id}</td>
                                    <td>
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            onClick={() => handleDeleteFrente(f.id)}
                                        >
                                            Eliminar
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </Card>

            {/* Modal Create */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Crear Nuevo Frente</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateFrente}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre del Frente (Unidad de Trabajo)</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Estructuras - Torre A"
                                value={newFrenteName}
                                onChange={e => setNewFrenteName(e.target.value)}
                                required
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" type="submit" disabled={creating}>
                            {creating ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </Container>
    );
};

export default GestionFrentes;
