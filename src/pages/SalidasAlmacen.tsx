import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table, Badge } from 'react-bootstrap';
import { getInventario, registrarSalida, getMovimientos } from '../services/almacenService';
import { Inventario, MovimientoAlmacen } from '../types';

const SalidasAlmacen: React.FC = () => {
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [selectedItem, setSelectedItem] = useState<Inventario | null>(null);
    const [cantidadSalida, setCantidadSalida] = useState(0);
    const [destino, setDestino] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // History State
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [stockData, movsData] = await Promise.all([
            getInventario(),
            getMovimientos()
        ]);

        // Filter stock > 0
        setInventario(stockData?.filter(i => i.cantidad_actual > 0) || []);

        // Filter valid movements (SALIDA)
        if (movsData) {
            const salidas = movsData.filter((m: any) => m.tipo === 'SALIDA');
            setHistorial(salidas);
        }
    };

    const handleRegister = async () => {
        if (!selectedItem) return;
        if (cantidadSalida <= 0) return alert("Cantidad debe ser mayor a 0");
        if (cantidadSalida > selectedItem.cantidad_actual) return alert("No hay suficiente stock");
        if (!destino) return alert("Ingrese Destino/Uso");

        setLoading(true);
        try {
            await registrarSalida(
                selectedItem.material_id,
                cantidadSalida,
                destino
            );
            setSuccessMsg("Salida registrada correctamente");
            setCantidadSalida(0);
            setDestino('');
            setSelectedItem(null);
            loadData(); // Reload stock and history
        } catch (error) {
            console.error(error);
            alert("Error al registrar salida");
        }
        setLoading(false);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Registrar Salida de Material</h2>
            </div>
            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Card className="custom-card">
                <Row className="mb-3">
                    <Col xs={12} md={6}>
                        <Form.Group>
                            <Form.Label>Seleccionar Material (Stock Disponible)</Form.Label>
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
                                        {i.material?.descripcion} ({i.material?.unidad}) - Stock: {i.cantidad_actual}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </Col>
                </Row>

                {selectedItem && (
                    <Row className="align-items-end g-3">
                        <Col xs={12} md={4}>
                            <Form.Group>
                                <Form.Label>Cantidad a Retirar (Máx: {selectedItem.cantidad_actual})</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={cantidadSalida}
                                    onChange={e => setCantidadSalida(parseFloat(e.target.value))}
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                            <Form.Group>
                                <Form.Label>Destino / Uso</Form.Label>
                                <Form.Control
                                    value={destino}
                                    onChange={e => setDestino(e.target.value)}
                                    placeholder="Ej. Torre A - Losa 2"
                                />
                            </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                            <Button variant="danger" className="w-100" onClick={handleRegister} disabled={loading}>
                                Registrar Salida
                            </Button>
                        </Col>
                    </Row>
                )}
            </Card>

            <h4 className="mb-4 text-secondary mt-5">Historial de Salidas</h4>
            <Card className="custom-card p-0 overflow-hidden">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Material</th>
                            <th>Categoría</th>
                            <th>Cantidad</th>
                            <th>Destino / Uso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map(h => (
                            <tr key={h.id}>
                                <td>{h.fecha}</td>
                                <td>{(h as any).material?.descripcion}</td>
                                <td><Badge bg="secondary">{(h as any).material?.categoria}</Badge></td>
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
        </div>
    );
};

export default SalidasAlmacen;
