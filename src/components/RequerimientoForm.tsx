import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Table, Row, Col } from 'react-bootstrap';
import { Requerimiento, DetalleRequerimiento, Obra, Material } from '../types';
import { getMateriales, getSolicitantes, getCategorias } from '../services/requerimientosService';
import { getInventario } from '../services/almacenService';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../context/AuthContext';

interface RequerimientoFormProps {
    show: boolean;
    handleClose: () => void;
    onSave: (req: any, items: any[]) => Promise<void>;
    initialData?: Requerimiento | null;
    obras: Obra[];
}

const RequerimientoForm: React.FC<RequerimientoFormProps> = ({ show, handleClose, onSave, initialData, obras }) => {
    const { profile, selectedObra } = useAuth();
    // Header
    const [obraId, setObraId] = useState('');
    const [frenteId, setFrenteId] = useState('');
    const [bloque, setBloque] = useState('');
    const [especialidad, setEspecialidad] = useState('');
    const [solicitante, setSolicitante] = useState('');

    // Data Sources
    const [materialesList, setMaterialesList] = useState<Material[]>([]);
    const [frentesList, setFrentesList] = useState<any[]>([]); // Frentes of selected obra
    const [solicitantesList, setSolicitantesList] = useState<any[]>([]);
    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});

    // Items
    const [items, setItems] = useState<Partial<DetalleRequerimiento>[]>([]);

    // New Item
    const [newItem, setNewItem] = useState<Partial<DetalleRequerimiento>>({
        tipo: 'Material',
        material_categoria: '',
        descripcion: '',
        unidad: 'und',
        cantidad_solicitada: 0
    });

    useEffect(() => {
        loadCatalogs();
    }, []);

    useEffect(() => {
        if (obraId) {
            loadFrentes(obraId);
        } else {
            setFrentesList([]);
            setFrenteId('');
        }
    }, [obraId]);

    const loadCatalogs = async () => {
        const [mats, sols, cats, inv] = await Promise.all([
            getMateriales(),
            getSolicitantes(),
            getCategorias(),
            getInventario()
        ]);

        if (mats) setMaterialesList(mats);
        if (sols) setSolicitantesList(sols);
        if (cats) setCategoriasList(cats);

        if (inv) {
            const map: Record<string, number> = {};
            inv.forEach(i => {
                map[i.material_id] = i.cantidad_actual;
            });
            setStockMap(map);
        }
    };

    const loadFrentes = async (oid: string) => {
        const { data } = await supabase.from('frentes').select('*').eq('obra_id', oid).order('nombre_frente');
        if (data) setFrentesList(data);
    };

    useEffect(() => {
        if (show) {
            if (initialData) {
                setObraId(initialData.obra_id || '');
                setFrenteId(initialData.frente_id || '');
                setBloque(initialData.bloque);
                setEspecialidad(initialData.especialidad);
                setSolicitante(initialData.solicitante);
                setItems(initialData.detalles || []);
            } else {
                setObraId(selectedObra?.id || '');
                setFrenteId('');
                setBloque('');
                setEspecialidad('');
                setSolicitante(profile?.nombre || '');
                setItems([]);
            }
        }
    }, [show, initialData, selectedObra]);

    const handleAddItem = () => {
        if (!newItem.descripcion || !newItem.cantidad_solicitada || newItem.cantidad_solicitada <= 0) {
            alert("Complete descripción y cantidad > 0");
            return;
        }
        setItems([...items, { ...newItem }]);
        setNewItem(prev => ({
            ...prev,
            descripcion: '',
            unidad: 'und',
            cantidad_solicitada: 0
        }));
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleSubmit = async () => {
        if (!solicitante) return alert("Ingrese Solicitante");
        if (!frenteId) return alert("Seleccione Frente");
        if (items.length === 0) return alert("Agregue al menos un ítem");

        const headerData = {
            obra_id: obraId || null,
            frente_id: frenteId,
            bloque,
            especialidad,
            solicitante,
            fecha_solicitud: new Date().toISOString().split('T')[0]
        };

        await onSave(headerData, items);
        handleClose();
    };

    // Filter materials based on selected category AND selected frente
    const filteredMaterials = materialesList.filter(m =>
        m.categoria === newItem.material_categoria &&
        (m.frente_id === frenteId || !m.frente_id) // Optional: include materials without frente? Or strict? 
        // Strict per user request: "me muestre recien los materiales de ese frente"
    ).filter(m => m.frente_id === frenteId);

    // Handle material selection to auto-fill unit
    const handleMaterialSelect = (desc: string) => {
        const selectedMat = materialesList.find(m => m.descripcion === desc && m.categoria === newItem.material_categoria && m.frente_id === frenteId);
        setNewItem(prev => ({
            ...prev,
            descripcion: desc,
            unidad: selectedMat ? selectedMat.unidad : prev.unidad || 'und'
        }));
    };

    return (
        <Modal show={show} onHide={handleClose} size="xl" backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title>{initialData ? 'Editar Requerimiento' : 'Nuevo Requerimiento'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <h6 className="text-primary mb-3">Identificación</h6>
                    <Row className="mb-3 g-2">
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label>Obra/Proyecto</Form.Label>
                                <Form.Select value={obraId} onChange={e => setObraId(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {obras.map(o => <option key={o.id} value={o.id}>{o.nombre_obra}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label>Frente *</Form.Label>
                                <Form.Select
                                    value={frenteId}
                                    onChange={e => setFrenteId(e.target.value)}
                                    disabled={!obraId}
                                >
                                    <option value="">Seleccione...</option>
                                    {frentesList.map(f => <option key={f.id} value={f.id}>{f.nombre_frente}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2}>
                            <Form.Group>
                                <Form.Label>Bloque</Form.Label>
                                <Form.Control value={bloque} onChange={e => setBloque(e.target.value)} placeholder="Ej. Torre A" />
                            </Form.Group>
                        </Col>
                        <Col md={2}>
                            <Form.Group>
                                <Form.Label>Especialidad</Form.Label>
                                <Form.Select value={especialidad} onChange={e => setEspecialidad(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    <option value="Arquitectura">Arquitectura</option>
                                    <option value="Estructura">Estructura</option>
                                    <option value="IISS">IISS</option>
                                    <option value="IIEE">IIEE</option>
                                    <option value="Comunicaciones">Comunicaciones</option>
                                    <option value="Mecanicas">Mecanicas</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2}>
                            <Form.Group>
                                <Form.Label>Solicitante *</Form.Label>
                                <Form.Select value={solicitante} onChange={e => setSolicitante(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {profile?.nombre && !solicitantesList.some(s => s.nombre === profile.nombre) && (
                                        <option value={profile.nombre}>{profile.nombre}</option>
                                    )}
                                    {solicitantesList.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                    </Row>

                    <h6 className="text-primary mb-3">Agregar Insumo</h6>
                    <Row className="mb-3 g-2 bg-light p-2 rounded">
                        <Col md={2}>
                            <Form.Label>Tipo</Form.Label>
                            <Form.Select value={newItem.tipo} onChange={e => setNewItem({ ...newItem, tipo: e.target.value as any })}>
                                <option value="Material">Material</option>
                                <option value="Servicio">Servicio</option>
                            </Form.Select>
                        </Col>
                        <Col md={2}>
                            <Form.Label>Categoría</Form.Label>
                            <Form.Select
                                value={newItem.material_categoria}
                                onChange={e => setNewItem({ ...newItem, material_categoria: e.target.value, descripcion: '' })}
                            >
                                <option value="">Seleccione...</option>
                                {categoriasList.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={4}>
                            <Form.Label>Descripción *</Form.Label>
                            {/* If category is selected, show dropdown of materials. Else show text input (or empty select) */}
                            {newItem.material_categoria && newItem.tipo === 'Material' ? (
                                <Form.Select
                                    value={newItem.descripcion}
                                    onChange={e => handleMaterialSelect(e.target.value)}
                                    disabled={!frenteId}
                                >
                                    <option value="">{frenteId ? 'Seleccione Material...' : 'Seleccione Frente Primero'}</option>
                                    {filteredMaterials.map(m => (
                                        <option key={m.id} value={m.descripcion}>
                                            {m.descripcion} {m.informacion_adicional ? `- ${m.informacion_adicional}` : ''}
                                        </option>
                                    ))}
                                </Form.Select>
                            ) : (
                                <Form.Control
                                    value={newItem.descripcion}
                                    onChange={e => setNewItem({ ...newItem, descripcion: e.target.value })}
                                    placeholder={newItem.tipo === 'Servicio' ? "Descripción del servicio" : "Seleccione categoría primero"}
                                />
                            )}
                        </Col>
                        <Col md={2}>
                            <Form.Label>Unidad</Form.Label>
                            <Form.Control
                                value={newItem.unidad}
                                onChange={e => setNewItem({ ...newItem, unidad: e.target.value })}
                                readOnly={newItem.tipo === 'Material' && !!newItem.material_categoria} // Read-only if auto-filled from material
                            />
                        </Col>
                        <Col md={2}>
                            <Form.Label>Cant. *</Form.Label>

                            <div className="d-flex align-items-center">
                                <Form.Control type="number" value={newItem.cantidad_solicitada} onChange={e => setNewItem({ ...newItem, cantidad_solicitada: parseFloat(e.target.value) })} />
                                <Button variant="success" className="ms-1" onClick={handleAddItem}>+</Button>
                            </div>
                            {newItem.descripcion && newItem.tipo === 'Material' && (
                                <div className="mt-1">
                                    {(() => {
                                        const selectedMat = materialesList.find(m => m.descripcion === newItem.descripcion && m.categoria === newItem.material_categoria);
                                        const stock = selectedMat ? (stockMap[selectedMat.id] || 0) : 0;
                                        return (
                                            <small className={stock > 0 ? "text-success fw-bold" : "text-danger fw-bold"}>
                                                Stock: {stock} {newItem.unidad}
                                            </small>
                                        );
                                    })()}
                                </div>
                            )}
                        </Col>
                    </Row>

                    <Table size="sm">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Desc.</th>
                                <th>Und.</th>
                                <th>Cant.</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, idx) => (
                                <tr key={idx}>
                                    <td>{it.tipo}</td>
                                    <td>{it.descripcion}</td>
                                    <td>{it.unidad}</td>
                                    <td>{it.cantidad_solicitada}</td>
                                    <td><Button size="sm" variant="danger" onClick={() => handleRemoveItem(idx)}>X</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSubmit}>Guardar</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default RequerimientoForm;
