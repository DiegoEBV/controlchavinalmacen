import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table, Spinner, Badge } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { registrarSalida, getMovimientos, getAllInventario } from '../services/almacenService';
import { getTerceros } from '../services/tercerosService';
import { getFrentes, getBloques } from '../services/frentesService';
import { Inventario, MovimientoAlmacen, Tercero, Bloque, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';
import PaginationControls from '../components/PaginationControls';

const SalidasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [inventario, setInventario] = useState<Inventario[]>([]);

    // Estado de la Cabecera del Formulario
    const [solicitante, setSolicitante] = useState('');
    const [destino, setDestino] = useState('');
    const [selectedTercero, setSelectedTercero] = useState<string>('');
    const [selectedEncargado, setSelectedEncargado] = useState<string>('');
    const [selectedBloque, setSelectedBloque] = useState<string>('');
    const [numeroVale, setNumeroVale] = useState('');

    // Maestros
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [encargados, setEncargados] = useState<UserProfile[]>([]);
    const [bloques, setBloques] = useState<Bloque[]>([]);

    // Estado de Adición de Ítems
    const [tipoItem, setTipoItem] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedInventarioId, setSelectedInventarioId] = useState<string>('');
    const [cantidadSalida, setCantidadSalida] = useState(0);

    // Lista de Ítems para Retirar
    interface SalidaItem {
        tipo: 'MATERIAL' | 'EQUIPO' | 'EPP';
        id: string;
        nombre: string;
        unidad: string;
        cantidad: number;
        maxStock: number;
        invId: string;
    }
    const [itemsToAdd, setItemsToAdd] = useState<SalidaItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // History Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageSize = 20;

    // History State
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('todo');

    const loadData = async () => {
        if (!selectedObra) return;
        try {
            const [inventarioData, movesData] = await Promise.all([
                getAllInventario(selectedObra.id),
                getMovimientos(selectedObra.id, currentPage, pageSize, searchTerm, 'SALIDA')
            ]);

            const stock = inventarioData || [];
            setInventario(stock.filter(i => i.cantidad_actual > 0) || []);

            setHistorial(movesData.data as MovimientoAlmacen[]);
            setTotalItems(movesData.count);
        } catch (err) {
            console.error("Error loading data:", err);
        }
    };

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

            const { data: usersData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'produccion')
                .order('nombre');
            setEncargados(usersData as UserProfile[] || []);

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

    // --- Suscripciones en Tiempo Real ---
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: updatedStock } = await supabase
                .from('inventario_obra')
                .select(`*, material:materiales(*), equipo:equipos(*), epp:epps_c(*)`)
                .in('id', Array.from(upserts));
            if (updatedStock) {
                setInventario(prev => mergeUpdates(prev, updatedStock as Inventario[], new Set()));
            }
        }
    }, { table: 'inventario_obra', event: 'UPDATE', throttleMs: 1000 });

    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            loadData();
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
    }, [selectedObra, currentPage, searchTerm]);

    useEffect(() => {
        setSelectedInventarioId('');
        setCantidadSalida(0);
    }, [tipoItem]);

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

            setSuccessMsg(`Salida registrada correctamente: ${itemsToAdd.length} ítems retirados.`);
            setItemsToAdd([]);
            setNumeroVale('');
            setDestino('');
            loadData();
            setTimeout(() => setSuccessMsg(''), 5000);
        } catch (err: any) {
            console.error(err);
            alert("Error al registrar salida: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header mb-4">
                <h2>Registrar Salida de Almacén</h2>
                <p className="text-muted">Retiro de materiales, equipos o EPPs para frentes de trabajo.</p>
            </div>

            {successMsg && <Alert variant="success" dismissible onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

            <Card className="custom-card mb-4">
                <Card.Header className="bg-transparent py-3">
                    <h5 className="mb-0 text-primary fw-bold">Cabecera de Vale</h5>
                </Card.Header>
                <Card.Body>
                    <Row>
                        <Col md={3}>
                            <Form.Group className="mb-3">
                                <Form.Label>Número de Vale <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Ej. V-001"
                                    value={numeroVale}
                                    onChange={(e) => setNumeroVale(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group className="mb-3">
                                <Form.Label>Tercero / Empresa</Form.Label>
                                <Form.Select
                                    value={selectedTercero}
                                    onChange={(e) => setSelectedTercero(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {terceros.map(t => (
                                        <option key={t.id} value={t.id}>{t.nombre_completo}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group className="mb-3">
                                <Form.Label>Encargado Responsable <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    value={selectedEncargado}
                                    onChange={(e) => setSelectedEncargado(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {encargados.map(u => (
                                        <option key={u.id} value={u.id}>{u.nombre}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group className="mb-3">
                                <Form.Label>Bloque / Frente <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    value={selectedBloque}
                                    onChange={(e) => setSelectedBloque(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {bloques.map(b => (
                                        <option key={b.id} value={b.id}>{b.nombre_bloque}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                    </Row>
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Solicitante (Nombre) <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Nombre de quien retira"
                                    value={solicitante}
                                    onChange={(e) => setSolicitante(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Destino u Uso <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Ej. Vaciado de zapata eje A-1"
                                    value={destino}
                                    onChange={(e) => setDestino(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Row>
                <Col md={4}>
                    <Card className="custom-card mb-4">
                        <Card.Header className="bg-transparent py-3">
                            <h5 className="mb-0 text-primary fw-bold">Agregar Bien</h5>
                        </Card.Header>
                        <Card.Body>
                            <Form.Group className="mb-3">
                                <Form.Label>Tipo de Item</Form.Label>
                                <div className="d-flex gap-2">
                                    <Button
                                        variant={tipoItem === 'MATERIAL' ? 'primary' : 'outline-primary'}
                                        size="sm"
                                        onClick={() => setTipoItem('MATERIAL')}
                                    >Materiales</Button>
                                    <Button
                                        variant={tipoItem === 'EQUIPO' ? 'primary' : 'outline-primary'}
                                        size="sm"
                                        onClick={() => setTipoItem('EQUIPO')}
                                    >Equipos</Button>
                                    <Button
                                        variant={tipoItem === 'EPP' ? 'primary' : 'outline-primary'}
                                        size="sm"
                                        onClick={() => setTipoItem('EPP')}
                                    >EPPs</Button>
                                </div>
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Seleccionar Bien con Stock</Form.Label>
                                <Form.Select
                                    value={selectedInventarioId}
                                    onChange={(e) => setSelectedInventarioId(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {inventario
                                        .filter(i => {
                                            if (tipoItem === 'MATERIAL') return !!i.material;
                                            if (tipoItem === 'EQUIPO') return !!i.equipo;
                                            if (tipoItem === 'EPP') return !!i.epp;
                                            return false;
                                        })
                                        .map(i => {
                                            let label = '';
                                            if (i.material) label = `${i.material.descripcion} (${i.cantidad_actual} ${i.material.unidad})`;
                                            else if (i.equipo) label = `${i.equipo.nombre} [${i.equipo.codigo}] (${i.cantidad_actual} UND)`;
                                            else if (i.epp) label = `${i.epp.descripcion} [${i.epp.codigo}] (${i.cantidad_actual} ${i.epp.unidad})`;
                                            return <option key={i.id} value={i.id}>{label}</option>;
                                        })}
                                </Form.Select>
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label>Cantidad a Retirar</Form.Label>
                                <Form.Control
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={cantidadSalida}
                                    onChange={(e) => setCantidadSalida(Number(e.target.value))}
                                />
                            </Form.Group>

                            <Button variant="primary" className="w-100 fw-bold" onClick={handleAddItem}>
                                <i className="bi bi-plus-lg me-2"></i> Agregar a la Lista
                            </Button>
                        </Card.Body>
                    </Card>
                </Col>

                <Col md={8}>
                    <Card className="custom-card mb-4">
                        <Card.Header className="bg-transparent py-3 d-flex justify-content-between align-items-center">
                            <h5 className="mb-0 text-primary fw-bold">Ítems Seleccionados para Retiro</h5>
                            <Badge bg="info">{itemsToAdd.length} ítems</Badge>
                        </Card.Header>
                        <Card.Body className="p-0">
                            <Table hover responsive className="table-borderless-custom mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Descripción / Bien</th>
                                        <th>Cantidad</th>
                                        <th>Unidad</th>
                                        <th className="text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemsToAdd.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="text-center py-4 text-muted">No hay ítems agregados.</td>
                                        </tr>
                                    ) : (
                                        itemsToAdd.map((item, idx) => (
                                            <tr key={idx}>
                                                <td><Badge bg="secondary">{item.tipo}</Badge></td>
                                                <td><strong className="text-dark">{item.nombre}</strong></td>
                                                <td className="fw-bold text-primary">{item.cantidad}</td>
                                                <td>{item.unidad}</td>
                                                <td className="text-center">
                                                    <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(item.invId)}>
                                                        <i className="bi bi-trash"></i>
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                        <Card.Footer className="bg-white py-3 border-top-0">
                            <Button
                                variant="success"
                                className="w-100 py-2 fw-bold"
                                disabled={loading || itemsToAdd.length === 0}
                                onClick={handleRegister}
                            >
                                {loading ? <><Spinner size="sm" className="me-2" /> Registrando...</> : <><i className="bi bi-check2-circle me-2"></i> Procesar Salida y Generar Vale</>}
                            </Button>
                        </Card.Footer>
                    </Card>
                </Col>
            </Row>

            <div className="d-flex justify-content-between align-items-center mt-5 mb-3">
                <h4 className="text-secondary mb-0">Historial Reciente</h4>
            </div>

            <Row className="mb-3">
                <Col xs={12} md={4}>
                    <Form.Group>
                        <Form.Control
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </Form.Group>
                </Col>
                <Col xs={12} md={3}>
                    <Form.Group>
                        <Form.Select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="todo">Todos</option>
                            <option value="solicitante">Solicitante</option>
                            <option value="vale">N° Vale</option>
                            <option value="material">Bien / Material</option>
                            <option value="encargado">Encargado</option>
                            <option value="bloque">Bloque</option>
                            <option value="destino">Destino</option>
                        </Form.Select>
                    </Form.Group>
                </Col>
            </Row>

            <Card className="custom-card p-0 overflow-hidden">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Vale</th>
                            <th>Solicitante</th>
                            <th>Encargado</th>
                            <th>Bloque</th>
                            <th>Bien / Material</th>
                            <th>Cantidad</th>
                            <th>Destino</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center p-4 text-muted">No hay salidas registradas.</td>
                            </tr>
                        ) : (
                            historial.map(h => {
                                const mov = h as any;
                                let desc = 'Desconocido';
                                let unit = '';
                                let cat = '';
                                if (mov.material) {
                                    desc = mov.material.descripcion;
                                    unit = mov.material.unidad;
                                    cat = mov.material.categoria;
                                } else if (mov.equipo) {
                                    desc = mov.equipo.nombre;
                                    unit = 'UND';
                                    cat = 'Equipo';
                                } else if (mov.epp) {
                                    desc = mov.epp.descripcion;
                                    unit = mov.epp.unidad;
                                    cat = 'EPP';
                                }
                                return (
                                    <tr key={h.id}>
                                        <td>{h.fecha ? new Date(h.fecha).toLocaleDateString() : '-'}</td>
                                        <td>{h.numero_vale}</td>
                                        <td>{h.solicitante}</td>
                                        <td>{h.encargado?.nombre || '-'}</td>
                                        <td>{h.bloque?.nombre_bloque || '-'}</td>
                                        <td>
                                            <div>{desc}</div>
                                            <small className="text-muted">{cat}</small>
                                        </td>
                                        <td className="fw-bold text-danger">-{h.cantidad} {unit}</td>
                                        <td>{h.destino_o_uso}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </Table>
                <div className="p-3 border-top">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={Math.max(1, Math.ceil(totalItems / pageSize))}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </Card>
        </div>
    );
};

export default SalidasAlmacen;
