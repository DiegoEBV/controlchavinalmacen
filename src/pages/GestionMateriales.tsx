import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { getMateriales, createMaterial, deleteMaterial, getCategorias } from '../services/requerimientosService';
import { Material } from '../types';


const GestionMateriales: React.FC = () => {
    const [materiales, setMateriales] = useState<Material[]>([]);
    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
        categoria: '',
        descripcion: '',
        unidad: 'und',
        stock_maximo: 0
    });



    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        await loadMateriales();
        await loadCategorias();
    };

    const loadCategorias = async () => {
        const cats = await getCategorias();
        if (cats) setCategoriasList(cats);
    };

    const loadMateriales = async () => {
        const data = await getMateriales();
        setMateriales(data || []);
    };

    const handleSave = async () => {
        if (!newMaterial.categoria || !newMaterial.descripcion) return alert("Complete los campos obligatorios");

        try {
            await createMaterial(newMaterial);
            setShowModal(false);
            setNewMaterial({ categoria: '', descripcion: '', unidad: 'und', stock_maximo: 0 });
            loadMateriales();
        } catch (error) {
            console.error(error);
            alert("Error al guardar");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar este material?")) {
            await deleteMaterial(id);
            loadMateriales();
        }
    };

    const filteredMaterials = materiales.filter(m =>
        m.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Gestión de Materiales</h2>
                <Button onClick={() => setShowModal(true)} className="btn-primary">+ Nuevo Material</Button>
            </div>

            <Card className="custom-card">
                <Form.Control
                    placeholder="Buscar material..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                />
            </Card>

            <Card className="custom-card p-0">
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Categoría</th>
                            <th>Descripción</th>
                            <th>Unidad</th>
                            <th>Stock Max (Metrado)</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMaterials.map(m => (
                            <tr key={m.id}>
                                <td>{m.categoria}</td>
                                <td>{m.descripcion}</td>
                                <td>{m.unidad}</td>
                                <td>{m.stock_maximo}</td>
                                <td>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(m.id)}>Eliminar</Button>
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr><td colSpan={5} className="text-center">No hay materiales registrados</td></tr>
                        )}
                    </tbody>
                </Table>

                <Modal show={showModal} onHide={() => setShowModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>Nuevo Material</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form>
                            <Form.Group className="mb-3">
                                <Form.Label>Categoría</Form.Label>
                                <Form.Select
                                    value={newMaterial.categoria}
                                    onChange={e => setNewMaterial({ ...newMaterial, categoria: e.target.value })}
                                >
                                    <option value="">Seleccione...</option>
                                    {categoriasList.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Descripción</Form.Label>
                                <Form.Control
                                    value={newMaterial.descripcion}
                                    onChange={e => setNewMaterial({ ...newMaterial, descripcion: e.target.value })}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Unidad</Form.Label>
                                <Form.Control
                                    value={newMaterial.unidad}
                                    onChange={e => setNewMaterial({ ...newMaterial, unidad: e.target.value })}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Stock Máximo (Metrado)</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newMaterial.stock_maximo}
                                    onChange={e => setNewMaterial({ ...newMaterial, stock_maximo: parseFloat(e.target.value) })}
                                />
                            </Form.Group>
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave}>Guardar</Button>
                    </Modal.Footer>
                </Modal>
            </Card>
        </div>
    );
};

export default GestionMateriales;
