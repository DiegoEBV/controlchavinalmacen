
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Table, Button, Alert, Modal, Spinner, InputGroup } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Obra, Frente, Bloque } from '../types';
import { getFrentes, createFrente, updateFrente, deleteFrente, getBloques, createBloque, deleteBloque, createBloquesBatch } from '../services/frentesService';
import { getSpecialties, getFrontSpecialties, assignSpecialtiesToFront } from '../services/specialtiesService';
import { Specialty } from '../types';
// import { useAuth } from '../context/AuthContext';

const GestionFrentes: React.FC = () => {
    // const { session } = useAuth();
    const [obras, setObras] = useState<Obra[]>([]);
    const [selectedObraId, setSelectedObraId] = useState('');
    const [frentes, setFrentes] = useState<Frente[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal de Creación/Edición
    const [showModal, setShowModal] = useState(false);
    const [editingFrente, setEditingFrente] = useState<Frente | null>(null);
    const [newFrenteName, setNewFrenteName] = useState('');
    const [saving, setSaving] = useState(false);

    // Gestión de Bloques (En memoria durante creación, en DB durante edición)
    const [bloques, setBloques] = useState<Partial<Bloque>[]>([]);
    const [newBloqueName, setNewBloqueName] = useState('');

    // Gestión de Especialidades
    const [showSpecialtiesModal, setShowSpecialtiesModal] = useState(false);
    const [currentFrenteForSpecialties, setCurrentFrenteForSpecialties] = useState<Frente | null>(null);
    const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
    const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>([]);
    const [loadingSpecialties, setLoadingSpecialties] = useState(false);

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
            const data = await getFrentes(obraId);
            setFrentes(data || []);
        } catch (error: any) {
            setError('Error cargando frentes: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = async (frente?: Frente) => {
        setError(null);
        setNewBloqueName('');
        if (frente) {
            setEditingFrente(frente);
            setNewFrenteName(frente.nombre_frente);
            // Cargar bloques existentes
            try {
                const b = await getBloques(frente.id);
                setBloques(b);
            } catch (err) {
                console.error(err);
                setBloques([]);
            }
        } else {
            setEditingFrente(null);
            setNewFrenteName('');
            setBloques([]);
        }
        setShowModal(true);
    };

    const handleAddBloque = async () => {
        if (!newBloqueName.trim()) return;

        if (editingFrente) {
            // Guardar directo en DB si estamos editando
            try {
                const newB = await createBloque({
                    frente_id: editingFrente.id,
                    nombre_bloque: newBloqueName.trim()
                });
                setBloques([...bloques, newB]);
                setNewBloqueName('');
            } catch (err: any) {
                alert('Error al agregar bloque: ' + err.message);
            }
        } else {
            // Solo en memoria si estamos creando nuevo frente
            setBloques([...bloques, { nombre_bloque: newBloqueName.trim() }]);
            setNewBloqueName('');
        }
    };

    const handleDeleteBloque = async (index: number, bloqueId?: string) => {
        if (editingFrente && bloqueId) {
            if (!confirm('¿Eliminar este bloque?')) return;
            try {
                await deleteBloque(bloqueId);
                setBloques(bloques.filter(b => b.id !== bloqueId));
            } catch (err: any) {
                alert('Error al eliminar bloque: ' + err.message);
            }
        } else {
            const newB = [...bloques];
            newB.splice(index, 1);
            setBloques(newB);
        }
    };

    const handleSaveFrente = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedObraId) return alert('Seleccione una obra primero');
        if (!newFrenteName.trim()) return alert('Ingrese nombre del frente');

        setSaving(true);
        setError(null);
        try {
            let currentFrenteId: string;

            if (editingFrente) {
                await updateFrente(editingFrente.id, { nombre_frente: newFrenteName });
                currentFrenteId = editingFrente.id;
                setSuccessMessage(`Frente actualizado.`);
            } else {
                const newF = await createFrente({
                    obra_id: selectedObraId,
                    nombre_frente: newFrenteName
                });
                currentFrenteId = newF.id;

                // Guardar bloques pendientes
                if (bloques.length > 0) {
                    const bloquesToSave = bloques.map(b => ({
                        frente_id: currentFrenteId,
                        nombre_bloque: b.nombre_bloque
                    }));
                    await createBloquesBatch(bloquesToSave);
                }
                setSuccessMessage(`Frente "${newF.nombre_frente}" creado.`);
            }

            fetchFrentes(selectedObraId);
            setShowModal(false);
        } catch (error: any) {
            setError('Error guardando frente: ' + error.message);
        } finally {
            setSaving(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleDeleteFrente = async (id: string) => {
        if (!confirm('¿Seguro que desea eliminar este frente? Esto podría afectar a materiales y requerimientos asociados.')) return;

        try {
            await deleteFrente(id);
            setFrentes(frentes.filter(f => f.id !== id));
            setSuccessMessage('Frente eliminado correctamente.');
        } catch (error: any) {
            setError('Error eliminando frente: ' + error.message);
        } finally {
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleOpenSpecialtiesModal = async (frente: Frente) => {
        setCurrentFrenteForSpecialties(frente);
        setLoadingSpecialties(true);
        setShowSpecialtiesModal(true);
        try {
            const [specs, assigned] = await Promise.all([
                getSpecialties(true),
                getFrontSpecialties(frente.id)
            ]);
            setAllSpecialties(specs);
            setSelectedSpecialtyIds(assigned.map(s => s.id));
        } catch (error: any) {
            alert('Error cargando especialidades: ' + error.message);
        } finally {
            setLoadingSpecialties(false);
        }
    };

    const handleToggleSpecialty = (id: string) => {
        if (selectedSpecialtyIds.includes(id)) {
            setSelectedSpecialtyIds(selectedSpecialtyIds.filter(sId => sId !== id));
        } else {
            setSelectedSpecialtyIds([...selectedSpecialtyIds, id]);
        }
    };

    const handleSaveSpecialties = async () => {
        if (!currentFrenteForSpecialties) return;
        try {
            await assignSpecialtiesToFront(currentFrenteForSpecialties.id, selectedSpecialtyIds);
            setShowSpecialtiesModal(false);
            setSuccessMessage(`Especialidades de "${currentFrenteForSpecialties.nombre_frente}" actualizadas.`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error: any) {
            alert('Error guardando especialidades: ' + error.message);
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
                                onClick={() => handleOpenModal()}
                            >
                                + Nuevo Frente
                            </Button>
                        </Col>
                    </Form.Group>
                </Card.Body>
            </Card>

            <Card className="custom-card shadow-sm border-0">
                <Card.Header className="bg-white py-3">
                    <h5 className="mb-0 fw-bold">Listado de Frentes</h5>
                </Card.Header>
                <div className="table-responsive">
                    <Table hover className="align-middle mb-0">
                        <thead className="bg-light">
                            <tr>
                                <th className="py-3 ps-4 text-secondary text-uppercase x-small opacity-75 border-0">Nombre del Frente</th>
                                <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0" style={{ width: '100px' }}>ID</th>
                                <th className="py-3 pe-4 text-end text-secondary text-uppercase x-small opacity-75 border-0">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="border-top-0">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-5 text-muted">
                                        <Spinner animation="border" size="sm" className="me-2" /> Cargando...
                                    </td>
                                </tr>
                            ) : frentes.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-5 text-muted">
                                        <div className="mb-2">🚧</div>
                                        No hay frentes registrados para esta obra.
                                    </td>
                                </tr>
                            ) : (
                                frentes.map(f => (
                                    <tr key={f.id} className="border-bottom">
                                        <td className="ps-4 py-3 fw-bold text-dark">{f.nombre_frente}</td>
                                        <td className="py-3">
                                            <code className="text-muted bg-light px-2 py-1 rounded small" title={f.id}>
                                                {f.id.substring(0, 8)}...
                                            </code>
                                        </td>
                                        <td className="pe-4 py-3 text-end">
                                            <div className="d-flex justify-content-end gap-2">
                                                <Button
                                                    variant="outline-primary"
                                                    size="sm"
                                                    className="rounded-pill px-3 d-inline-flex align-items-center gap-2"
                                                    onClick={() => handleOpenModal(f)}
                                                >
                                                    <i className="bi bi-pencil-fill"></i> Editar
                                                </Button>
                                                <Button
                                                    variant="outline-secondary"
                                                    size="sm"
                                                    className="rounded-pill px-3 d-inline-flex align-items-center gap-2"
                                                    onClick={() => handleOpenSpecialtiesModal(f)}
                                                >
                                                    <i className="bi bi-tags-fill"></i> Especialidades
                                                </Button>
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    className="rounded-pill px-3 d-inline-flex align-items-center gap-2"
                                                    onClick={() => handleDeleteFrente(f.id)}
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
            </Card>

            {/* Modal de Creación */}
            <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>{editingFrente ? 'Editar Frente y Bloques' : 'Crear Nuevo Frente'}</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSaveFrente}>
                    <Modal.Body>
                        <Form.Group className="mb-4">
                            <Form.Label className="fw-bold">Nombre del Frente</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Estructuras - Torre A"
                                value={newFrenteName}
                                onChange={e => setNewFrenteName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <hr />
                        <div className="bg-light p-3 rounded-3 mb-3">
                            <h6 className="fw-bold mb-3 text-secondary x-small text-uppercase">Bloques Vinculados</h6>

                            <InputGroup className="mb-3">
                                <Form.Control
                                    type="text"
                                    placeholder="Nombre del Bloque (Ej. Sector 1)"
                                    value={newBloqueName}
                                    onChange={e => setNewBloqueName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddBloque();
                                        }
                                    }}
                                />
                                <Button variant="success" onClick={handleAddBloque} disabled={!newBloqueName.trim()}>
                                    <i className="bi bi-plus-lg me-1"></i> Agregar
                                </Button>
                            </InputGroup>

                            <div className="table-responsive rounded-3 overflow-hidden border bg-white">
                                <Table hover className="mb-0 align-middle" size="sm">
                                    <thead className="bg-light">
                                        <tr>
                                            <th className="ps-3 py-2 text-secondary x-small border-0">Nombre del Bloque</th>
                                            <th className="pe-3 py-2 text-end text-secondary x-small border-0" style={{ width: '80px' }}>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="border-top-0">
                                        {bloques.map((b, idx) => (
                                            <tr key={b.id || idx}>
                                                <td className="ps-3 border-bottom-0">{b.nombre_bloque}</td>
                                                <td className="pe-3 text-end border-bottom-0">
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        className="rounded-pill px-2 d-inline-flex align-items-center gap-1 border-0"
                                                        style={{ fontSize: '0.75rem' }}
                                                        onClick={() => handleDeleteBloque(idx, b.id)}
                                                    >
                                                        <i className="bi bi-trash-fill"></i> Eliminar
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                        {bloques.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="text-center py-4 text-muted small">
                                                    <i className="bi bi-bricks mb-2 d-block text-secondary opacity-50 fs-4"></i>
                                                    Sin bloques asignados todavía.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>
                        </div>

                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" type="submit" disabled={saving}>
                            {saving ? 'Guardando...' : 'Guardar Todo'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modal de Especialidades */}
            <Modal show={showSpecialtiesModal} onHide={() => setShowSpecialtiesModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Asignar Especialidades</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted">
                        Seleccione las especialidades disponibles para el frente <strong>{currentFrenteForSpecialties?.nombre_frente}</strong>.
                    </p>
                    {loadingSpecialties ? (
                        <div className="text-center py-4"><Spinner animation="border" /></div>
                    ) : (
                        <Form>
                            {allSpecialties.map(spec => (
                                <Form.Check
                                    key={spec.id}
                                    type="checkbox"
                                    id={`spec - ${spec.id} `}
                                    label={spec.name}
                                    checked={selectedSpecialtyIds.includes(spec.id)}
                                    onChange={() => handleToggleSpecialty(spec.id)}
                                    className="mb-2"
                                />
                            ))}
                            {allSpecialties.length === 0 && <p>No hay especialidades configuradas en el sistema.</p>}
                        </Form>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowSpecialtiesModal(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveSpecialties}>Guardar Asignación</Button>
                </Modal.Footer>
            </Modal>
        </Container >
    );
};

export default GestionFrentes;
