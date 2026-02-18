import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { createMaterial, deleteMaterial, updateMaterial, getCategorias, createCategoria } from '../services/requerimientosService';
import { supabase } from '../config/supabaseClient';
import { Material, Specialty } from '../types';
import { getFrontSpecialties, getSpecialties } from '../services/specialtiesService';



const GestionMateriales: React.FC = () => {
    const [materiales, setMateriales] = useState<Material[]>([]);
    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [obras, setObras] = useState<any[]>([]);
    const [frentes, setFrentes] = useState<any[]>([]); // Para filtrado

    // Filtros
    const [selectedObraId, setSelectedObraId] = useState('');
    const [selectedFrenteId, setSelectedFrenteId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Initial Filter Lists
    const [filterSpecialties, setFilterSpecialties] = useState<Specialty[]>([]);
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');
    const [isSpecialtyLocked, setIsSpecialtyLocked] = useState(false);

    // Datos dependientes del modal
    const [modalFrentes, setModalFrentes] = useState<any[]>([]);
    const [modalObraId, setModalObraId] = useState('');
    const [modalSpecialties, setModalSpecialties] = useState<Specialty[]>([]);

    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
        categoria: '',
        descripcion: '',
        unidad: 'und',
        stock_maximo: 0,
        informacion_adicional: '',
        frente_id: '',
        specialty_id: ''
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (selectedObraId) {
            loadFrentes(selectedObraId).then(setFrentes);
        } else {
            setFrentes([]);
            setSelectedFrenteId('');
        }
    }, [selectedObraId]);

    useEffect(() => {
        if (selectedFrenteId) {
            // Reset specialty filter when Frente changes
            setSelectedSpecialtyId('');
            // Load specialties for this Frente
            getFrontSpecialties(selectedFrenteId).then(setFilterSpecialties);

            // Initial load of materials (without specialty filter initially, or explicitly call with empty)
            loadMateriales(selectedFrenteId, '');
        } else {
            setFilterSpecialties([]);
            setSelectedSpecialtyId('');
            setMateriales([]);
        }
    }, [selectedFrenteId]);

    // Reload when Specialty Filter changes
    useEffect(() => {
        if (selectedFrenteId) {
            loadMateriales(selectedFrenteId, selectedSpecialtyId);
        }
    }, [selectedSpecialtyId]);

    // Lógica del modal
    useEffect(() => {
        if (modalObraId) {
            loadFrentes(modalObraId).then(setModalFrentes);
        } else {
            setModalFrentes([]);
        }
    }, [modalObraId]);

    // Lógica para cargar especialidades cuando cambia el Frente en el modal
    useEffect(() => {
        if (newMaterial.frente_id) {
            getFrontSpecialties(newMaterial.frente_id)
                .then(setModalSpecialties)
                .catch(err => console.error("Error loading specialties:", err));
        } else {
            setModalSpecialties([]);
        }
    }, [newMaterial.frente_id]);

    const loadInitialData = async () => {
        await loadObras();
        await loadCategorias();
    };

    const loadObras = async () => {
        const { data } = await supabase.from('obras').select('*').order('nombre_obra');
        if (data) setObras(data);
    };

    const loadFrentes = async (obraId: string) => {
        const { data } = await supabase.from('frentes').select('*').eq('obra_id', obraId).order('nombre_frente');
        return data || [];
    };

    const loadCategorias = async () => {
        const cats = await getCategorias();
        if (cats) setCategoriasList(cats);
    };

    const loadMateriales = async (frenteId: string, specialtyId: string = '') => {
        let query = supabase
            .from('materiales')
            .select('*, frentes(nombre_frente)')
            .eq('frente_id', frenteId);

        if (specialtyId) {
            query = query.eq('specialty_id', specialtyId);
        }

        const { data } = await query.order('descripcion');

        if (data) setMateriales(data);
    };

    const handleSave = async () => {
        if (!newMaterial.categoria || !newMaterial.descripcion || !newMaterial.frente_id) return alert("Complete los campos obligatorios (incluyendo Frente)");

        try {
            const materialToSave = { ...newMaterial };
            // Asegurar numérico
            materialToSave.stock_maximo = Number(materialToSave.stock_maximo);

            // Sanitize specialty_id (empty string -> null)
            if (!materialToSave.specialty_id) {
                // @ts-ignore
                materialToSave.specialty_id = null;
            }

            if (editingId) {
                await updateMaterial(editingId, materialToSave);
            } else {
                await createMaterial(materialToSave);
            }
            setShowModal(false);
            setNewMaterial({ categoria: '', descripcion: '', unidad: 'und', stock_maximo: 0, informacion_adicional: '', frente_id: '', specialty_id: '' });
            setEditingId(null);
            setModalObraId('');
            // Recargar vista actual
            if (selectedFrenteId) loadMateriales(selectedFrenteId, selectedSpecialtyId);
        } catch (error) {
            console.error(error);
            alert("Error al guardar");
        }
    };

    const handleEdit = (material: Material) => {
        setEditingId(material.id);
        // Necesitamos saber a qué Obra pertenece este Frente.
        // El material tiene `frente_id`. Podemos encontrar el frente en la lista `frentes` SI estamos en el mismo contexto de vista.
        // Pero el estado `frentes` solo tiene frentes de `selectedObraId`.
        // Si estamos editando, probablemente estamos en la vista de esa Obra/Frente.
        // Así que `modalObraId` debería ser `selectedObraId`.
        setModalObraId(selectedObraId);

        setNewMaterial({
            categoria: material.categoria,
            descripcion: material.descripcion,
            unidad: material.unidad,
            stock_maximo: material.stock_maximo,
            informacion_adicional: material.informacion_adicional || '',
            frente_id: material.frente_id,
            specialty_id: material.specialty_id || ''
        });
        setIsSpecialtyLocked(false); // Always unlock when editing
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar este material?")) {
            await deleteMaterial(id);
            if (selectedFrenteId) loadMateriales(selectedFrenteId, selectedSpecialtyId);
        }
    };

    const filteredMaterials = materiales.filter(m =>
        m.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedObraId) return alert("Seleccione una Obra primero.");

        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                let XLSX: any;
                try {
                    XLSX = await import('xlsx');
                } catch (error) {
                    console.error("Error loading xlsx module:", error);
                    alert("Error al cargar el módulo de importación. Verifique su conexión.");
                    return;
                }

                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                let count = 0;
                let errorCount = 0;
                let skippedCount = 0;

                const existingCats = await getCategorias() || [];
                const catMap = new Map(existingCats.map((c: any) => [c.nombre.toUpperCase(), c]));

                // Pre-fetch specialties
                const allSpecialties = await getSpecialties();
                console.log("Loaded specialties for import:", allSpecialties);
                const specialtyMap = new Map(allSpecialties.map(s => [s.name.toUpperCase(), s.id]));

                // Pre-obtener mapa de búsqueda de frentes
                const frenteMap = new Map(frentes.map(f => [f.nombre_frente.toUpperCase(), f.id]));

                for (const row of data as any[]) {
                    const norm: any = {};
                    Object.keys(row).forEach(k => {
                        const cleanKey = k.toLowerCase().trim().replace(/\s+/g, '_');
                        norm[cleanKey] = row[k];
                    });

                    const descripcion = norm.descripcion || norm.material;
                    const categoriaName = norm.categoria;
                    const unidad = norm.unidad || 'und';
                    let stockMax = parseFloat(norm.stock_maximo || norm.stock_max || norm.stock || '0') || 0;
                    stockMax = parseFloat(stockMax.toFixed(2));
                    const info = norm.informacion || norm.comentario || norm.info_adicional || '';

                    // Resolución de Frente
                    const frenteName = norm.frente || norm.unidad_de_trabajo;
                    let targetFrenteId = selectedFrenteId;

                    if (frenteName) {
                        const foundId = frenteMap.get(frenteName.toString().toUpperCase());
                        if (foundId) targetFrenteId = foundId;
                    }

                    // Resolución de Especialidad
                    // Supports 'especialidad', 'specialty', 'discipline', 'disciplina'
                    const specialtyName = norm.especialidad || norm.specialty || norm.discipline || norm.disciplina || '';
                    let targetSpecialtyId: string | null = null;

                    if (specialtyName) {
                        const foundId = specialtyMap.get(specialtyName.toString().trim().toUpperCase());
                        if (foundId) targetSpecialtyId = foundId;
                        else console.warn(`Specialty not found: ${specialtyName}`);
                    }

                    // Fallback to filter if no specialty in row
                    if (!targetSpecialtyId && selectedSpecialtyId) {
                        targetSpecialtyId = selectedSpecialtyId;
                    }

                    if (!targetFrenteId) {
                        skippedCount++;
                        continue; // Ningún frente identificado
                    }

                    if (descripcion && categoriaName) {
                        const descUpper = descripcion.toString().toUpperCase();
                        const catUpper = categoriaName.toString().toUpperCase();

                        if (!catMap.has(catUpper)) {
                            try {
                                const newCat = await createCategoria({ nombre: catUpper, descripcion: 'Importada' });
                                if (newCat) catMap.set(catUpper, newCat[0]);
                                else catMap.set(catUpper, { nombre: catUpper });
                            } catch (err) { }
                        }

                        try {
                            await createMaterial({
                                descripcion: descUpper,
                                categoria: catUpper,
                                unidad: unidad,
                                stock_maximo: stockMax,
                                informacion_adicional: info,
                                frente_id: targetFrenteId,
                                specialty_id: targetSpecialtyId
                            });
                            count++;
                        } catch (err) {
                            errorCount++;
                        }
                    }
                }

                alert(`Proceso completado.\nAgregados: ${count}\nErrores: ${errorCount}\nOmitidos (sin Frente): ${skippedCount}`);

                // Refrescar lista si se selecciona un frente
                if (selectedFrenteId) loadMateriales(selectedFrenteId, selectedSpecialtyId);

            } catch (error) {
                console.error("Error importing:", error);
                alert("Error al procesar el archivo.");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    return (
        <div className="fade-in">
            <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
                <h2 className="mb-0 text-center text-md-start">Gestión de Materiales</h2>

            </div>

            <Card className="custom-card mb-3">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={4}>
                            <Form.Label>Obra</Form.Label>
                            <Form.Select value={selectedObraId} onChange={e => setSelectedObraId(e.target.value)}>
                                <option value="">-- Seleccione Obra --</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre_obra}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={4}>
                            <Form.Label>Frente (Unidad de Trabajo)</Form.Label>
                            <Form.Select
                                value={selectedFrenteId}
                                onChange={e => setSelectedFrenteId(e.target.value)}
                                disabled={!selectedObraId}
                            >
                                <option value="">-- Seleccione Frente --</option>
                                {frentes.map(f => <option key={f.id} value={f.id}>{f.nombre_frente}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={4}>
                            <Form.Label>Especialidad</Form.Label>
                            <Form.Select
                                value={selectedSpecialtyId}
                                onChange={e => setSelectedSpecialtyId(e.target.value)}
                                disabled={!selectedFrenteId}
                            >
                                <option value="">-- Todas las Especialidades --</option>
                                {filterSpecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </Form.Select>
                        </Col>
                    </Row>
                    <Row className="mt-3">
                        <Col md={12} className="d-flex justify-content-end">
                            <div className="d-flex gap-2 w-100">
                                <label className={`btn btn-success text-white ${!selectedObraId ? 'disabled' : ''}`}>
                                    Importar Excel
                                    <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} disabled={!selectedObraId} />
                                </label>
                                <Button onClick={() => {
                                    setEditingId(null);
                                    setModalObraId(selectedObraId); // Por defecto al filtro actual
                                    setNewMaterial({
                                        categoria: '',
                                        descripcion: '',
                                        unidad: 'und',
                                        stock_maximo: 0,
                                        informacion_adicional: '',
                                        frente_id: selectedFrenteId || '',
                                        specialty_id: selectedSpecialtyId || '' // Pre-fill from filter
                                    });
                                    setIsSpecialtyLocked(!!selectedSpecialtyId); // Lock if filtered
                                    setShowModal(true);
                                }} className="btn-primary flex-grow-1" disabled={!selectedObraId}>+ Nuevo Material</Button>
                            </div>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card p-0">
                <div className="p-3">
                    <Form.Control
                        placeholder="Buscar material..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Categoría</th>
                            <th>Descripción</th>
                            <th>Unidad</th>
                            <th>Stock Max</th>
                            <th>Info Adicional</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMaterials.map(m => (
                            <tr key={m.id}>
                                <td width="15%">{m.categoria}</td>
                                <td width="35%">{m.descripcion}</td>
                                <td width="10%">{m.unidad}</td>
                                <td width="10%">{Number(m.stock_maximo).toFixed(2)}</td>
                                <td width="20%">{m.informacion_adicional || '-'}</td>
                                <td width="10%">
                                    <div className="d-flex gap-2">
                                        <Button variant="warning" size="sm" className="text-white" onClick={() => handleEdit(m)}>Editar</Button>
                                        <Button variant="danger" size="sm" onClick={() => handleDelete(m.id)}>Eliminar</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr><td colSpan={6} className="text-center">{selectedFrenteId ? 'No hay materiales en este frente.' : 'Seleccione una Obra y Frente para ver materiales.'}</td></tr>
                        )}
                    </tbody>
                </Table>

                <Modal show={showModal} onHide={() => setShowModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>{editingId ? 'Editar Material' : 'Nuevo Material'}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form>
                            {!editingId && (
                                <Form.Group className="mb-3">
                                    <Form.Label>Obra</Form.Label>
                                    <Form.Select
                                        value={modalObraId}
                                        onChange={e => {
                                            setModalObraId(e.target.value);
                                            setNewMaterial({ ...newMaterial, frente_id: '' }); // Reiniciar frente
                                        }}
                                    >
                                        <option value="">-- Seleccione --</option>
                                        {obras.map(o => <option key={o.id} value={o.id}>{o.nombre_obra}</option>)}
                                    </Form.Select>
                                </Form.Group>
                            )}

                            <Form.Group className="mb-3">
                                <Form.Label>Frente (Unidad de Trabajo)</Form.Label>
                                <Form.Select
                                    value={newMaterial.frente_id}
                                    onChange={e => setNewMaterial({ ...newMaterial, frente_id: e.target.value })}
                                    disabled={!modalObraId}
                                >
                                    <option value="">-- Seleccione Frente --</option>
                                    {modalFrentes.map(f => <option key={f.id} value={f.id}>{f.nombre_frente}</option>)}
                                </Form.Select>
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Especialidad</Form.Label>
                                <div className="d-flex gap-2">
                                    <Form.Select
                                        value={newMaterial.specialty_id}
                                        onChange={e => setNewMaterial({ ...newMaterial, specialty_id: e.target.value })}
                                        disabled={!newMaterial.frente_id || (isSpecialtyLocked && !editingId)}
                                    >
                                        <option value="">-- Seleccione Especialidad --</option>
                                        {modalSpecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </Form.Select>
                                    {isSpecialtyLocked && !editingId && (
                                        <Button
                                            variant="outline-secondary"
                                            size="sm"
                                            onClick={() => setIsSpecialtyLocked(false)}
                                        >
                                            Cambiar
                                        </Button>
                                    )}
                                </div>
                                {newMaterial.frente_id && modalSpecialties.length === 0 && (
                                    <Form.Text className="text-muted">
                                        Este frente no tiene especialidades asignadas.
                                    </Form.Text>
                                )}
                            </Form.Group>

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
                                <Form.Label>Información Adicional (Opcional)</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newMaterial.informacion_adicional}
                                    onChange={e => setNewMaterial({ ...newMaterial, informacion_adicional: e.target.value })}
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
