/* /src/pages/GestionOrdenes.tsx */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Table, Badge, Modal, Form, Row, Col } from 'react-bootstrap';

import { getSolicitudesCompra, createOrdenCompra, getOrdenesCompra, getOrdenCompraById, getSolicitudCompraById } from '../services/comprasService';
import { SolicitudCompra, OrdenCompra } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const GestionOrdenes: React.FC = () => {
    const { selectedObra } = useAuth();
    const [allSolicitudes, setAllSolicitudes] = useState<SolicitudCompra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);

    // Estado del Modal
    const [showModal, setShowModal] = useState(false);
    const [selectedSC, setSelectedSC] = useState<SolicitudCompra | null>(null);

    // Entradas del Formulario
    const [proveedor, setProveedor] = useState('');
    const [manualOCNumber, setManualOCNumber] = useState('');
    const [fechaAtencion, setFechaAtencion] = useState('');
    const [itemsToOrder, setItemsToOrder] = useState<any[]>([]);

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllSolicitudes([]);
            setOrdenes([]);
        }
    }, [selectedObra]);

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Órdenes Compra (Actualizaciones o Inserciones)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getOrdenCompraById(id)));
            const validItems = responses.filter(i => i !== null) as OrdenCompra[];
            setOrdenes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setOrdenes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'ordenes_compra', throttleMs: 2000 });

    // 2. Solicitudes Compra (Nuevas SCs o Actualizaciones a existentes)
    useRealtimeSubscription(async ({ upserts, deletes }) => {
        if (upserts.size > 0) {
            const responses = await Promise.all(Array.from(upserts).map(id => getSolicitudCompraById(id)));
            const validItems = responses.filter(i => i !== null) as SolicitudCompra[];
            setAllSolicitudes(prev => mergeUpdates(prev, validItems, deletes));
        } else if (deletes.size > 0) {
            setAllSolicitudes(prev => mergeUpdates(prev, [], deletes));
        }
    }, { table: 'solicitudes_compra', throttleMs: 2000 });

    const loadData = async () => {
        if (!selectedObra) return;
        const [scs, ocs] = await Promise.all([
            getSolicitudesCompra(selectedObra.id),
            getOrdenesCompra(selectedObra.id)
        ]);

        if (scs) setAllSolicitudes(scs);
        if (ocs) setOrdenes(ocs);
    };

    // Estado Derivado: SCs Disponibles
    const availableSolicitudes = useMemo(() => {
        return allSolicitudes.filter(sc => {
            if (!sc.detalles) return false;

            // Verificar si cada ítem en esta SC está totalmente comprado
            const isFullyPurchased = sc.detalles.every(d => {
                // Encontrar todos los detalles de OC que referencian este detalle de SC específico
                const totalPurchased = ordenes.reduce((sum, oc) => {
                    const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                    return sum + (match ? match.cantidad : 0);
                }, 0);

                return totalPurchased >= d.cantidad;
            });

            return !isFullyPurchased;
        });
    }, [allSolicitudes, ordenes]);

    const handleOpenCreate = (sc: SolicitudCompra) => {
        setSelectedSC(sc);
        // Reiniciar
        setManualOCNumber('');
        // Reiniciar
        setProveedor('');
        // Reiniciar
        setFechaAtencion('');
        // Pre-llenar con ítems de la SC
        // Lógica: Permitir seleccionar ítems parciales.
        const initialItems = sc.detalles?.map(d => {
            // Calcular lo que ya se ha comprado en OCs anteriores
            const totalPurchased = ordenes.reduce((sum, oc) => {
                const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                return sum + (match ? match.cantidad : 0);
            }, 0);

            const remaining = Math.max(0, d.cantidad - totalPurchased);

            return {
                detalle_sc_id: d.id,
                material_desc: d.material?.descripcion,
                cantidad_sc: d.cantidad, // Agregar este campo
                cantidad_pendiente: remaining, // Mostrar saldo restante real
                cantidad_compra: remaining, // Usar nomenclatura consistente
                selected: remaining > 0 // Solo seleccionar si hay saldo
            };
        }) || [];
        setItemsToOrder(initialItems);
        setShowModal(true);
    };

    const handleSaveOC = async () => {
        if (!selectedSC || !proveedor || !manualOCNumber) return alert("Ingrese proveedor y número de OC");

        const selectedItems = itemsToOrder.filter(i => i.selected && i.cantidad_compra > 0).map(i => ({
            detalle_sc_id: i.detalle_sc_id,
            cantidad: parseFloat(i.cantidad_compra),
            precio_unitario: 0 // Por defecto a 0 como se solicitó
        }));

        if (selectedItems.length === 0) return alert("Seleccione al menos un item");

        try {
            const ocPayload = {
                sc_id: selectedSC.id,
                numero_oc: manualOCNumber,
                proveedor,
                fecha_oc: new Date().toISOString().split('T')[0],
                fecha_aproximada_atencion: fechaAtencion || undefined,
                estado: 'Emitida' as const
            };

            await createOrdenCompra(ocPayload, selectedItems);
            alert("Orden de Compra creada!");
            setShowModal(false);
            setProveedor('');
            setManualOCNumber('');
            setFechaAtencion('');
            // No es necesario llamar a loadData() si el tiempo real está funcionando, pero es inofensivo mantenerlo o eliminarlo.
            // ¿Mejor eliminar para confiar en el tiempo real? O mantener como respaldo.
            // loadData(); 
            // Confiaremos en el tiempo real + actualización optimista local si es necesario, pero el tiempo real suele ser lo suficientemente rápido.
            // Realmente, para retroalimentación inmediata de nuestra PROPIA acción, tal vez recargar o actualización optimista.
            // El tiempo real también lo capturará.
            loadData(); // Mantener por seguridad
        } catch (e: any) {
            console.error(e);
            alert("Error creando OC: " + e.message);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Gestión de Ordenes de Compra (OC)</h2>
            </div>

            <Row>
                <Col xs={12} className="mb-4">
                    <Card className="custom-card">
                        <Card.Header className="bg-white fw-bold">Solicitudes Disponibles</Card.Header>
                        <Table hover responsive className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>SC #</th>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {availableSolicitudes.map(sc => (
                                    <tr key={sc.id}>
                                        <td>{sc.numero_sc}</td>
                                        <td>{sc.fecha_sc}</td>
                                        <td><Badge bg="info">{sc.estado}</Badge></td>
                                        <td>
                                            <Button size="sm" variant="success" onClick={() => handleOpenCreate(sc)}>Crear OC</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </Card>
                </Col>

                <Col md={12}>
                    <h4 className="text-secondary mt-4">Ordenes Emitidas</h4>
                    <Table hover responsive className="table-borderless-custom mt-2">
                        <thead>
                            <tr>
                                <th>OC #</th>
                                <th>Proveedor</th>
                                <th>SC Ref</th>
                                <th>Estado</th>
                                <th>Fecha</th>
                                <th>Fecha Est. Atención</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordenes.map(oc => {
                                return (
                                    <tr key={oc.id}>
                                        <td className="fw-bold text-success">{oc.numero_oc}</td>
                                        <td>{oc.proveedor}</td>
                                        <td>{(oc as any).sc?.numero_sc || '-'}</td>
                                        <td><Badge bg="secondary">{oc.estado}</Badge></td>
                                        <td>{oc.fecha_oc}</td>
                                        <td>{oc.fecha_aproximada_atencion || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </Col>
            </Row>

            <Modal show={showModal} onHide={() => setShowModal(false)} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Crear OC para {selectedSC?.numero_sc}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Número de Orden de Compra</Form.Label>
                                <Form.Control
                                    value={manualOCNumber}
                                    onChange={e => setManualOCNumber(e.target.value)}
                                    placeholder="Ej: OC-001-2026"
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Proveedor</Form.Label>
                                <Form.Control
                                    value={proveedor}
                                    onChange={e => setProveedor(e.target.value)}
                                    placeholder="Nombre del proveedor"
                                />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Row className="mb-3">
                        <Col xs={12} md={6}>
                            <Form.Group>
                                <Form.Label>Fecha Aproximada de Atención</Form.Label>
                                <Form.Control
                                    type="date"
                                    value={fechaAtencion}
                                    onChange={e => setFechaAtencion(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                    </Row>

                    <Table size="sm">
                        <thead>
                            <tr>
                                <th style={{ width: 50 }}>Sel.</th>
                                <th>Item</th>
                                <th>Cant. SC</th>
                                <th>A Comprar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToOrder.map((it, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <Form.Check
                                            checked={it.selected}
                                            onChange={e => {
                                                const newItems = [...itemsToOrder];
                                                newItems[idx].selected = e.target.checked;
                                                setItemsToOrder(newItems);
                                            }}
                                        />
                                    </td>
                                    <td>{it.material_desc}</td>
                                    <td>{Number(it.cantidad_sc).toFixed(2)}</td>
                                    <td>
                                        <Form.Control
                                            type="number"
                                            size="sm"
                                            value={it.cantidad_compra}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const newItems = [...itemsToOrder];
                                                // Limitar a 2 decimales
                                                newItems[idx].cantidad_compra = parseFloat(val.toFixed(2));
                                                setItemsToOrder(newItems);
                                            }}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="success" onClick={handleSaveOC}>Generar Orden</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionOrdenes;
