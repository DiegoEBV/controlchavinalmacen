import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { getCategorias, createCategoria, deleteCategoria } from '../services/requerimientosService';

const GestionCategorias: React.FC = () => {
    const [categorias, setCategorias] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [newItem, setNewItem] = useState({
        nombre: '',
        descripcion: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await getCategorias();
        setCategorias(data || []);
    };

    const handleSave = async () => {
        if (!newItem.nombre) return alert("El nombre es obligatorio");

        try {
            await createCategoria(newItem);
            setShowModal(false);
            setNewItem({ nombre: '', descripcion: '' });
            loadData();
        } catch (error: any) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar esta categoría?")) {
            try {
                await deleteCategoria(id);
                loadData();
            } catch (error: any) {
                alert("Error al eliminar: " + error.message);
            }
        }
    };

    const filteredItems = categorias.filter(item =>
        item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.descripcion && item.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="fade-in">
            <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
                <h2 className="mb-0 text-center text-md-start">Gestión de Categorías</h2>
                <Button onClick={() => setShowModal(true)} className="btn-primary w-100 w-md-auto">+ Nueva Categoría</Button>
            </div>

            <Card className="custom-card">
                <Row className="g-2">
                    <Col xs={12} md={6}>
                        <Form.Control
                            placeholder="Buscar categoría..."
                            value={searchTerm}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        />
                    </Col>
                </Row>
            </Card>

            <Card className="custom-card p-0">
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre</th>
                            <th>Descripción</th>
                            <th style={{ width: '100px' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map(item => (
                            <tr key={item.id}>
                                <td>{item.nombre}</td>
                                <td>{item.descripcion || '-'}</td>
                                <td>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>Eliminar</Button>
                                </td>
                            </tr>
                        ))}
                        {filteredItems.length === 0 && (
                            <tr><td colSpan={3} className="text-center text-muted">No hay categorías registradas</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Nueva Categoría</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre *</Form.Label>
                            <Form.Control
                                value={newItem.nombre}
                                onChange={e => setNewItem({ ...newItem, nombre: e.target.value.toUpperCase() })}
                                autoFocus
                                placeholder="Ej. ELECTRICIDAD"
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Descripción</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={newItem.descripcion}
                                onChange={e => setNewItem({ ...newItem, descripcion: e.target.value })}
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

export default GestionCategorias;
