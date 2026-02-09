import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Modal, Form, Row, Col } from 'react-bootstrap';
import { getSolicitudesCompra, createOrdenCompra, getOrdenesCompra } from '../services/comprasService';
import { SolicitudCompra, OrdenCompra } from '../types';
import { useAuth } from '../context/AuthContext';

const GestionOrdenes: React.FC = () => {
    const { selectedObra } = useAuth();
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [selectedSC, setSelectedSC] = useState<SolicitudCompra | null>(null);

    // Form Inputs
    const [proveedor, setProveedor] = useState('');
    const [manualOCNumber, setManualOCNumber] = useState('');
    const [fechaAtencion, setFechaAtencion] = useState('');
    const [itemsToOrder, setItemsToOrder] = useState<any[]>([]);

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setSolicitudes([]);
            setOrdenes([]);
        }
    }, [selectedObra]);

    const loadData = async () => {
        if (!selectedObra) return;
        const [scs, ocs] = await Promise.all([
            getSolicitudesCompra(selectedObra.id),
            getOrdenesCompra(selectedObra.id)
        ]);

        // Logic: specific SC is available ONLY if it has pending items to buy.
        const availableScs = scs.filter(sc => {
            if (!sc.detalles) return false;

            // Check if every item in this SC is fully purchased
            const isFullyPurchased = sc.detalles.every(d => {
                // Find all OC details that reference this specific SC detail
                const totalPurchased = ocs.reduce((sum, oc) => {
                    const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                    return sum + (match ? match.cantidad : 0);
                }, 0);

                return totalPurchased >= d.cantidad;
            });

            return !isFullyPurchased;
        });

        setSolicitudes(availableScs);
        setOrdenes(ocs);
    };

    const handleOpenCreate = (sc: SolicitudCompra) => {
        setSelectedSC(sc);
        setManualOCNumber(''); // Reset
        setProveedor(''); // Reset
        setFechaAtencion(''); // Reset
        // Pre-fill with items from SC
        // Logic: Allow selecting partial items.
        const initialItems = sc.detalles?.map(d => {
            // Calculate what has already been purchased in previous OCs
            const totalPurchased = ordenes.reduce((sum, oc) => {
                const match = oc.detalles?.find(od => od.detalle_sc_id === d.id);
                return sum + (match ? match.cantidad : 0);
            }, 0);

            const remaining = Math.max(0, d.cantidad - totalPurchased);

            return {
                detalle_sc_id: d.id,
                material_desc: d.material?.descripcion,
                cantidad_sc: d.cantidad, // Add this field
                cantidad_pendiente: remaining, // Show real remaining balance
                cantidad_compra: remaining, // Use consistent naming (was cantidad_a_comprar in some places, but let's check usage)
                selected: remaining > 0 // Only select if there's balance
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
            precio_unitario: 0 // Default to 0 as requested
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
            loadData();
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
                                {solicitudes.map(sc => (
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
                                // Find SC number easily? We joined details, but SC header might need join or mapping
                                // We stored sc_id in OC header, so we can display it if we fetch join.
                                // Currently fetching *, let's assume we didn't join SC Header but we have ID.
                                // Logic improvement: modify service to join sc_header if needed.
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
                                                // Limit to 2 decimals
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
