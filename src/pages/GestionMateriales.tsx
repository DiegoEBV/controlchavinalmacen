import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { createMaterial, deleteMaterial, updateMaterial, getCategorias, createCategoria } from '../services/requerimientosService';
import { supabase } from '../config/supabaseClient';
import { Material } from '../types';
import type * as XLSX from 'xlsx';


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

    // Datos dependientes del modal
    const [modalFrentes, setModalFrentes] = useState<any[]>([]);
    const [modalObraId, setModalObraId] = useState('');

    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
        categoria: '',
        descripcion: '',
        unidad: 'und',
        stock_maximo: 0,
        informacion_adicional: '',
        frente_id: ''
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
            loadMateriales(selectedFrenteId);
        } else {
            setMateriales([]);
        }
    }, [selectedFrenteId]);

    // Lógica del modal
    useEffect(() => {
        if (modalObraId) {
            loadFrentes(modalObraId).then(setModalFrentes);
        } else {
            setModalFrentes([]);
        }
    }, [modalObraId]);

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

    const loadMateriales = async (frenteId: string) => {
        // ¿Necesitamos filtrar por Frente ID en el lado de la API o del cliente?
        // El servicio `getMateriales` obtiene todos. Vamos a actualizar o filtrar aquí.
        // Asumiendo que getMateriales actualmente devuelve todos.
        // Idealmente deberíamos actualizar el servicio para aceptar filtros, pero por ahora consultemos directamente o filtremos.
        // Usemos consulta directa para eficiencia si el servicio es muy amplio, o sigamos usando el servicio si es simple.
        // 'getMateriales' probablemente usa 'supabase.from(materiales).select(...)'
        // Intentemos buscar con filtro usando supabase directamente aquí para "Frente" específico
        const { data } = await supabase
            .from('materiales')
            .select('*, frentes(nombre_frente)')
            .eq('frente_id', frenteId)
            .order('descripcion');

        if (data) setMateriales(data);
    };

    const handleSave = async () => {
        if (!newMaterial.categoria || !newMaterial.descripcion || !newMaterial.frente_id) return alert("Complete los campos obligatorios (incluyendo Frente)");

        try {
            const materialToSave = { ...newMaterial };
            // Asegurar numérico
            materialToSave.stock_maximo = Number(materialToSave.stock_maximo);

            if (editingId) {
                await updateMaterial(editingId, materialToSave);
            } else {
                await createMaterial(materialToSave);
            }
            setShowModal(false);
            setNewMaterial({ categoria: '', descripcion: '', unidad: 'und', stock_maximo: 0, informacion_adicional: '', frente_id: '' });
            setEditingId(null);
            setModalObraId('');
            // Recargar vista actual
            if (selectedFrenteId) loadMateriales(selectedFrenteId);
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
        // Espera, si usamos el mismo modal para crear/editar.

        setNewMaterial({
            categoria: material.categoria,
            descripcion: material.descripcion,
            unidad: material.unidad,
            stock_maximo: material.stock_maximo,
            informacion_adicional: material.informacion_adicional || '',
            frente_id: material.frente_id
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar este material?")) {
            await deleteMaterial(id);
            if (selectedFrenteId) loadMateriales(selectedFrenteId);
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

                // Obtener materiales existentes para esta OBRA (para evitar duplicados entre frentes si es necesario, o solo por frente)
                // En realidad la restricción suele ser por Frente. 
                // Optimicemos: ¿obtener todos los materiales para la Obra para verificar duplicados localmente? 
                // ¿O solo confiar en las restricciones de la base de datos? La unicidad es probable (Frente, Nombre).
                // Procesemos simplemente.

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

                    if (!targetFrenteId) {
                        skippedCount++;
                        continue; // Ningún frente identificado
                    }

                    if (descripcion && categoriaName) {
                        const descUpper = descripcion.toString().toUpperCase();
                        const catUpper = categoriaName.toString().toUpperCase();

                        // ¿Verificar duplicados? (Verificar el estado local 'materiales' es insuficiente si estamos importando para diferentes frentes)
                        // Idealmente deberíamos verificar contra la BD o solo intentar insertar y capturar el error.
                        // Por velocidad/simplicidad intentemos insertar.

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
                                frente_id: targetFrenteId
                            });
                            count++;
                        } catch (err) {
                            errorCount++;
                        }
                    }
                }

                alert(`Proceso completado.\nAgregados: ${count}\nErrores: ${errorCount}\nOmitidos (sin Frente): ${skippedCount}`);

                // Refrescar lista si se selecciona un frente
                if (selectedFrenteId) loadMateriales(selectedFrenteId);

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
                        <Col md={4} className="d-flex align-items-end">
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
                                        frente_id: selectedFrenteId || '' // Por defecto al filtro actual
                                    });
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
                                <td>{m.categoria}</td>
                                <td>{m.descripcion}</td>
                                <td>{m.unidad}</td>
                                <td>{Number(m.stock_maximo).toFixed(2)}</td>
                                <td>{m.informacion_adicional || '-'}</td>
                                <td>
                                    <Button variant="warning" size="sm" className="me-2 text-white" onClick={() => handleEdit(m)}>Editar</Button>
                                    <Button variant="danger" size="sm" onClick={() => handleDelete(m.id)}>Eliminar</Button>
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
