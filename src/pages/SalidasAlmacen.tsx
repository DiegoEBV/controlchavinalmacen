import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario, registrarSalida, getMovimientos } from '../services/almacenService';
import { getTerceros } from '../services/tercerosService';
import { getFrentes, getBloques } from '../services/frentesService';
import { getEquipos } from '../services/equiposService';
import { getEpps } from '../services/eppsService';
import { Inventario, MovimientoAlmacen, Tercero, Bloque, UserProfile, Equipo, EppC } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const SalidasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [inventario, setInventario] = useState<Inventario[]>([]);

    // Estado del Encabezado del Formulario
    const [solicitante, setSolicitante] = useState('');
    const [destino, setDestino] = useState('');
    const [selectedTercero, setSelectedTercero] = useState<string>('');
    const [selectedEncargado, setSelectedEncargado] = useState<string>('');
    const [selectedBloque, setSelectedBloque] = useState<string>('');
    const [numeroVale, setNumeroVale] = useState('');

    // Datos maestros
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [encargados, setEncargados] = useState<UserProfile[]>([]);
    const [bloques, setBloques] = useState<Bloque[]>([]);
    // const [frentes, setFrentes] = useState<Frente[]>([]); // Para uso futuro si se requiere filtrar bloques por frente

    // Estado de Adición de Ítems
    const [tipoItem, setTipoItem] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedItem, setSelectedItem] = useState<Inventario | Equipo | EppC | null>(null);
    const [cantidadSalida, setCantidadSalida] = useState(0);

    // Listas para selección según tipo
    const [listaEquipos, setListaEquipos] = useState<Equipo[]>([]);
    const [listaEpps, setListaEpps] = useState<EppC[]>([]);

    // Lista de Ítems a Retirar
    interface SalidaItem {
        tipo: 'MATERIAL' | 'EQUIPO' | 'EPP';
        id: string; // ID del material/equipo/epp
        nombre: string;
        unidad: string;
        cantidad: number;
        maxStock: number;
    }
    const [itemsToAdd, setItemsToAdd] = useState<SalidaItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // Estado del Historial
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Inventario (Actualizaciones de Stock)
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: updatedStock } = await supabase
                .from('inventario_obra')
                .select('*, material:materiales(*)')
                .in('id', Array.from(upserts));

            if (updatedStock) {
                // Actualizar lista genérica
                setInventario(prev => mergeUpdates(prev, updatedStock as Inventario[], new Set()));

                // Actualizar ítem seleccionado si fue modificado
                const currentSelectedId = selectedItem?.id;
                // Verificamos si es tipo Material antes de actualizar
                if (currentSelectedId && tipoItem === 'MATERIAL') {
                    const match = updatedStock.find(i => i.id === currentSelectedId);
                    if (match) setSelectedItem(match as Inventario);
                }
            }
        }
    }, { table: 'inventario_obra', event: 'UPDATE', throttleMs: 1000 });

    // 2. Movimientos (Salidas)
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: newMoves } = await supabase
                .from('movimientos_almacen')
                .select(`
                    *,
                    tercero:terceros(nombre_completo),
                    encargado:profiles(nombre),
                    bloque:bloques(nombre_bloque)
                `)
                .in('id', Array.from(upserts))
                .eq('tipo', 'SALIDA');

            if (newMoves && newMoves.length > 0) {
                // Obtener detalles para visualización (uniones de material) si es necesario (Pending: Handle Equipos/EPP display in history)
                // Por simplicidad, recargamos el historial completo o manejamos la actualización parcial si tenemos el mapper.
                // Dado que el historial ahora es complejo (Material|Equipo|EPP), lo mejor por ahora es refrescar
                // o intentar obtener el movimiento completo.
                // Como getMovimientoById puede traer todo, intentemos eso.
                // Pero getMovimientoById necesita ser actualizado en el servicio para traer Equipos y EPPs también.
                // Por ahora, recargaremos datos.
                loadData();
            }
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

    // Limpiar selección al cambiar tipo
    useEffect(() => {
        setSelectedItem(null);
        setCantidadSalida(0);
    }, [tipoItem]);

    const loadMaestros = async () => {
        if (!selectedObra) return;

        try {
            // 1. Terceros
            const tercerosData = await getTerceros(selectedObra.id);
            setTerceros(tercerosData);
            // Seleccionar CASA por defecto
            const casa = tercerosData.find(t => t.nombre_completo.toUpperCase() === 'CASA');
            if (casa) setSelectedTercero(casa.id);

            // 2. Encargados (Usuarios de Produccion)
            // Nota: supabase.from('profiles') lo hacemos directo aquí o en un servicio de usuarios si existe.
            // Asumimos acceso a profiles. Filtramos por rol 'produccion'.
            const { data: usersData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'produccion')
                .order('nombre');
            setEncargados(usersData as UserProfile[] || []);

            // 3. Frentes y Bloques
            // Nota: Bloques dependen de Frentes, aqui traemos todos los bloques de la obra indirectamente
            // Una mejor aproximación es traer todos los frentes y luego todos los bloques de esos frentes.
            const frentesData = await getFrentes(selectedObra.id);
            // setFrentes(frentesData);

            // Traer todos los bloques de los frentes (Promise.all)
            const bloquesPromises = frentesData.map(f => getBloques(f.id));
            const bloquesResponses = await Promise.all(bloquesPromises);
            const allBloques = bloquesResponses.flat();
            // Filtrar duplicados por nombre si es lo que se pide, o mostrar todos con su frente.
            // El requerimiento dice: "lista desplegable de los bloques que hay (mostrar todos los bloques que hay sin duplicarlos)"
            // Usaremos un Map para unificar por nombre
            const uniqueBloques = Array.from(new Map(allBloques.map(b => [b.nombre_bloque, b])).values());

            // Ordenar alfanuméricamente (ej. Bloque 1, Bloque 2, Bloque 10...)
            uniqueBloques.sort((a, b) => a.nombre_bloque.localeCompare(b.nombre_bloque, undefined, { numeric: true, sensitivity: 'base' }));

            setBloques(uniqueBloques);

            // 4. Cargar Equipos y EPPs para las listas
            const [equiposData, eppsData] = await Promise.all([
                getEquipos(selectedObra.id),
                getEpps(false) // Solo activos
            ]);
            setListaEquipos(equiposData);
            setListaEpps(eppsData);

        } catch (err) {
            console.error("Error cargando maestros:", err);
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
                    tercero:terceros(nombre_completo),
                    encargado:profiles(nombre),
                    bloque:bloques(nombre_bloque)
                `)
                .eq('obra_id', selectedObra.id)
                .eq('tipo', 'SALIDA')
                .order('fecha', { ascending: false })
        ]);

        // Filtrar stock > 0
        setInventario(stockData?.filter(i => i.cantidad_actual > 0) || []);

        // Filtrar movimientos válidos (SALIDA)
        if (movsData.data) {
            setHistorial(movsData.data as any[]);
        }
    };

    const handleAddItem = () => {
        if (!selectedItem) return alert("Seleccione un ítem");
        if (cantidadSalida <= 0) return alert("Cantidad debe ser mayor a 0");

        let currentStock = 0;
        let itemName = '';
        let itemUnit = '';
        let itemId = '';

        if (tipoItem === 'MATERIAL') {
            const item = selectedItem as Inventario;
            currentStock = item.cantidad_actual;
            itemName = item.material?.descripcion || '';
            itemUnit = item.material?.unidad || '';
            itemId = item.material_id; // Ojo: Usamos el ID del material, no del inventario, para el registro
        } else if (tipoItem === 'EQUIPO') {
            const item = selectedItem as Equipo;
            currentStock = item.cantidad;
            itemName = item.nombre;
            itemUnit = 'und'; // Equipos suelen ser unidades
            itemId = item.id;
        } else { // EPP
            const item = selectedItem as EppC;
            currentStock = item.stock_actual;
            itemName = item.descripcion;
            itemUnit = item.unidad;
            itemId = item.id;
        }

        if (cantidadSalida > currentStock) return alert("No hay suficiente stock");

        // Verificar si ya fue agregado
        const existing = itemsToAdd.find(i => i.id === itemId && i.tipo === tipoItem);
        if (existing) {
            if (existing.cantidad + cantidadSalida > currentStock) {
                return alert("La suma de cantidades supera el stock disponible");
            }
            // Actualizar existente
            setItemsToAdd(itemsToAdd.map(i =>
                (i.id === itemId && i.tipo === tipoItem)
                    ? { ...i, cantidad: i.cantidad + cantidadSalida }
                    : i
            ));
        } else {
            // Agregar nuevo
            setItemsToAdd([...itemsToAdd, {
                tipo: tipoItem,
                id: itemId,
                nombre: itemName,
                unidad: itemUnit,
                cantidad: cantidadSalida,
                maxStock: currentStock
            }]);
        }

        // Reiniciar entrada de ítem
        setCantidadSalida(0);
        setSelectedItem(null);
    };

    const handleRemoveItem = (id: string, tipo: string) => {
        setItemsToAdd(itemsToAdd.filter(i => !(i.id === id && i.tipo === tipo)));
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
            // Procesar todos los ítems
            // Usando bucle for...of para manejar operaciones asíncronas secuencialmente o Promise.all
            // Secuencial es más seguro para verificaciones de stock si es concurrente, pero paralelo es más rápido.
            // Dados las verificaciones del frontend, haremos paralelo por velocidad a menos que los bloqueos de BD sean un problema.
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

            // Resumen del Reporte (Opcional, quizás solo limpiar formulario)
            setItemsToAdd([]);
            setSolicitante('');
            setDestino('');
            setCantidadSalida(0);
            setSelectedItem(null);

            loadData(); // Recargar stock e historial
        } catch (error: any) {
            console.error(error);
            alert("Error al registrar salida: " + (error.message || "Error desconocido"));
        }
        setLoading(false);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Registrar Salida de Material</h2>
            </div>
            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Card className="custom-card mb-4">
                <Card.Header className="bg-white fw-bold">1. Datos Generales de la Salida</Card.Header>
                <Card.Body>
                    <Row className="g-3">
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Tercero (Asignado a) <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    value={selectedTercero}
                                    onChange={e => setSelectedTercero(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {terceros.map(t => (
                                        <option key={t.id} value={t.id}>{t.nombre_completo}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Encargado (Producción) <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    value={selectedEncargado}
                                    onChange={e => setSelectedEncargado(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {encargados.map(u => (
                                        <option key={u.id} value={u.id}>{u.nombre}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Bloque <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    value={selectedBloque}
                                    onChange={e => setSelectedBloque(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {bloques.map(b => (
                                        <option key={b.id} value={b.id}>{b.nombre_bloque}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Número de Vale <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    value={numeroVale}
                                    onChange={e => setNumeroVale(e.target.value)}
                                    placeholder="Ej. VALE-001"
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Solicitado Por (Nombre) <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    value={solicitante}
                                    onChange={e => setSolicitante(e.target.value)}
                                    placeholder="Nombre del personal que retira"
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Destino / Uso <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    value={destino}
                                    onChange={e => setDestino(e.target.value)}
                                    placeholder="Ej. Torre A - Losa 2"
                                />
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="custom-card mb-4">
                <Card.Header className="bg-white fw-bold">2. Agregar Materiales</Card.Header>
                <Card.Body>
                    <Row className="align-items-end g-3">
                        <Col xs={12} md={2}>
                            <Form.Group>
                                <Form.Label>Tipo</Form.Label>
                                <Form.Select
                                    value={tipoItem}
                                    onChange={(e: any) => setTipoItem(e.target.value)}
                                >
                                    <option value="MATERIAL">Material</option>
                                    <option value="EQUIPO">Equipo</option>
                                    <option value="EPP">EPP</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Ítem Disponible</Form.Label>
                                <Form.Select
                                    value={selectedItem?.id || ''}
                                    onChange={e => {
                                        const id = e.target.value;
                                        if (tipoItem === 'MATERIAL') {
                                            setSelectedItem(inventario.find(i => i.id === id) || null);
                                        } else if (tipoItem === 'EQUIPO') {
                                            setSelectedItem(listaEquipos.find(i => i.id === id) || null);
                                        } else {
                                            setSelectedItem(listaEpps.find(i => i.id === id) || null);
                                        }
                                    }}
                                >
                                    <option value="">Seleccione...</option>
                                    {tipoItem === 'MATERIAL' && inventario.map(i => (
                                        <option key={i.id} value={i.id}>
                                            {i.material?.descripcion} - Stock: {i.cantidad_actual}
                                        </option>
                                    ))}
                                    {tipoItem === 'EQUIPO' && listaEquipos.map(e => (
                                        <option key={e.id} value={e.id}>
                                            {e.nombre} - Disp: {e.cantidad}
                                        </option>
                                    ))}
                                    {tipoItem === 'EPP' && listaEpps.map(e => (
                                        <option key={e.id} value={e.id}>
                                            {e.descripcion} - Stock: {e.stock_actual}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={3}>
                            <Form.Group>
                                <Form.Label>Cantidad</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={cantidadSalida}
                                    onChange={e => setCantidadSalida(parseFloat(e.target.value))}
                                    min={0}
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                            <Button
                                variant="outline-primary"
                                className="w-100"
                                onClick={handleAddItem}
                                disabled={!selectedItem || cantidadSalida <= 0}
                            >
                                + Agregar a la Lista
                            </Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* Lista de Ítems para Registrar */}
            {
                itemsToAdd.length > 0 && (
                    <Card className="custom-card mb-4 border-primary">
                        <Card.Header className="bg-primary text-white fw-bold">Lista de Salida (Por confirmar)</Card.Header>
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
                                        <td>
                                            <Button
                                                variant="outline-danger"
                                                size="sm"
                                                onClick={() => handleRemoveItem(item.id, item.tipo)}
                                            >
                                                Quitar
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <Card.Footer className="text-end bg-white">
                            <Button
                                variant="danger"
                                size="lg"
                                onClick={handleRegister}
                                disabled={loading}
                            >
                                {loading ? 'Registrando...' : 'Confirmar Salida Completa'}
                            </Button>
                        </Card.Footer>
                    </Card>
                )
            }

            <h4 className="mb-4 text-secondary mt-5">Historial General de Salidas</h4>
            <Card className="custom-card p-0 overflow-hidden">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>N° Vale</th>
                            <th>Solicitante</th>
                            <th>Encargado</th>
                            <th>Bloque</th>
                            <th>Tercero</th>
                            <th>Material</th>
                            <th>Cantidad</th>
                            <th>Destino / Uso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map(h => (
                            <tr key={h.id}>
                                <td>{h.fecha ? new Date(h.fecha).toLocaleDateString() : '-'}</td>
                                <td className="fw-bold">{h.numero_vale || '-'}</td>
                                <td className="text-primary">{h.solicitante || '-'}</td>
                                <td>{(h as any).encargado?.nombre || '-'}</td>
                                <td>{(h as any).bloque?.nombre_bloque || '-'}</td>
                                <td>{(h as any).tercero?.nombre_completo || '-'}</td>
                                <td>
                                    <div>{(h as any).material?.descripcion}</div>
                                    <small className="text-muted">{(h as any).material?.frente?.nombre_frente || (h as any).material?.categoria}</small>
                                </td>
                                <td className="fw-bold text-danger">-{h.cantidad} {(h as any).material?.unidad}</td>
                                <td>{h.destino_o_uso}</td>
                            </tr>
                        ))}
                        {historial.length === 0 && (
                            <tr><td colSpan={5} className="text-center text-muted">No hay salidas registradas</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card>
        </div >
    );
};

export default SalidasAlmacen;
