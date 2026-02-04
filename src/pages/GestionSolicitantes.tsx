import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { getSolicitantes, createSolicitante, deleteSolicitante } from '../services/requerimientosService';

const GestionSolicitantes: React.FC = () => {
    const [solicitantes, setSolicitantes] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [newItem, setNewItem] = useState({
        nombre: '',
        cargo: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await getSolicitantes();
        setSolicitantes(data || []);
    };

    const handleSave = async () => {
        if (!newItem.nombre) return alert("El nombre es obligatorio");

        try {
            await createSolicitante(newItem);
            setShowModal(false);
            setNewItem({ nombre: '', cargo: '' });
            loadData();
        } catch (error: any) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar este solicitante?")) {
            try {
                await deleteSolicitante(id);
                loadData();
            } catch (error: any) {
                alert("Error al eliminar: " + error.message);
            }
        }
    };

    const filteredItems = solicitantes.filter(item =>
        item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.cargo && item.cargo.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Gestión de Solicitantes</h2>
                <Button onClick={() => setShowModal(true)} className="btn-primary">+ Nuevo Solicitante</Button>
            </div>

            <Card className="custom-card">
                <Form.Control
                    placeholder="Buscar solicitante..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                />
            </Card>

            <Card className="custom-card p-0">
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre</th>
                            <th>Cargo</th>
                            <th style={{ width: '100px' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map(item => (
                            <tr key={item.id}>
                                <td>{item.nombre}</td>
                                <td>{item.cargo || '-'}</td>
                                <td>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>Eliminar</Button>
                                </td>
                            </tr>
                        ))}
                        {filteredItems.length === 0 && (
                            <tr><td colSpan={3} className="text-center text-muted">No hay solicitantes registrados</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Nuevo Solicitante</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre Completo *</Form.Label>
                            <Form.Control
                                value={newItem.nombre}
                                onChange={e => setNewItem({ ...newItem, nombre: e.target.value })}
                                autoFocus
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Cargo</Form.Label>
                            <Form.Control
                                value={newItem.cargo}
                                onChange={e => setNewItem({ ...newItem, cargo: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}>Guardar</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionSolicitantes;
