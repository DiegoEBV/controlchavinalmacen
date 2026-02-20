import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Table, Row, Col, InputGroup, Spinner, Dropdown, Tooltip, OverlayTrigger, Badge } from 'react-bootstrap';
import SearchableSelect from './SearchableSelect';
import { Requerimiento, DetalleRequerimiento, Obra, Material, Equipo, EppC } from '../types';
import { getSolicitantes, getCategorias, getBudgetedMaterials } from '../services/requerimientosService';
import { getEquipos } from '../services/equiposService';
import { getBloques } from '../services/frentesService';
import { getInventario } from '../services/almacenService';
import { getEpps } from '../services/eppsService';


import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabaseClient';
import { getFrontSpecialties } from '../services/specialtiesService';
import { Specialty, ListInsumoEspecialidad } from '../types';

interface RequerimientoFormProps {
    show: boolean;
    handleClose: () => void;
    onSave: (req: any, items: any[]) => Promise<void>;
    initialData?: Requerimiento | null;
    obras: Obra[];
}

const RequerimientoForm: React.FC<RequerimientoFormProps> = ({ show, handleClose, onSave, initialData, obras }) => {
    const { profile, selectedObra } = useAuth();
    // Cabecera
    const [obraId, setObraId] = useState('');
    const [frenteId, setFrenteId] = useState('');
    const [bloque, setBloque] = useState('');
    const [especialidad, setEspecialidad] = useState('');
    const [solicitante, setSolicitante] = useState('');

    // Plantilla
    const [templateId, setTemplateId] = useState('');
    const [loadingTemplate, setLoadingTemplate] = useState(false);

    // Fuentes de Datos
    const [materialesList, setMaterialesList] = useState<Material[]>([]);
    const [equiposList, setEquiposList] = useState<Equipo[]>([]);
    const [eppsList, setEppsList] = useState<EppC[]>([]);
    const [frentesList, setFrentesList] = useState<any[]>([]); // Frentes de la obra seleccionada
    const [bloquesList, setBloquesList] = useState<any[]>([]);
    const [selectedBloques, setSelectedBloques] = useState<string[]>([]);
    const [solicitantesList, setSolicitantesList] = useState<any[]>([]);

    const [categoriasList, setCategoriasList] = useState<any[]>([]);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [budgetItems, setBudgetItems] = useState<ListInsumoEspecialidad[]>([]);


    // Especialidades (Cascada)
    const [specialtiesList, setSpecialtiesList] = useState<Specialty[]>([]);
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');

    // Ítems
    const [items, setItems] = useState<Partial<DetalleRequerimiento>[]>([]);

    // Nuevo Ítem
    const [newItem, setNewItem] = useState<Partial<DetalleRequerimiento>>({
        tipo: 'Material',
        material_categoria: 'General',
        descripcion: '',
        unidad: 'und',
        cantidad_solicitada: 0,
        material_id: undefined,
        listinsumo_id: undefined
    });

    const [selectedMaterialId, setSelectedMaterialId] = useState('');

    // Optimization: Filter materials with useMemo
    // Filtrar materiales basados en categoría seleccionada (ya vienen filtrados por frente/especialidad de la DB)
    const filteredMaterials = React.useMemo(() => {
        return materialesList.filter(m => {
            const matchesCategory = newItem.material_categoria === 'General' || m.categoria === newItem.material_categoria;
            return matchesCategory;
        });
    }, [materialesList, newItem.material_categoria]);

    // Derived: Available categories based on filtered materials (ignoring current category selection)
    const availableCategories = React.useMemo(() => {
        const cats = new Set(materialesList.map(m => m.categoria));
        return categoriasList.filter((c: any) => cats.has(c.nombre));
    }, [materialesList, categoriasList]);

    useEffect(() => {
        loadCatalogs();
    }, []);

    useEffect(() => {
        if (obraId) {
            loadFrentes(obraId);
            loadEquipos(obraId);
            loadInventory(obraId);
        } else {
            setFrentesList([]);
            setEquiposList([]);
            setBloquesList([]);
            setStockMap({}); // Reset stock map
            setFrenteId('');
            setBloque('');
            setSelectedBloques([]);
        }
    }, [obraId]);

    const loadCatalogs = async () => {
        const [sols, cats, epps] = await Promise.all([
            // getMateriales(), // No cargar materiales al inicio, se cargan por especialidad
            getSolicitantes(),
            getCategorias(),
            getEpps()
        ]);

        // if (mats) setMaterialesList(mats);
        if (sols) setSolicitantesList(sols);
        if (cats) setCategoriasList(cats);
        if (epps) setEppsList(epps);
    };

    const loadFrentes = async (oid: string) => {
        const { data } = await supabase.from('frentes').select('*').eq('obra_id', oid).order('nombre_frente');
        if (data) setFrentesList(data);
    };

    const loadBloques = async (fid: string) => {
        if (!fid) {
            setBloquesList([]);
            return;
        }
        const data = await getBloques(fid);
        setBloquesList(data || []);
    };

    const loadEquipos = async (oid: string) => {
        const data = await getEquipos(oid);
        if (data) setEquiposList(data);
    };

    const loadInventory = async (oid: string) => {
        const inv = await getInventario(oid);
        if (inv) {
            const map: Record<string, number> = {};
            inv.forEach((i: any) => {
                // Map stock for all types
                if (i.material_id) map[i.material_id] = i.cantidad_actual;
                if (i.equipo_id) map[i.equipo_id] = i.cantidad_actual;
                if (i.epp_id) map[i.epp_id] = i.cantidad_actual;
            });
            setStockMap(map);
        }
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

                // Parsear bloques si existen
                if (initialData.frente_id) {
                    loadBloques(initialData.frente_id);
                }

                if (initialData.bloque) {
                    const blqs = initialData.bloque.split(',').map(s => s.trim());
                    setSelectedBloques(blqs);
                }

                if (initialData.frente_id) {
                    getFrontSpecialties(initialData.frente_id).then(setSpecialtiesList);
                    if (initialData.specialty_id) {
                        setSelectedSpecialtyId(initialData.specialty_id);
                    }
                }

                // Reset newItem to default when opening to edit
                setNewItem({
                    tipo: 'Material',
                    material_categoria: 'General',
                    descripcion: '',
                    unidad: 'und',
                    cantidad_solicitada: 0,
                    material_id: undefined,
                    listinsumo_id: undefined
                });
            } else {
                setObraId(selectedObra?.id || '');
                setFrenteId('');

                setBloque('');
                setBloquesList([]);
                setSelectedBloques([]);

                setEspecialidad('');
                setSolicitante(profile?.nombre || '');
                setItems([]);
                // Reset newItem to default when opening fresh
                setNewItem({
                    tipo: 'Material',
                    material_categoria: 'General',
                    descripcion: '',
                    unidad: 'und',
                    cantidad_solicitada: 0,
                    material_id: undefined,
                    listinsumo_id: undefined
                });
            }
        }
    }, [show, initialData, selectedObra]);

    // Load Budgeted Materials when Frente + Specialty changes
    useEffect(() => {
        if (frenteId && selectedSpecialtyId) {
            setMaterialesList([]); // Clear previous
            setBudgetItems([]);
            getBudgetedMaterials(frenteId, selectedSpecialtyId).then((data: any[]) => {
                const items = data || [];
                setBudgetItems(items as ListInsumoEspecialidad[]);
                // Extract unique materials
                const mats = items.map((i: any) => i.material).filter(Boolean);
                const uniqueMats = Array.from(new Map(mats.map((m: any) => [m.id, m])).values());
                setMaterialesList(uniqueMats as Material[]);
            });
        } else {
            setMaterialesList([]);
            setBudgetItems([]);
        }
    }, [frenteId, selectedSpecialtyId]);

    const handleLoadTemplate = async () => {
        if (!obraId) {
            alert("Seleccione una Obra primero.");
            return;
        }
        if (!frenteId) {
            alert("Seleccione un Frente primero.");
            return;
        }
        if (!templateId) {
            alert("Ingrese un número de requerimiento plantilla.");
            return;
        }

        if (items.length > 0) {
            if (!confirm("Al cargar la plantilla se reemplazarán los materiales actuales. ¿Desea continuar?")) {
                return;
            }
        }

        setLoadingTemplate(true);
        try {
            // Buscar el requerimiento por correlativo y obra
            const { data: reqData, error } = await supabase
                .from('requerimientos')
                .select('id, frente_id')
                .eq('item_correlativo', templateId)
                .eq('obra_id', obraId)
                .single();

            if (error || !reqData) {
                alert("Requerimiento plantilla no encontrado para esta obra.");
                setLoadingTemplate(false);
                return;
            }

            // Validar que pertenezca al mismo frente
            if (reqData.frente_id !== frenteId) {
                alert("El requerimiento plantilla no pertenece al Frente seleccionado.");
                setLoadingTemplate(false);
                return;
            }

            // Obtener detalles
            const { data: detallesData, error: detError } = await supabase
                .from('detalles_requerimiento')
                .select('*')
                .eq('requerimiento_id', reqData.id);

            if (detError) {
                console.error("Error fetching template details:", detError);
                alert("Error al cargar detalles de la plantilla.");
            } else if (detallesData) {
                const newItems = detallesData.map((d: any) => ({
                    tipo: d.tipo,
                    material_categoria: d.material_categoria,
                    descripcion: d.descripcion,
                    unidad: d.unidad,
                    cantidad_solicitada: d.cantidad_solicitada, // Mantener cantidad original pero editable
                    material_id: d.material_id,
                    listinsumo_id: d.listinsumo_id,
                    equipo_id: d.equipo_id,
                    epp_id: d.epp_id,
                    // Reiniciar estados de atención
                    cantidad_atendida: 0,
                    estado: 'Pendiente' as const
                }));
                setItems(newItems);
            }
        } catch (err) {
            console.error("Error loading template:", err);
            alert("Ocurrió un error al cargar la plantilla.");
        } finally {
            setLoadingTemplate(false);
        }
    };

    const handleAddItem = () => {
        if (!newItem.descripcion || !newItem.cantidad_solicitada || newItem.cantidad_solicitada <= 0) {
            alert("Complete descripción y cantidad > 0");
            return;
        }

        // Budget Validation (Non-blocking)
        if (newItem.tipo === 'Material' && selectedMaterialId) {
            const budgetItem = budgetItems.find(b => b.material_id === selectedMaterialId);
            if (budgetItem) {
                const currentUsage = budgetItem.cantidad_utilizada || 0;
                const budgetLimit = budgetItem.cantidad_presupuestada || 0;

                // Calculate pending in form (excluding current item if updating)
                const pendingInForm = items.reduce((sum, i) => {
                    if (i.tipo === 'Material' && i.descripcion === newItem.descripcion) return sum + (i.cantidad_solicitada || 0);
                    return sum;
                }, 0);

                const projectedUsage = currentUsage + pendingInForm + (newItem.cantidad_solicitada || 0);

                if (projectedUsage > budgetLimit) {
                    const over = projectedUsage - budgetLimit;
                    // ALERT if exceeded, but allow to proceed if confirmed
                    if (!confirm(`⚠️ PRECAUCIÓN: Estás excediendo el presupuesto.\n\nPresupuesto: ${budgetLimit}\nUtilizado + Pendiente: ${projectedUsage}\nExceso: ${over.toFixed(2)}\n\n¿Deseas agregar el ítem de todos modos?`)) {
                        return;
                    }
                } else {
                    // Alert if getting close (>= 90%)
                    const percent = budgetLimit > 0 ? (projectedUsage / budgetLimit) * 100 : 0;
                    if (percent >= 90) {
                        alert(`⚠️ ATENCIÓN: Con este pedido llegarás al ${percent.toFixed(1)}% del presupuesto.`);
                    }
                }
            } else {
                // Material without budget logic... (keep as is or warn?)
                if (!confirm("Este material NO tiene presupuesto asignado en este frente/especialidad.\n¿Deseas agregarlo de todos modos?")) {
                    return;
                }
            }
        }

        // Verificar si ya existe
        const existingIndex = items.findIndex(i =>
            i.tipo === newItem.tipo &&
            i.descripcion === newItem.descripcion &&
            i.material_categoria === newItem.material_categoria
        );

        if (existingIndex >= 0) {
            // Actualizar cantidad
            const updatedItems = [...items];
            const currentQty = updatedItems[existingIndex].cantidad_solicitada || 0;
            updatedItems[existingIndex] = {
                ...updatedItems[existingIndex],
                cantidad_solicitada: currentQty + (newItem.cantidad_solicitada || 0)
            };
            setItems(updatedItems);
        } else {
            // Agregar nuevo
            setItems([...items, { ...newItem }]);
        }

        setNewItem(prev => ({
            ...prev,
            material_categoria: prev.tipo === 'Material' ? 'General' : '',
            descripcion: '',
            unidad: 'und',
            cantidad_solicitada: 0,
            equipo_id: undefined,
            epp_id: undefined,
            material_id: undefined,
            listinsumo_id: undefined
        }));
        setSelectedMaterialId('');
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

        // Validar cantidades positivas
        const invalidItems = items.filter(i => !i.cantidad_solicitada || i.cantidad_solicitada <= 0);
        if (invalidItems.length > 0) {
            return alert("Todos los ítems deben tener una cantidad mayor a 0.");
        }

        const headerData = {
            obra_id: obraId || null,
            frente_id: frenteId,
            bloque,
            especialidad,
            specialty_id: selectedSpecialtyId || null,
            solicitante,
            fecha_solicitud: new Date().toISOString().split('T')[0]
        };

        try {
            await onSave(headerData, items);
            handleClose();
        } catch (error) {
            console.error("Error al guardar requerimiento:", error);
            // El alert ya se maneja en el padre (GestionRequerimientos)
        }
    };

    // Filtrar materiales basados en categoría seleccionada Y frente seleccionado


    // Manejar selección de material para auto-rellenar unidad
    const handleMaterialSelect = (id: string) => {
        setSelectedMaterialId(id);
        const selectedMat = materialesList.find(m => m.id === id);
        if (selectedMat) {
            const budgetItem = budgetItems.find(b => b.material_id === id);
            setNewItem(prev => ({
                ...prev,
                descripcion: selectedMat.descripcion,
                // Si estamos en General, actualizamos a la categoría real del material para consistencia de datos y stock
                material_categoria: selectedMat.categoria,
                unidad: selectedMat.unidad,
                material_id: id,
                listinsumo_id: budgetItem ? budgetItem.id : undefined
            }));
        }
    };

    const handleEppSelect = (id: string) => {
        const selectedEpp = eppsList.find(e => e.id === id);
        if (selectedEpp) {
            setNewItem(prev => ({
                ...prev,
                descripcion: selectedEpp.descripcion,
                unidad: selectedEpp.unidad,
                epp_id: selectedEpp.id,
                // Si es EPP, no usamos Categoria por ahora o podríamos mapearlo
            }));
        }
    };

    const handleEquipoSelect = (id: string) => {
        const selectedEq = equiposList.find(e => e.id === id);
        if (selectedEq) {
            setNewItem(prev => ({
                ...prev,
                descripcion: `${selectedEq.nombre} - ${selectedEq.marca}`,
                unidad: 'und', // Default unit for equipment
                equipo_id: selectedEq.id
            }));
        }
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
                                <Form.Select
                                    value={obraId}
                                    onChange={e => {
                                        setObraId(e.target.value);
                                        // Resetear frentes y bloques si cambia la obra
                                        setFrenteId('');
                                        setBloquesList([]);
                                        setSelectedBloques([]);
                                        setBloque('');
                                    }}
                                >
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
                                    onChange={e => {
                                        setFrenteId(e.target.value);
                                        loadBloques(e.target.value); // Cargar bloques
                                        setBloquesList([]); // Limpiar previo
                                        setSelectedBloques([]); // Limpiar selección
                                        setBloque('');

                                        // Resetear item y selección de material al cambiar de frente
                                        setNewItem({
                                            ...newItem,
                                            // Si es Material, mantener General. Si no, vacío.
                                            material_categoria: newItem.tipo === 'Material' ? 'General' : '',
                                            descripcion: '',
                                            unidad: newItem.tipo === 'Equipo' ? 'und' : 'und',
                                            cantidad_solicitada: 0,
                                            material_id: undefined,
                                            listinsumo_id: undefined
                                        });
                                        setSelectedMaterialId('');

                                        // Reset Specialty
                                        setSpecialtiesList([]);
                                        setSelectedSpecialtyId('');
                                        setEspecialidad('');

                                        // Load Specialties for new Frente
                                        if (e.target.value) {
                                            getFrontSpecialties(e.target.value).then(setSpecialtiesList);
                                        }
                                    }}
                                    disabled={!obraId || !!initialData}
                                >
                                    <option value="">Seleccione...</option>
                                    {frentesList.map(f => <option key={f.id} value={f.id}>{f.nombre_frente}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2}>
                            <Form.Group>
                                <Form.Label>Bloque</Form.Label>
                                <Dropdown autoClose="outside">
                                    <Dropdown.Toggle
                                        variant=""
                                        className="form-select text-start d-flex align-items-center justify-content-between text-truncate"
                                        style={{ height: 'auto' }} // Ensure height adjusts if necessary
                                    >
                                        <span className="text-truncate" style={{ maxWidth: '90%' }}>
                                            {selectedBloques.length > 0 ? selectedBloques.join(', ') : 'Seleccione...'}
                                        </span>
                                    </Dropdown.Toggle>

                                    <Dropdown.Menu className="w-100 p-2" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        {bloquesList.length > 0 ? (
                                            bloquesList.map(b => (
                                                <Form.Check
                                                    key={b.id}
                                                    type="checkbox"
                                                    id={`bloque-${b.id}`}
                                                    label={b.nombre_bloque}
                                                    checked={selectedBloques.includes(b.nombre_bloque)}
                                                    onChange={() => {
                                                        const nombre = b.nombre_bloque;
                                                        const newSelection = selectedBloques.includes(nombre)
                                                            ? selectedBloques.filter(s => s !== nombre)
                                                            : [...selectedBloques, nombre];
                                                        setSelectedBloques(newSelection);
                                                        setBloque(newSelection.join(', '));
                                                    }}
                                                    className="mb-2"
                                                />
                                            ))
                                        ) : (
                                            <div className="text-muted small text-center">No hay bloques registrados en este frente.</div>
                                        )}
                                        {/* Opción de "Otro" para escribir manual si fuera necesario, 
                                            pero por ahora restringimos a la lista para forzar uso de Gestion de Frentes */}
                                    </Dropdown.Menu>
                                </Dropdown>
                            </Form.Group>
                        </Col>
                        <Col md={2}>
                            <Form.Group>
                                <Form.Label>Especialidad</Form.Label>
                                <Form.Select
                                    value={selectedSpecialtyId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setSelectedSpecialtyId(id);
                                        const spec = specialtiesList.find(s => s.id === id);
                                        setEspecialidad(spec ? spec.name : '');

                                        // Reset material selection logic when specialty changes
                                        setNewItem(prev => ({ ...prev, material_categoria: 'General', descripcion: '' }));
                                        setSelectedMaterialId('');
                                    }}
                                    disabled={!frenteId || !!initialData}
                                >
                                    <option value="">Seleccione...</option>
                                    {specialtiesList.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
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

                    <h6 className="text-primary mb-3">Cargar desde Plantilla</h6>
                    <Row className="mb-3">
                        <Col md={4}>
                            <InputGroup>
                                <Form.Control
                                    placeholder="N° Req. Plantilla"
                                    value={templateId}
                                    onChange={e => setTemplateId(e.target.value)}
                                    type="number"
                                />
                                <Button
                                    variant="outline-primary"
                                    onClick={handleLoadTemplate}
                                    disabled={loadingTemplate || !obraId}
                                >
                                    {loadingTemplate ? <Spinner animation="border" size="sm" /> : 'Cargar Plantilla'}
                                </Button>
                            </InputGroup>
                            <Form.Text className="text-muted">
                                Ingrese el número del requerimiento anterior para copiar sus materiales.
                            </Form.Text>
                        </Col>
                    </Row>

                    <h6 className="text-primary mb-3">Agregar Insumo</h6>
                    <Row className="mb-3 g-2 bg-light p-2 rounded">
                        <Col md={2}>
                            <Form.Label>Tipo</Form.Label>
                            <OverlayTrigger
                                placement="top"
                                overlay={
                                    <Tooltip id="tooltip-tipo">
                                        No se pueden mezclar Servicios con Materiales, Equipos o EPPs en un mismo requerimiento.
                                    </Tooltip>
                                }
                            >
                                <div>
                                    <Form.Select
                                        value={newItem.tipo}
                                        onChange={e => {
                                            const newType = e.target.value as any;
                                            setNewItem({
                                                ...newItem,
                                                tipo: newType,
                                                material_categoria: newType === 'Material' ? 'General' : '',
                                                descripcion: '',
                                                unidad: (newType === 'Equipo' || newType === 'EPP') ? 'und' : newItem.unidad, // Reset unit
                                                equipo_id: undefined,
                                                epp_id: undefined,
                                                material_id: undefined,
                                                listinsumo_id: undefined
                                            });
                                            setSelectedMaterialId('');
                                        }}
                                    >
                                        <option value="Material" disabled={items.some(i => i.tipo === 'Servicio')}>Material</option>
                                        <option value="Servicio" disabled={items.some(i => i.tipo !== 'Servicio')}>Servicio</option>
                                        <option value="Equipo" disabled={items.some(i => i.tipo === 'Servicio')}>Equipo</option>
                                        <option value="EPP" disabled={items.some(i => i.tipo === 'Servicio')}>EPP</option>
                                    </Form.Select>
                                </div>
                            </OverlayTrigger>
                        </Col>
                        <Col md={2}>
                            <Form.Label>Categoría</Form.Label>
                            <Form.Select
                                value={newItem.material_categoria}
                                onChange={e => {
                                    setNewItem({ ...newItem, material_categoria: e.target.value, descripcion: '' });
                                    setSelectedMaterialId('');
                                }}
                                disabled={newItem.tipo !== 'Material'}
                            >
                                <option value="">Seleccione...</option>
                                <option value="General">General</option>

                                {availableCategories.map((c: any) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={4}>
                            <Form.Label>Descripción *</Form.Label>
                            {/* Si se selecciona categoría, mostrar dropdown de materiales. Si no, mostrar input de texto (o select vacío) */}
                            {newItem.tipo === 'Material' && newItem.material_categoria ? (
                                <SearchableSelect
                                    options={filteredMaterials.map(m => {
                                        const budgetItem = budgetItems.find(b => b.material_id === m.id);
                                        const saldo = budgetItem ? budgetItem.cantidad_presupuestada - budgetItem.cantidad_utilizada : 0;
                                        return {
                                            value: m.id,
                                            label: `${m.descripcion} (Saldo: ${saldo.toFixed(2)})`,
                                            info: m.informacion_adicional
                                        };
                                    })}
                                    value={selectedMaterialId}
                                    onChange={(val) => handleMaterialSelect(val as string)}
                                    disabled={!frenteId || !selectedSpecialtyId}
                                    placeholder={(!frenteId || !selectedSpecialtyId) ? 'Seleccione Especialidad Primero' : 'Seleccione Material...'}
                                />
                            ) : newItem.tipo === 'Equipo' ? (
                                <SearchableSelect
                                    options={equiposList.map(e => ({
                                        value: e.id,
                                        label: `${e.nombre} - ${e.marca} (${e.codigo || 'S/C'})`
                                    }))}
                                    value={newItem.equipo_id || ''}
                                    onChange={(val) => handleEquipoSelect(val as string)}
                                    placeholder="Buscar Equipo..."
                                />
                            ) : newItem.tipo === 'EPP' ? (
                                <SearchableSelect
                                    options={eppsList.map(e => ({
                                        value: e.id,
                                        label: `${e.descripcion} [${e.codigo || 'S/C'}]`
                                    }))}
                                    value={newItem.epp_id || ''}
                                    onChange={(val) => handleEppSelect(val as string)}
                                    placeholder="Buscar EPP..."
                                />
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
                                readOnly={(newItem.tipo === 'Material' && !!newItem.material_categoria) || newItem.tipo === 'EPP'} // Solo lectura si se auto-rellena
                            />
                        </Col>
                        <Col md={2}>
                            <Form.Label>Cant. *</Form.Label>

                            <div className="d-flex align-items-center">
                                <Form.Control type="number" value={newItem.cantidad_solicitada} onChange={e => setNewItem({ ...newItem, cantidad_solicitada: parseFloat(e.target.value) })} />
                                <Button variant="success" className="ms-1" onClick={handleAddItem}>+</Button>
                            </div>
                            {newItem.descripcion && (
                                <div className="mt-1">
                                    {(() => {
                                        let stock = 0;
                                        let showStock = false;
                                        let unit = newItem.unidad;

                                        if (newItem.tipo === 'Material' && selectedMaterialId) {
                                            const selectedMat = materialesList.find(m => m.id === selectedMaterialId);
                                            if (selectedMat) {
                                                stock = stockMap[selectedMat.id] || 0;
                                                showStock = true;
                                            }
                                        } else if (newItem.tipo === 'Equipo' && newItem.equipo_id) {
                                            const selectedEq = equiposList.find(e => e.id === newItem.equipo_id);
                                            if (selectedEq) {
                                                stock = stockMap[selectedEq.id] || 0;
                                                showStock = true;
                                                // Ensure unit is correct if needed, but equipment is usually 'und'
                                            }
                                        } else if (newItem.tipo === 'EPP' && newItem.epp_id) {
                                            const selectedEpp = eppsList.find(e => e.id === newItem.epp_id);
                                            if (selectedEpp) {
                                                stock = stockMap[selectedEpp.id] || 0;
                                                showStock = true;
                                            }
                                        }

                                        if (showStock) {
                                            return (
                                                <small className={stock > 0 ? "text-success fw-bold" : "text-danger fw-bold"}>
                                                    Stock: {stock} {unit}
                                                </small>
                                            );
                                        }
                                        return null;
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
                                    <td>
                                        {it.descripcion}
                                        {it.tipo === 'Material' && !it.listinsumo_id && (
                                            <Badge bg="warning" text="dark" className="ms-2">Extra-presupuestal</Badge>
                                        )}
                                    </td>
                                    <td>{it.unidad}</td>
                                    <td style={{ width: '150px' }}>
                                        <Form.Control
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={it.cantidad_solicitada}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                const updatedItems = [...items];
                                                updatedItems[idx].cantidad_solicitada = isNaN(val) ? 0 : val;
                                                setItems(updatedItems);
                                            }}
                                        />
                                    </td>
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
