import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario, registrarSalida, getMovimientos, getMovimientoById } from '../services/almacenService';
import { Inventario, MovimientoAlmacen } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const SalidasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [inventario, setInventario] = useState<Inventario[]>([]);

    // Estado del Encabezado del Formulario
    const [solicitante, setSolicitante] = useState('');
    const [destino, setDestino] = useState('');

    // Estado de Adición de Ítems
    const [selectedItem, setSelectedItem] = useState<Inventario | null>(null);
    const [cantidadSalida, setCantidadSalida] = useState(0);

    // Lista de Ítems a Retirar
    interface SalidaItem {
        materialId: string;
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
                if (currentSelectedId) {
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
                .select('*')
                .in('id', Array.from(upserts))
                .eq('tipo', 'SALIDA');

            if (newMoves && newMoves.length > 0) {
                // Obtener detalles para visualización (uniones de material) si es necesario, 
                // pero por ahora podríamos confiar en los datos básicos o manejarlo mejor.
                // La tabla de historial necesita información del material. 
                // Una solución rápida es obtener ítems individuales o confiar en que podemos mapear desde la lista de inventario/material existente.
                // Para robustez, obtengamos movimientos completos con material
                const fullMoves = await Promise.all(newMoves.map(m => getMovimientoById(m.id)));
                const validMoves = fullMoves.filter(m => m !== null) as MovimientoAlmacen[];

                setHistorial(prev => mergeUpdates(prev, validMoves, new Set()));
            }
        }
    }, { table: 'movimientos_almacen', event: 'INSERT', throttleMs: 2000 });


    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setInventario([]);
            setHistorial([]);
        }
    }, [selectedObra]);

    const loadData = async () => {
        if (!selectedObra) return;
        const [stockData, movsData] = await Promise.all([
            getInventario(selectedObra.id),
            getMovimientos(selectedObra.id)
        ]);

        // Filtrar stock > 0
        setInventario(stockData?.filter(i => i.cantidad_actual > 0) || []);

        // Filtrar movimientos válidos (SALIDA)
        if (movsData) {
            const salidas = movsData.filter((m: any) => m.tipo === 'SALIDA');
            setHistorial(salidas);
        }
    };

    const handleAddItem = () => {
        if (!selectedItem) return alert("Seleccione un material");
        if (cantidadSalida <= 0) return alert("Cantidad debe ser mayor a 0");
        if (cantidadSalida > selectedItem.cantidad_actual) return alert("No hay suficiente stock");

        // Verificar si ya fue agregado
        const existing = itemsToAdd.find(i => i.materialId === selectedItem.material_id);
        if (existing) {
            if (existing.cantidad + cantidadSalida > selectedItem.cantidad_actual) {
                return alert("La suma de cantidades supera el stock disponible");
            }
            // Actualizar existente
            setItemsToAdd(itemsToAdd.map(i =>
                i.materialId === selectedItem.material_id
                    ? { ...i, cantidad: i.cantidad + cantidadSalida }
                    : i
            ));
        } else {
            // Agregar nuevo
            setItemsToAdd([...itemsToAdd, {
                materialId: selectedItem.material_id,
                nombre: selectedItem.material?.descripcion || 'Desconocido',
                unidad: selectedItem.material?.unidad || 'und',
                cantidad: cantidadSalida,
                maxStock: selectedItem.cantidad_actual
            }]);
        }

        // Reiniciar entrada de ítem
        setCantidadSalida(0);
        setSelectedItem(null);
    };

    const handleRemoveItem = (materialId: string) => {
        setItemsToAdd(itemsToAdd.filter(i => i.materialId !== materialId));
    };

    const handleRegister = async () => {
        if (itemsToAdd.length === 0) return alert("Agregue al menos un material");
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
                    item.materialId,
                    item.cantidad,
                    destino,
                    solicitante,
                    selectedObra!.id
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
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Solicitado Por <span className="text-danger">*</span></Form.Label>
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
                        <Col xs={12} md={5}>
                            <Form.Group>
                                <Form.Label>Material (Stock Disponible)</Form.Label>
                                <Form.Select
                                    value={selectedItem?.id || ''}
                                    onChange={e => {
                                        const item = inventario.find(i => i.id === e.target.value);
                                        setSelectedItem(item || null);
                                    }}
                                >
                                    <option value="">Seleccione...</option>
                                    {inventario.map(i => (
                                        <option key={i.id} value={i.id}>
                                            [{i.material?.frente?.nombre_frente || 'S/F'}] {i.material?.descripcion} ({i.material?.unidad}) - Stock: {i.cantidad_actual}
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
                                    <th>Material</th>
                                    <th>Cantidad</th>
                                    <th>Unidad</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsToAdd.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.nombre}</td>
                                        <td className="fw-bold">{item.cantidad}</td>
                                        <td>{item.unidad}</td>
                                        <td>
                                            <Button
                                                variant="outline-danger"
                                                size="sm"
                                                onClick={() => handleRemoveItem(item.materialId)}
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
                            <th>Solicitante</th>
                            <th>Material</th>
                            <th>Cantidad</th>
                            <th>Destino / Uso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map(h => (
                            <tr key={h.id}>
                                <td>{h.fecha ? new Date(h.fecha).toLocaleDateString() : '-'}</td>
                                <td className="fw-bold text-primary">{h.solicitante || '-'}</td>
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
