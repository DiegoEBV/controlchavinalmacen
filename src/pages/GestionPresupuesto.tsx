import React, { useState, useEffect } from 'react';
import { Row, Col, Table, Button, Form, Modal, Card } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Material, Specialty, ListInsumoEspecialidad } from '../types';
import { getFrontSpecialties } from '../services/specialtiesService';
import { getMateriales } from '../services/requerimientosService';

const GestionPresupuesto: React.FC = () => {
    const [obras, setObras] = useState<any[]>([]);
    const [frentes, setFrentes] = useState<any[]>([]);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);

    // Filters
    const [selectedObraId, setSelectedObraId] = useState('');
    const [selectedFrenteId, setSelectedFrenteId] = useState('');
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');

    const [budgetItems, setBudgetItems] = useState<ListInsumoEspecialidad[]>([]);
    const [allMaterials, setAllMaterials] = useState<Material[]>([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<ListInsumoEspecialidad | null>(null);

    // Form State
    const [formMaterialId, setFormMaterialId] = useState('');
    const [formCantidad, setFormCantidad] = useState<number>(0);

    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadObras();
        loadMaterials();
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
            getFrontSpecialties(selectedFrenteId).then(setSpecialties);
        } else {
            setSpecialties([]);
            setSelectedSpecialtyId('');
        }
    }, [selectedFrenteId]);

    useEffect(() => {
        if (selectedFrenteId && selectedSpecialtyId) {
            loadBudgetItems();
        } else {
            setBudgetItems([]);
        }
    }, [selectedFrenteId, selectedSpecialtyId]);

    const loadObras = async () => {
        const { data } = await supabase.from('obras').select('*').order('nombre_obra');
        if (data) setObras(data);
    };

    const loadFrentes = async (obraId: string) => {
        const { data } = await supabase.from('frentes').select('*').eq('obra_id', obraId).order('nombre_frente');
        return data || [];
    };

    const loadMaterials = async () => {
        const mats = await getMateriales();
        if (mats) setAllMaterials(mats);
    };

    const loadBudgetItems = async () => {
        setLoading(true);
        try {
            // First get the front_specialty_id
            const { data: fsData, error: fsError } = await supabase
                .from('front_specialties')
                .select('id')
                .eq('front_id', selectedFrenteId)
                .eq('specialty_id', selectedSpecialtyId)
                .single();

            if (fsError || !fsData) {
                console.error("Error finding front_specialty:", fsError);
                setBudgetItems([]);
                return;
            }

            const { data, error } = await supabase
                .from('listinsumo_especialidad')
                .select('*, material:materiales(*)')
                .eq('front_specialty_id', fsData.id);

            if (error) throw error;
            setBudgetItems(data as ListInsumoEspecialidad[]);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedFrenteId || !selectedSpecialtyId) return alert("Seleccione Frente y Especialidad");
        if (!formMaterialId) return alert("Seleccione un material");
        if (formCantidad <= 0) return alert("La cantidad debe ser mayor a 0");

        try {
            // Get front_specialty_id
            const { data: fsData } = await supabase
                .from('front_specialties')
                .select('id')
                .eq('front_id', selectedFrenteId)
                .eq('specialty_id', selectedSpecialtyId)
                .single();

            if (!fsData) return alert("Error al identificar la especialidad del frente");

            if (editingItem) {
                // Update
                const { error } = await supabase
                    .from('listinsumo_especialidad')
                    .update({ cantidad_presupuestada: formCantidad })
                    .eq('id', editingItem.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('listinsumo_especialidad')
                    .insert({
                        front_specialty_id: fsData.id,
                        material_id: formMaterialId,
                        cantidad_presupuestada: formCantidad,
                        cantidad_utilizada: 0
                    });
                if (error) throw error;
            }

            setShowModal(false);
            setEditingItem(null);
            setFormMaterialId('');
            setFormCantidad(0);
            loadBudgetItems();

        } catch (error: any) {
            console.error("Error saving budget item:", error);
            if (error.code === '23505') {
                alert("Este material ya está en el presupuesto de esta especialidad. Edítelo en lugar de agregarlo.");
            } else {
                alert("Error al guardar.");
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este material del presupuesto?")) return;
        try {
            const { error } = await supabase.from('listinsumo_especialidad').delete().eq('id', id);
            if (error) throw error;
            loadBudgetItems();
        } catch (error) {
            console.error(error);
            alert("Error al eliminar");
        }
    };

    const handleDownloadCatalog = async () => {
        try {
            let XLSX: any;
            try {
                XLSX = await import('xlsx');
            } catch (error) {
                return alert("Error cargando librería XLSX");
            }

            const data = allMaterials.map(m => ({
                id: m.id,
                descripcion: m.descripcion,
                unidad: m.unidad,
                categoria: m.categoria
            }));

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
            XLSX.writeFile(wb, "catalogo_materiales.xlsx");

        } catch (error) {
            console.error("Error downloading catalog:", error);
            alert("Error al descargar catálogo");
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedFrenteId || !selectedSpecialtyId) return alert("Seleccione Frente y Especialidad antes de importar.");

        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                let XLSX: any;
                try {
                    XLSX = await import('xlsx');
                } catch (error) {
                    return alert("Error cargando librería XLSX");
                }

                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    alert("El archivo Excel parece estar vacío.");
                    return;
                }

                // Get front_specialty_id
                const { data: fsData } = await supabase
                    .from('front_specialties')
                    .select('id')
                    .eq('front_id', selectedFrenteId)
                    .eq('specialty_id', selectedSpecialtyId)
                    .single();

                if (!fsData) return alert("No se encontró la configuración de Frente/Especialidad");

                let count = 0;
                let errorCount = 0;

                // Create a map of existing materials for fuzzy matching
                const matMap = new Map(allMaterials.map(m => [m.descripcion.toUpperCase(), m.id]));
                const matIdMap = new Map(allMaterials.map(m => [m.id, m.id]));

                for (const rawRow of data as any[]) {
                    // Normalize keys to lower case to avoid case sensitivity issues
                    const row: any = {};
                    Object.keys(rawRow).forEach(key => {
                        row[key.toLowerCase().trim()] = rawRow[key];
                    });

                    // Try ID match first
                    let matId = '';
                    const rowId = row.id || row.material_id || row['id material'];

                    if (rowId && matIdMap.has(rowId)) {
                        matId = rowId;
                    } else {
                        // Fallback to Description match
                        const desc = (row.descripcion || row.material || row.insumo || row.description || '').toString().trim().toUpperCase();
                        if (desc) matId = matMap.get(desc) || '';
                    }

                    // Parse quantity
                    const qtyVal = row.cantidad || row.presupuesto || row['cantidad presupuestada'] || row['cant.'] || '0';
                    const qty = parseFloat(qtyVal);

                    if (matId && qty > 0) {
                        try {
                            // Use UPSERT to allow updating existing records
                            const { error } = await supabase.from('listinsumo_especialidad').upsert({
                                front_specialty_id: fsData.id,
                                material_id: matId,
                                cantidad_presupuestada: qty
                                // cantidad_utilizada: 0 // Do not reset utilized on upsert!
                            }, { onConflict: 'front_specialty_id, material_id' });

                            if (!error) count++;
                            else {
                                console.error("Row fail PG:", error);
                                errorCount++;
                            }
                        } catch (e) {
                            console.error("Row fail JS:", e);
                            errorCount++;
                        }
                    } else {
                        // console.warn("Skipping row:", row, "ID found:", !!matId, "Qty > 0:", qty > 0);
                        errorCount++;
                    }
                }

                alert(`Proceso completado.\n\nRegistros procesados exitosamente: ${count}\nRegistros omitidos/error: ${errorCount}\n\nNota: Los omitidos pueden ser porque no se encontró el ID/Nombre del material o la cantidad es 0.`);
                loadBudgetItems();

            } catch (error) {
                console.error("Error importing:", error);
                alert("Error procesando archivo");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    }

    const filteredItems = budgetItems.filter(item =>
        item.material?.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material?.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fade-in">
            <div className="page-header mb-4">
                <h2 className="mb-0">Gestión de Presupuesto (ListInsumo)</h2>
                <p className="text-muted">Defina los materiales y cantidades permitidas por Especialidad</p>
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
                            <Form.Label>Frente</Form.Label>
                            <Form.Select value={selectedFrenteId} onChange={e => setSelectedFrenteId(e.target.value)} disabled={!selectedObraId}>
                                <option value="">-- Seleccione Frente --</option>
                                {frentes.map(f => <option key={f.id} value={f.id}>{f.nombre_frente}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={4}>
                            <Form.Label>Especialidad</Form.Label>
                            <Form.Select value={selectedSpecialtyId} onChange={e => setSelectedSpecialtyId(e.target.value)} disabled={!selectedFrenteId}>
                                <option value="">-- Seleccione Especialidad --</option>
                                {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </Form.Select>
                        </Col>
                    </Row>

                    <Row className="mt-4 border-top pt-3">
                        <Col md={12} className="d-flex justify-content-between align-items-center">
                            <Form.Control
                                placeholder="Buscar en presupuesto..."
                                className="w-auto"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <div className="d-flex gap-2">
                                <Button
                                    variant="info"
                                    className="text-white"
                                    onClick={handleDownloadCatalog}
                                >
                                    Descargar Catálogo
                                </Button>
                                <label className={`btn btn-success text-white ${(!selectedFrenteId || !selectedSpecialtyId) ? 'disabled' : ''}`}>
                                    Importar Excel
                                    <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} disabled={!selectedFrenteId || !selectedSpecialtyId} />
                                </label>
                                <Button
                                    className="btn-primary"
                                    disabled={!selectedFrenteId || !selectedSpecialtyId}
                                    onClick={() => {
                                        setEditingItem(null);
                                        setFormMaterialId('');
                                        setFormCantidad(0);
                                        setShowModal(true);
                                    }}
                                >
                                    + Agregar Material
                                </Button>
                            </div>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card p-0">
                <Table responsive hover className="table-borderless-custom mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th>Material</th>
                            <th>Unidad</th>
                            <th className="text-center">Cant. Presupuestada</th>
                            <th className="text-center">Cant. Utilizada</th>
                            <th className="text-center">Saldo</th>
                            <th className="text-end">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="text-center p-4">Cargando...</td></tr>
                        ) : filteredItems.length > 0 ? (
                            filteredItems.map(item => {
                                const saldo = item.cantidad_presupuestada - item.cantidad_utilizada;
                                const percent = item.cantidad_presupuestada > 0
                                    ? (item.cantidad_utilizada / item.cantidad_presupuestada) * 100
                                    : 0;

                                return (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="fw-bold">{item.material?.descripcion}</div>
                                            <div className="text-muted small">{item.material?.categoria}</div>
                                        </td>
                                        <td>{item.material?.unidad}</td>
                                        <td className="text-center fw-bold">{item.cantidad_presupuestada}</td>
                                        <td className="text-center">
                                            {item.cantidad_utilizada}
                                            <div className="progress mt-1" style={{ height: '4px' }}>
                                                <div
                                                    className={`progress-bar ${percent > 90 ? 'bg-danger' : percent > 70 ? 'bg-warning' : 'bg-success'}`}
                                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                                ></div>
                                            </div>
                                        </td>
                                        <td className={`text-center fw-bold ${saldo < 0 ? 'text-danger' : 'text-success'}`}>
                                            {saldo.toFixed(2)}
                                        </td>
                                        <td className="text-end">
                                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => {
                                                setEditingItem(item);
                                                setFormMaterialId(item.material_id);
                                                setFormCantidad(item.cantidad_presupuestada);
                                                setShowModal(true);
                                            }}>Editar</Button>
                                            <Button variant="outline-danger" size="sm" onClick={() => handleDelete(item.id)}>Eliminar</Button>
                                        </td>
                                    </tr>
                                )
                            })
                        ) : (
                            <tr><td colSpan={6} className="text-center p-4">
                                {(!selectedFrenteId || !selectedSpecialtyId)
                                    ? 'Seleccione Frente y Especialidad para ver el presupuesto'
                                    : 'No hay materiales en el presupuesto. Agregue uno o importe desde Excel.'}
                            </td></tr>
                        )}
                    </tbody>
                </Table>
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{editingItem ? 'Editar Presupuesto Insumo' : 'Agregar Insumo al Presupuesto'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Material</Form.Label>
                            {editingItem ? (
                                <Form.Control value={editingItem.material?.descripcion} disabled />
                            ) : (
                                <Form.Select
                                    value={formMaterialId}
                                    onChange={e => setFormMaterialId(e.target.value)}
                                >
                                    <option value="">Seleccione Material...</option>
                                    {allMaterials.map(m => (
                                        <option key={m.id} value={m.id}>{m.descripcion} ({m.unidad})</option>
                                    ))}
                                </Form.Select>
                            )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Cantidad Presupuestada</Form.Label>
                            <Form.Control
                                type="number"
                                min="0"
                                step="0.01"
                                value={formCantidad}
                                onChange={e => setFormCantidad(parseFloat(e.target.value))}
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

export default GestionPresupuesto;
