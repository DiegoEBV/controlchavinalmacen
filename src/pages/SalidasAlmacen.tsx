import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario, registrarSalida } from '../services/almacenService';
import { getTerceros } from '../services/tercerosService';
import { getFrentes, getBloques } from '../services/frentesService';
import { Inventario, MovimientoAlmacen, Tercero, Bloque, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const SalidasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [inventario, setInventario] = useState<Inventario[]>([]);

    // Form Header State
    const [solicitante, setSolicitante] = useState('');
    const [destino, setDestino] = useState('');
    const [selectedTercero, setSelectedTercero] = useState<string>('');
    const [selectedEncargado, setSelectedEncargado] = useState<string>('');
    const [selectedBloque, setSelectedBloque] = useState<string>('');
    const [numeroVale, setNumeroVale] = useState('');

    // Masters
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [encargados, setEncargados] = useState<UserProfile[]>([]);
    const [bloques, setBloques] = useState<Bloque[]>([]);

    // Item Addition State
    const [tipoItem, setTipoItem] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedInventarioId, setSelectedInventarioId] = useState<string>(''); // We select the Inventory ID
    const [cantidadSalida, setCantidadSalida] = useState(0);

    // List of Items to Withdraw
    interface SalidaItem {
        tipo: 'MATERIAL' | 'EQUIPO' | 'EPP';
        id: string; // The specific Item ID (not inventory ID)
        nombre: string;
        unidad: string;
        cantidad: number;
        maxStock: number;
        invId: string; // Keep track of inventory record ID
    }
    const [itemsToAdd, setItemsToAdd] = useState<SalidaItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // History State
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    // --- Realtime Subscriptions ---
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: updatedStock } = await supabase
                .from('inventario_obra')
                .select(`
                    *,
                    material:materiales(*),
                    equipo:equipos(*),
                    epp:epps_c(*)
                `)
                .in('id', Array.from(upserts));

            if (updatedStock) {
                setInventario(prev => mergeUpdates(prev, updatedStock as Inventario[], new Set()));
            }
        }
    }, { table: 'inventario_obra', event: 'UPDATE', throttleMs: 1000 });

    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            loadData(); // Simple reload for history updates
        }
    }, { table: 'movimientos_almacen', event: 'INSERT', throttleMs: 2000 });

    useEffect(() => {
        if (selectedObra) {
            loadData();
            loadMaestros();
        } else {
            setInventario([]);
            setHistorial([]);
            setTerceros([]);
            setBloques([]);
        }
    }, [selectedObra]);

    // Clear selection on type change
    useEffect(() => {
        setSelectedInventarioId('');
        setCantidadSalida(0);
    }, [tipoItem]);

    const loadMaestros = async () => {
        if (!selectedObra) return;

        try {
            const [tercerosData, frentesData] = await Promise.all([
                getTerceros(selectedObra.id),
                getFrentes(selectedObra.id)
            ]);

            setTerceros(tercerosData);
            const casa = tercerosData.find(t => t.nombre_completo.toUpperCase() === 'CASA');
            if (casa) setSelectedTercero(casa.id);

            // Encargados
            const { data: usersData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'produccion')
                .order('nombre');
            setEncargados(usersData as UserProfile[] || []);

            // Bloques
            const bloquesPromises = frentesData.map(f => getBloques(f.id));
            const bloquesResponses = await Promise.all(bloquesPromises);
            const allBloques = bloquesResponses.flat();
            const uniqueBloques = Array.from(new Map(allBloques.map(b => [b.nombre_bloque, b])).values());
            uniqueBloques.sort((a, b) => a.nombre_bloque.localeCompare(b.nombre_bloque, undefined, { numeric: true, sensitivity: 'base' }));
            setBloques(uniqueBloques);

        } catch (err) {
            console.error("Error loading maestros:", err);
        }
    };

    const loadData = async () => {
        if (!selectedObra) return;
        const [stockData, movsData] = await Promise.all([
            getInventario(selectedObra.id),
            supabase
                .from('movimientos_almacen')
                .select(`
                    *,
                    material:materiales(descripcion, unidad, frente:frentes(nombre_frente), categoria),
                    equipo:equipos(nombre, marca, codigo),
                    epp:epps_c(descripcion, codigo, unidad),
                    tercero:terceros(nombre_completo),
                    encargado:profiles(nombre),
                    bloque:bloques(nombre_bloque)
                `)
                .eq('obra_id', selectedObra.id)
                .eq('tipo', 'SALIDA')
                .order('fecha', { ascending: false })
                .limit(50)
        ]);

        // Filter stock > 0
        setInventario(stockData?.filter(i => i.cantidad_actual > 0) || []);

        if (movsData.data) {
            setHistorial(movsData.data as any[]);
        }
    };

    const handleAddItem = () => {
        if (!selectedInventarioId) return alert("Seleccione un ítem");
        if (cantidadSalida <= 0) return alert("Cantidad debe ser mayor a 0");

        const invRecord = inventario.find(i => i.id === selectedInventarioId);
        if (!invRecord) return;

        let itemId = '';
        let itemName = '';
        let itemUnit = '';

        if (tipoItem === 'MATERIAL' && invRecord.material) {
            itemId = invRecord.material_id!;
            itemName = invRecord.material.descripcion;
            itemUnit = invRecord.material.unidad;
        } else if (tipoItem === 'EQUIPO' && invRecord.equipo) {
            itemId = invRecord.equipo_id!;
            itemName = `${invRecord.equipo.nombre} [${invRecord.equipo.codigo}]`;
            itemUnit = 'UND';
        } else if (tipoItem === 'EPP' && invRecord.epp) {
            itemId = invRecord.epp_id!;
            itemName = `${invRecord.epp.descripcion} [${invRecord.epp.codigo}]`;
            itemUnit = invRecord.epp.unidad;
        } else {
            return alert("Error en datos del ítem seleccionado");
        }

        if (cantidadSalida > invRecord.cantidad_actual) return alert("No hay suficiente stock");

        // Check if already added
        const existing = itemsToAdd.find(i => i.invId === invRecord.id);
        if (existing) {
            if (existing.cantidad + cantidadSalida > invRecord.cantidad_actual) {
                return alert("La suma supera el stock disponible");
            }
            setItemsToAdd(itemsToAdd.map(i =>
                i.invId === invRecord.id ? { ...i, cantidad: i.cantidad + cantidadSalida } : i
            ));
        } else {
            setItemsToAdd([...itemsToAdd, {
                tipo: tipoItem,
                id: itemId,
                nombre: itemName,
                unidad: itemUnit,
                cantidad: cantidadSalida,
                maxStock: invRecord.cantidad_actual,
                invId: invRecord.id
            }]);
        }

        setCantidadSalida(0);
        setSelectedInventarioId('');
    };

    const handleRemoveItem = (invId: string) => {
        setItemsToAdd(itemsToAdd.filter(i => i.invId !== invId));
    };

    const handleRegister = async () => {
        if (itemsToAdd.length === 0) return alert("Agregue al menos un ítem");
        if (!selectedTercero) return alert("Seleccione un Tercero (o CASA)");
        if (!selectedEncargado) return alert("Seleccione un Encargado");
        if (!selectedBloque) return alert("Seleccione un Bloque");
        if (!numeroVale.trim()) return alert("Ingrese el Número de Vale");
        if (!solicitante.trim()) return alert("Ingrese el nombre del solicitante");
        if (!destino.trim()) return alert("Ingrese Destino/Uso");

        setLoading(true);
        try {
            await Promise.all(itemsToAdd.map(item =>
                registrarSalida(
                    item.tipo,
                    item.id,
                    item.cantidad,
                    destino,
                    solicitante,
                    selectedObra!.id,
                    {
                        terceroId: selectedTercero,
                        encargadoId: selectedEncargado,
                        bloqueId: selectedBloque,
                        numeroVale: numeroVale
                    }
                )
            ));

            setSuccessMsg("Salida registrada correctamente");
            setItemsToAdd([]);
            setSolicitante('');
            setDestino('');
            setCantidadSalida(0);
            setSelectedInventarioId('');
            loadData();
        } catch (error: any) {
            console.error(error);
            alert("Error al registrar salida: " + (error.message || "Error desconocido"));
        }
        setLoading(false);
    };

    // Filter available options for dropdowns based on type and stock
    const availableOptions = inventario.filter(i => {
        if (tipoItem === 'MATERIAL') return i.material_id !== null;
        if (tipoItem === 'EQUIPO') return i.equipo_id !== null;
        if (tipoItem === 'EPP') return i.epp_id !== null;
        return false;
    });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Registrar Salida de Almacén</h2>
            </div>
            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Card className="custom-card mb-4">
                <Card.Header className="bg-white fw-bold">1. Datos Generales de la Salida</Card.Header>
                <Card.Body>
                    <Row className="g-3">
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Tercero (Asignado a) <span className="text-danger">*</span></Form.Label>
                                <Form.Select value={selectedTercero} onChange={e => setSelectedTercero(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre_completo}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Encargado (Producción) <span className="text-danger">*</span></Form.Label>
                                <Form.Select value={selectedEncargado} onChange={e => setSelectedEncargado(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {encargados.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Bloque <span className="text-danger">*</span></Form.Label>
                                <Form.Select value={selectedBloque} onChange={e => setSelectedBloque(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {bloques.map(b => <option key={b.id} value={b.id}>{b.nombre_bloque}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Número de Vale <span className="text-danger">*</span></Form.Label>
                                <Form.Control value={numeroVale} onChange={e => setNumeroVale(e.target.value)} placeholder="Ej. VALE-001" />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Solicitado Por (Nombre) <span className="text-danger">*</span></Form.Label>
                                <Form.Control value={solicitante} onChange={e => setSolicitante(e.target.value)} placeholder="Nombre del personal" />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Destino / Uso <span className="text-danger">*</span></Form.Label>
                                <Form.Control value={destino} onChange={e => setDestino(e.target.value)} placeholder="Ej. Torre A - Losa 2" />
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card mb-4">
                <Card.Header className="bg-white fw-bold">2. Agregar Ítems</Card.Header>
                <Card.Body>
                    <Row className="align-items-end g-3">
                        <Col xs={12} md={2}>
                            <Form.Group>
                                <Form.Label>Tipo</Form.Label>
                                <Form.Select value={tipoItem} onChange={(e: any) => setTipoItem(e.target.value)}>
                                    <option value="MATERIAL">Material</option>
                                    <option value="EQUIPO">Equipo</option>
                                    <option value="EPP">EPP</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                            <Form.Group>
                                <Form.Label>Ítem Disponible (Stock &gt; 0)</Form.Label>
                                <Form.Select value={selectedInventarioId} onChange={e => setSelectedInventarioId(e.target.value)}>
                                    <option value="">Seleccione...</option>
                                    {availableOptions.map(i => {
                                        let label = '';
                                        if (i.material) label = `${i.material.descripcion} (${i.material.unidad})`;
                                        else if (i.equipo) label = `${i.equipo.nombre} [${i.equipo.codigo}]`;
                                        else if (i.epp) label = `${i.epp.descripcion} [${i.epp.codigo}]`;
                                        return <option key={i.id} value={i.id}>{label} - Stock: {i.cantidad_actual}</option>;
                                    })}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={2}>
                            <Form.Group>
                                <Form.Label>Cantidad</Form.Label>
                                <Form.Control type="number" value={cantidadSalida} onChange={e => setCantidadSalida(parseFloat(e.target.value))} min={0} />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                            <Button variant="outline-primary" className="w-100" onClick={handleAddItem} disabled={!selectedInventarioId || cantidadSalida <= 0}>
                                + Agregar
                            </Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {itemsToAdd.length > 0 && (
                <Card className="custom-card mb-4 border-primary">
                    <Card.Header className="bg-primary text-white fw-bold">Lista de Salida</Card.Header>
                    <Table hover responsive className="mb-0">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Ítem</th>
                                <th>Cantidad</th>
                                <th>Unidad</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToAdd.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.tipo}</td>
                                    <td>{item.nombre}</td>
                                    <td className="fw-bold">{item.cantidad}</td>
                                    <td>{item.unidad}</td>
                                    <td><Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(item.invId)}>Quitar</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                    <Card.Footer className="text-end bg-white">
                        <Button variant="danger" size="lg" onClick={handleRegister} disabled={loading}>
                            {loading ? 'Registrando...' : 'Confirmar Salida'}
                        </Button>
                    </Card.Footer>
                </Card>
            )}

            <h4 className="mb-4 text-secondary mt-5">Historial Reciente</h4>
            <Card className="custom-card p-0 overflow-hidden">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Vale</th>
                            <th>Solicitante</th>
                            <th>Bien / Material</th>
                            <th>Cantidad</th>
                            <th>Destino</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map(h => {
                            let desc = '';
                            let unit = '';
                            if (h.material) { desc = h.material.descripcion; unit = h.material.unidad; }
                            else if ((h as any).equipo) { desc = (h as any).equipo.nombre; unit = 'UND'; }
                            else if ((h as any).epp) { desc = (h as any).epp.descripcion; unit = (h as any).epp.unidad; }

                            return (
                                <tr key={h.id}>
                                    <td>{h.fecha ? new Date(h.fecha).toLocaleDateString() : '-'}</td>
                                    <td>{h.numero_vale}</td>
                                    <td>{h.solicitante}</td>
                                    <td>{desc}</td>
                                    <td className="fw-bold text-danger">-{h.cantidad} {unit}</td>
                                    <td>{h.destino_o_uso}</td>
                                </tr>
                            );
                        })}
                        {historial.length === 0 && <tr><td colSpan={6} className="text-center text-muted">No hay salidas registradas.</td></tr>}
                    </tbody>
                </Table>
            </Card>
        </div>
    );
};

export default SalidasAlmacen;
