import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card, Badge, InputGroup } from 'react-bootstrap';
import { FaPlus, FaEdit, FaSearch, FaArchive, FaBoxOpen } from 'react-icons/fa';
import { getSpecialties, createSpecialty, updateSpecialty, deleteSpecialty } from '../services/specialtiesService';
import { Specialty } from '../types';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/PaginationControls';

const GestionEspecialidades: React.FC = () => {
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    const [currentSpecialty, setCurrentSpecialty] = useState<Partial<Specialty>>({
        name: '',
        description: '',
        active: true
    });
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        loadData();
    }, [showInactive]);

    const loadData = async () => {
        setLoading(true);
        try {
            // If showInactive is true, we want ALL (pass false to activeOnly). 
            // If showInactive is false, we want ONLY ACTIVE (pass true to activeOnly).
            const data = await getSpecialties(!showInactive);
            setSpecialties(data);
        } catch (error) {
            console.error("Error loading specialties:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (specialty?: Specialty) => {
        if (specialty) {
            setCurrentSpecialty(specialty);
            setIsEditing(true);
        } else {
            setCurrentSpecialty({
                name: '',
                description: '',
                active: true
            });
            setIsEditing(false);
        }
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!currentSpecialty.name) return alert("El nombre es obligatorio");

        try {
            if (isEditing && currentSpecialty.id) {
                await updateSpecialty(currentSpecialty.id, currentSpecialty);
            } else {
                await createSpecialty(currentSpecialty);
            }
            setShowModal(false);
            loadData();
        } catch (error: any) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        }
    };

    const handleDelete = async (specialty: Specialty) => {
        if (confirm(`¿${specialty.active ? 'Archivar' : 'Activar'} esta especialidad?`)) {
            try {
                if (specialty.active) {
                    await deleteSpecialty(specialty.id); // Soft delete
                } else {
                    await updateSpecialty(specialty.id, { active: true }); // Restore
                }
                loadData();
            } catch (error: any) {
                alert("Error al actualizar estado: " + error.message);
            }
        }
    };

    const filteredItems = specialties.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const { currentPage, totalPages, totalItems, pageSize, paginatedItems: pagedItems, goToPage } = usePagination(filteredItems, 15);

    return (
        <div className="fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="mb-0 fw-bold text-dark">Gestión de Especialidades</h2>
                    <p className="text-muted mb-0">Configura las especialidades para los frentes de trabajo.</p>
                </div>
                <Button onClick={() => handleOpenModal()} className="btn-primary shadow-sm">
                    <FaPlus className="me-2" /> Nueva Especialidad
                </Button>
            </div>

            <Card className="custom-card mb-4 border-0 shadow-sm">
                <Card.Body>
                    <Row className="g-3 align-items-center">
                        <Col xs={12} md={6}>
                            <InputGroup>
                                <InputGroup.Text className="bg-white border-end-0"><FaSearch className="text-muted" /></InputGroup.Text>
                                <Form.Control
                                    placeholder="Buscar especialidad..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="border-start-0 ps-0"
                                />
                            </InputGroup>
                        </Col>
                        <Col xs={12} md={6} className="text-md-end">
                            <Form.Check
                                type="switch"
                                id="show-inactive-switch"
                                label="Mostrar Archivados"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                                className="d-inline-block"
                            />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card border-0 shadow-sm p-0 overflow-hidden">
                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Nombre</th>
                                    <th>Descripción</th>
                                    <th>Estado</th>
                                    <th className="text-end pe-4">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedItems.map(item => (
                                    <tr key={item.id} className={!item.active ? 'opacity-50' : ''}>
                                        <td className="ps-4 fw-bold">{item.name}</td>
                                        <td>{item.description || '-'}</td>
                                        <td>
                                            {item.active ?
                                                <Badge bg="success" className="rounded-pill">Activo</Badge> :
                                                <Badge bg="secondary" className="rounded-pill">Archivado</Badge>
                                            }
                                        </td>
                                        <td className="text-end pe-4">
                                            <Button variant="link" className="text-primary p-0 me-3" onClick={() => handleOpenModal(item)} title="Editar">
                                                <FaEdit size={18} />
                                            </Button>
                                            <Button
                                                variant="link"
                                                className={item.active ? "text-danger p-0" : "text-success p-0"}
                                                onClick={() => handleDelete(item)}
                                                title={item.active ? "Archivar" : "Restaurar"}
                                            >
                                                {item.active ? <FaArchive size={18} /> : <FaBoxOpen size={18} />}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredItems.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-5 text-muted">No hay especialidades registradas</td></tr>
                                )}
                            </tbody>
                        </Table>
                        <div className="px-3 pb-3">
                            <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={goToPage} />
                        </div>
                    </div>
                )}
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold">{isEditing ? 'Editar Especialidad' : 'Nueva Especialidad'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold">Nombre *</Form.Label>
                            <Form.Control
                                value={currentSpecialty.name}
                                onChange={e => setCurrentSpecialty({ ...currentSpecialty, name: e.target.value })}
                                autoFocus
                                placeholder="Ej. Estructuras, Arquitectura..."
                                className="form-control-lg"
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold">Descripción</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={currentSpecialty.description}
                                onChange={e => setCurrentSpecialty({ ...currentSpecialty, description: e.target.value })}
                                placeholder="Detalles adicionales..."
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0">
                    <Button variant="light" onClick={() => setShowModal(false)} className="rounded-pill px-4">Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} className="rounded-pill px-4">Guardar</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionEspecialidades;
