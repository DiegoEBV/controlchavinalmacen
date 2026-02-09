import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { getMateriales, createMaterial, deleteMaterial, updateMaterial, getCategorias, createCategoria } from '../services/requerimientosService';
import { Material } from '../types';
import * as XLSX from 'xlsx';


const GestionMateriales: React.FC = () => {
    const [materiales, setMateriales] = useState<Material[]>([]);
    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
        categoria: '',
        descripcion: '',
        unidad: 'und',
        stock_maximo: 0,
        informacion_adicional: ''
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
            if (editingId) {
                await updateMaterial(editingId, newMaterial);
            } else {
                await createMaterial(newMaterial);
            }
            setShowModal(false);
            setShowModal(false);
            setNewMaterial({ categoria: '', descripcion: '', unidad: 'und', stock_maximo: 0, informacion_adicional: '' });
            setEditingId(null);
            loadMateriales();
        } catch (error) {
            console.error(error);
            alert("Error al guardar");
        }
    };

    const handleEdit = (material: Material) => {
        setEditingId(material.id);
        setNewMaterial({
            categoria: material.categoria,
            descripcion: material.descripcion,
            unidad: material.unidad,
            stock_maximo: material.stock_maximo,
            informacion_adicional: material.informacion_adicional || ''
        });
        setShowModal(true);
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

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                let count = 0;
                let errorCount = 0;

                // Load existing categories and materials for validation
                const existingCats = await getCategorias() || [];
                const catMap = new Map(existingCats.map((c: any) => [c.nombre.toUpperCase(), c]));

                // We should also check for existing materials to avoid exact duplicates?
                // The DB doesn't have unique constraint on name, but let's avoid adding same material twice if we can.
                const existingMats = await getMateriales() || [];
                const matSet = new Set(existingMats.map(m => m.descripcion.toUpperCase()));

                for (const row of data as any[]) {
                    // Normalization: lowercase and replace spaces with underscores for easier access
                    const norm: any = {};
                    Object.keys(row).forEach(k => {
                        const cleanKey = k.toLowerCase().trim().replace(/\s+/g, '_');
                        norm[cleanKey] = row[k];
                    });

                    const descripcion = norm.descripcion || norm.material;
                    const categoriaName = norm.categoria;
                    const unidad = norm.unidad || 'und';
                    // Try to match variations of stock header
                    let stockMax = parseFloat(norm.stock_maximo || norm.stock_max || norm.stock || '0') || 0;
                    stockMax = parseFloat(stockMax.toFixed(2)); // Enforce 2 decimals on import
                    const info = norm.informacion || norm.comentario || norm.info_adicional || '';

                    if (descripcion && categoriaName) {
                        const descUpper = descripcion.toString().toUpperCase();
                        const catUpper = categoriaName.toString().toUpperCase();

                        if (matSet.has(descUpper)) {
                            // duplicate material
                            continue;
                        }

                        // Check category
                        if (!catMap.has(catUpper)) {
                            // Create category on the fly? Or fail?
                            // Let's create it for convenience.
                            try {
                                const newCat = await createCategoria({ nombre: catUpper, descripcion: 'Importada' });
                                if (newCat) {
                                    catMap.set(catUpper, newCat[0]); // supabase returns array
                                } else {
                                    // fallback if return is weird, just assume it exists now query would find it next time but we need it now
                                    // re-query? expensive inside loop.
                                    // let's blindly trust it created or just re-add to map manually
                                    catMap.set(catUpper, { nombre: catUpper });
                                }
                            } catch (err) {
                                console.error("Could not create category", catUpper);
                            }
                        }

                        // Create Material
                        try {
                            await createMaterial({
                                descripcion: descUpper,
                                categoria: catUpper, // Storing name not ID based on current schema? 
                                // Wait, Schema check: Material table uses "categoria" string or FK?
                                // types.ts says: categoria: string;
                                // In previous analysis, it seemed to be just a string in `materiales` table.
                                // Let's verify `createMaterial` service.
                                unidad: unidad,
                                stock_maximo: stockMax,
                                informacion_adicional: info
                            });
                            matSet.add(descUpper);
                            count++;
                        } catch (err) {
                            console.error("Error creating material", descUpper, err);
                            errorCount++;
                        }
                    }
                }

                alert(`Importación completada.\nAgregados: ${count}\nErrores: ${errorCount}`);
                loadData();

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
                <div className="d-flex gap-2 w-100 w-md-auto">
                    <label className="btn btn-success text-white">
                        Importar Excel
                        <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} />
                    </label>
                    <Button onClick={() => {
                        setEditingId(null);
                        setNewMaterial({ categoria: '', descripcion: '', unidad: 'und', stock_maximo: 0, informacion_adicional: '' });
                        setShowModal(true);
                    }} className="btn-primary flex-grow-1">+ Nuevo Material</Button>
                </div>
            </div>

            <Card className="custom-card">
                <Row className="g-2">
                    <Col xs={12} md={6}>
                        <Form.Control
                            placeholder="Buscar material..."
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
                            <th>Categoría</th>
                            <th>Descripción</th>
                            <th>Unidad</th>
                            <th>Stock Max (Metrado)</th>
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
                            <tr><td colSpan={5} className="text-center">No hay materiales registrados</td></tr>
                        )}
                    </tbody>
                </Table>

                <Modal show={showModal} onHide={() => setShowModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>{editingId ? 'Editar Material' : 'Nuevo Material'}</Modal.Title>
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
