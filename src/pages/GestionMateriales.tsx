import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { createMaterial, deleteMaterial, updateMaterial, getCategorias, createCategoria, getMateriales } from '../services/requerimientosService';
import { Material } from '../types';
import PaginationControls from '../components/PaginationControls';

const GestionMateriales: React.FC = () => {
    const [materiales, setMateriales] = useState<Material[]>([]);
    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageSize = 15;

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
        categoria: '',
        descripcion: '',
        unidad: 'UND',
        informacion_adicional: ''
    });

    useEffect(() => {
        loadCategorias();
    }, []);

    useEffect(() => {
        loadMateriales();
    }, [currentPage, searchTerm]);

    const loadCategorias = async () => {
        const cats = await getCategorias();
        if (cats) setCategoriasList(cats);
    };

    const loadMateriales = async () => {
        const { data, count } = await getMateriales(currentPage, pageSize, searchTerm);
        if (data) {
            setMateriales(data);
            setTotalItems(count);
        }
    };

    // Reset page to 1 when search term changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const totalPages = Math.ceil(totalItems / pageSize);
    const goToPage = (page: number) => setCurrentPage(page);

    const handleSave = async () => {
        if (!newMaterial.categoria || !newMaterial.descripcion) return alert("Complete los campos obligatorios");

        try {
            const materialToSave = { ...newMaterial };

            if (editingId) {
                await updateMaterial(editingId, materialToSave);
            } else {
                await createMaterial(materialToSave);
            }
            setShowModal(false);
            setNewMaterial({ categoria: '', descripcion: '', unidad: 'UND', informacion_adicional: '' });
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
            informacion_adicional: material.informacion_adicional || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Eliminar este material del Catálogo Global?")) {
            await deleteMaterial(id);
            loadMateriales();
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
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

                const existingCats = await getCategorias() || [];
                const catMap = new Map(existingCats.map((c: any) => [c.nombre.toUpperCase(), c]));

                for (const row of data as any[]) {
                    const norm: any = {};
                    Object.keys(row).forEach(k => {
                        const cleanKey = k.toLowerCase().trim().replace(/\s+/g, '_');
                        norm[cleanKey] = row[k];
                    });

                    const descripcion = norm.descripcion || norm.material;
                    const categoriaName = norm.categoria;
                    const unidad = (norm.unidad || 'UND').toString().toUpperCase();
                    const info = norm.informacion || norm.comentario || norm.info_adicional || '';

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

                        // Check uniqueness by name to avoid duplicates during import?
                        // For simplicity, just try insert. If uniqueness constraint exists on DB it will fail, else duplicate.
                        // Ideally we should check if exists.

                        try {
                            await createMaterial({
                                descripcion: descUpper,
                                categoria: catUpper,
                                unidad: unidad,
                                informacion_adicional: info
                            });
                            count++;
                        } catch (err) {
                            errorCount++;
                        }
                    }
                }

                alert(`Proceso completado.\nAgregados al Catálogo: ${count}\nErrores: ${errorCount}`);
                loadMateriales();

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
                <h2 className="mb-0 text-center text-md-start">Catálogo de Materiales</h2>
            </div>

            <Card className="custom-card mb-3">
                <Card.Body>
                    <Row className="g-3 align-items-center">
                        <Col md={8}>
                            <Form.Control
                                placeholder="Buscar en catálogo global..."
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                            />
                        </Col>
                        <Col md={4} className="d-flex justify-content-end gap-2">
                            <label className="btn btn-success text-white">
                                Importar Excel
                                <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} />
                            </label>
                            <Button onClick={() => {
                                setEditingId(null);
                                setNewMaterial({
                                    categoria: '',
                                    descripcion: '',
                                    unidad: 'UND',
                                    informacion_adicional: ''
                                });
                                setShowModal(true);
                            }} className="btn-primary">
                                + Nuevo Material
                            </Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card p-0">
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Categoría</th>
                            <th>Descripción</th>
                            <th>Unidad</th>
                            <th>Info Adicional</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {materiales.map(m => (
                            <tr key={m.id}>
                                <td width="20%">{m.categoria}</td>
                                <td width="40%">{m.descripcion}</td>
                                <td width="10%">{m.unidad}</td>
                                <td width="20%">{m.informacion_adicional || '-'}</td>
                                <td width="10%">
                                    <div className="d-flex gap-2">
                                        <Button variant="warning" size="sm" className="text-white" onClick={() => handleEdit(m)}>Editar</Button>
                                        <Button variant="danger" size="sm" onClick={() => handleDelete(m.id)}>Eliminar</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {materiales.length === 0 && (
                            <tr><td colSpan={5} className="text-center">No se encontraron materiales.</td></tr>
                        )}
                    </tbody>
                </Table>
                <div className="px-3 pb-3">
                    <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={goToPage} />
                </div>

                <Modal show={showModal} onHide={() => setShowModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>{editingId ? 'Editar Material' : 'Nuevo Material Global'}</Modal.Title>
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
                                    onChange={e => setNewMaterial({ ...newMaterial, unidad: e.target.value.toUpperCase() })}
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
