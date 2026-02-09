import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Alert } from 'react-bootstrap';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { registrarEntrada, getMovimientos } from '../services/almacenService';
import { getSolicitudesCompra } from '../services/comprasService';
import { Requerimiento, Material, MovimientoAlmacen, SolicitudCompra, DetalleSC } from '../types';
import { useAuth } from '../context/AuthContext';

const EntradasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    // Data Sources
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [materialesList, setMaterialesList] = useState<Material[]>([]);
    // Keep raw reqs to find IDs
    const [allReqs, setAllReqs] = useState<Requerimiento[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    // Selection State
    const [selectedSC, setSelectedSC] = useState<SolicitudCompra | null>(null);
    const [selectedDetailSC, setSelectedDetailSC] = useState<DetalleSC | null>(null);

    // Form State
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [cantidadIngreso, setCantidadIngreso] = useState(0);
    const [docReferencia, setDocReferencia] = useState('');

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllReqs([]);
            setSolicitudes([]);
            setHistorial([]);
        }
    }, [selectedObra]);

    const loadData = async (refreshSCId?: string) => {
        if (!selectedObra) return;
        // We need Reqs to map back IDs, and SCs for the UI
        const [reqsData, matsData, movesData, scsData] = await Promise.all([
            getRequerimientos(selectedObra.id),
            getMateriales(),
            getMovimientos(selectedObra.id),
            getSolicitudesCompra(selectedObra.id)
        ]);

        if (reqsData.data) setAllReqs(reqsData.data);
        if (matsData) setMaterialesList(matsData);
        if (movesData) {
            setHistorial(movesData.filter((m: MovimientoAlmacen) => m.tipo === 'ENTRADA'));
        }
        if (scsData) {
            // Filter only approved/pending SCs if desired? 
            setSolicitudes(scsData);

            if (refreshSCId) {
                const updated = scsData.find((s: SolicitudCompra) => s.id === refreshSCId);
                setSelectedSC(updated || null);
            }
        }
    };

    const handleSelectSC = (scId: string) => {
        const sc = solicitudes.find(s => s.id === scId) || null;
        setSelectedSC(sc);
        setSelectedDetailSC(null);
        setCantidadIngreso(0);
        setSuccessMsg('');
    };

    const handleRegister = async () => {
        if (!selectedSC || !selectedDetailSC) return;
        if (!selectedSC.requerimiento_id) return alert("Error: SC sin requerimiento vinculado");

        // 1. Validation
        if (cantidadIngreso <= 0) return alert("Cantidad debe ser mayor a 0");
        if (!docReferencia) return alert("Ingrese Documento de Referencia");

        // 2. Find the Original Requirement Detail ID (Critical for legacy backend)
        // detailed logic: find req -> find item with same material/desc
        const parentReq = allReqs.find(r => r.id === selectedSC.requerimiento_id);
        if (!parentReq || !parentReq.detalles) return alert("Error: No se encontraron detalles del Requerimiento padre.");

        // Attempt to match by Material ID if available, or fallback to Description
        // Check 1: Validate against SC Approved Quantity strictly
        // We need to re-calculate 'consumed' here to be safe, or rely on UI passing it?
        // Safest is re-calculate.
        const consumed = historial
            .filter(h =>
                String(h.requerimiento_id) === String(selectedSC.requerimiento_id) &&
                h.material_id === selectedDetailSC.material_id &&
                new Date(h.created_at || h.fecha) >= new Date(selectedSC.created_at)
            )
            .reduce((sum, h) => sum + h.cantidad, 0);

        const remainingInSC = selectedDetailSC.cantidad - consumed;

        if (cantidadIngreso > remainingInSC) {
            return alert(`Error: La cantidad a ingresar (${cantidadIngreso}) supera el pendiente de la SC (${remainingInSC}).`);
        }

        const targetDetReq = parentReq.detalles.find(d =>
            d.descripcion === selectedDetailSC.material?.descripcion &&
            d.material_categoria === selectedDetailSC.material?.categoria
        );

        if (!targetDetReq) {
            return alert("Error: No se pudo enlazar con el requerimiento original.");
        }

        setLoading(true);
        try {
            await registrarEntrada(
                selectedDetailSC.material_id,
                cantidadIngreso,
                selectedSC.requerimiento_id,
                targetDetReq.id,
                docReferencia,
                selectedObra!.id
            );

            setSuccessMsg("Entrada registrada correctamente (Vía SC)");
            setSelectedDetailSC(null);
            setDocReferencia('');
            setCantidadIngreso(0);
            loadData(selectedSC.id);
        } catch (error: any) {
            console.error(error);
            alert("Error: " + error.message);
        }
        setLoading(false);
    };

    // Filter out fully completed SCs
    const activeSolicitudes = solicitudes.filter(sc => {
        if (!sc.detalles) return false;
        // Check if ANY item still has pending quantity
        return sc.detalles.some(d => {
            const consumed = historial
                .filter(h =>
                    String(h.requerimiento_id) === String(sc.requerimiento_id) &&
                    h.material_id === d.material_id &&
                    new Date(h.created_at || h.fecha) >= new Date(sc.created_at)
                )
                .reduce((sum, h) => sum + h.cantidad, 0);
            return consumed < d.cantidad;
        });
    });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Registrar Entrada (Vía Solicitud de Compra)</h2>
            </div>
            <p className="text-muted mb-4">Seleccione una SC aprobada para ingresar materiales.</p>

            {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')} dismissible>{successMsg}</Alert>}

            <Row className="mb-4">
                <Col xs={12} md={6}>
                    <Form.Group>
                        <Form.Label>Buscar Solicitud de Compra (Solo Pendientes)</Form.Label>
                        <Form.Select onChange={e => handleSelectSC(e.target.value)} value={selectedSC?.id || ''}>
                            <option value="">Seleccione SC...</option>
                            {activeSolicitudes.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.numero_sc} - (Req: {s.requerimiento?.item_correlativo || '?'}) - {s.requerimiento?.solicitante}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Col>
            </Row>

            {selectedSC && (
                <Card className="custom-card">
                    <h5 className="mb-4 text-primary fw-bold">Items de {selectedSC.numero_sc}</h5>
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>Material</th>
                                    <th>Cant. Aprobada</th>
                                    <th>Cant. Pendiente</th>
                                    <th>Unidad</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedSC.detalles?.map(d => {
                                    // Heuristic: Check if enough entries have been made AFTER this SC was created
                                    const consumed = historial
                                        .filter(h =>
                                            // Check strict equality carefully, type casting might be needed if IDs are numbers vs strings
                                            String(h.requerimiento_id) === String(selectedSC.requerimiento_id) &&
                                            h.material_id === d.material_id &&
                                            new Date(h.created_at || h.fecha) >= new Date(selectedSC.created_at)
                                        )
                                        .reduce((sum, h) => sum + h.cantidad, 0);

                                    // Round to 2 decimals to avoid float issues
                                    const pending = Math.max(0, d.cantidad - consumed);

                                    if (pending <= 0) return null;

                                    const isSelected = selectedDetailSC?.id === d.id;
                                    return (
                                        <tr key={d.id} className={isSelected ? 'table-primary' : ''}>
                                            <td>
                                                <strong>{d.material?.descripcion || 'Sin Desc'}</strong>
                                                <div className="small text-muted">{d.material?.categoria}</div>
                                            </td>
                                            <td className="text-muted small">{d.cantidad}</td>
                                            <td className="fw-bold text-success">{pending}</td>
                                            <td>{d.unidad}</td>
                                            <td>
                                                <Button
                                                    size="sm"
                                                    variant={isSelected ? 'secondary' : 'primary'}
                                                    onClick={() => {
                                                        setSelectedDetailSC(d);
                                                        setCantidadIngreso(pending); // Suggest remaining amount
                                                        setSuccessMsg('');
                                                    }}
                                                >
                                                    Seleccionar
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {selectedSC.detalles?.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center text-muted">No hay items en esta SC.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>

                    {selectedDetailSC && (
                        <div className="bg-light p-4 rounded-3 border-0 mt-4 fade-in">
                            <h6 className="text-primary fw-bold mb-3">Registrar Ingreso: {selectedDetailSC.material?.descripcion}</h6>
                            <Row className="align-items-end g-3">
                                <Col xs={12} md={4}>
                                    <Form.Label>Doc. Referencia</Form.Label>
                                    <Form.Control
                                        value={docReferencia}
                                        onChange={e => setDocReferencia(e.target.value)}
                                        placeholder="Ej. Guía 001"
                                    />
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Label>Cantidad a Ingresar</Form.Label>
                                    <Form.Control
                                        type="number"
                                        value={cantidadIngreso}
                                        onChange={e => setCantidadIngreso(parseFloat(e.target.value))}
                                    />
                                </Col>
                                <Col xs={12} md={4}>
                                    <Button
                                        variant="success"
                                        className="w-100 btn-primary"
                                        onClick={handleRegister}
                                        disabled={loading}
                                    >
                                        {loading ? 'Guardando...' : 'Confirmar Ingreso'}
                                    </Button>
                                </Col>
                            </Row>
                        </div>
                    )}
                </Card>
            )}

            {/* History Table */}
            <div className="mt-5">
                <h4 className="text-secondary mb-3">Historial de Entradas Recientes</h4>
                <Card className="custom-card">
                    <Table hover responsive className="table-borderless-custom mb-0">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>N° Req.</th>
                                <th>Doc. Referencia</th>
                                <th>Material / Descripción</th>
                                <th>Cantidad</th>
                                <th>Unidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial.map(h => {
                                // Find material details in loaded list
                                const mat = materialesList.find(m => m.id === h.material_id);
                                // Cast to any to access the joined 'requerimiento' property not yet in strict types
                                const reqNum = (h as any).requerimiento ? (h as any).requerimiento.item_correlativo : '-';

                                return (
                                    <tr key={h.id}>
                                        <td>{new Date(h.fecha).toISOString().split('T')[0]}</td>
                                        <td className="fw-bold text-primary">
                                            {reqNum !== '-' ? `#${reqNum}` : '-'}
                                        </td>
                                        <td className="fw-bold">{h.documento_referencia || '-'}</td>
                                        <td>
                                            <div>{mat?.descripcion || 'Material Desconocido'}</div>
                                            <small className="text-muted">{mat?.categoria}</small>
                                        </td>
                                        <td>{h.cantidad}</td>
                                        <td>{mat?.unidad || ''}</td>
                                    </tr>
                                );
                            })}
                            {historial.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center text-muted">No hay entradas registradas recientemente.</td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </Card>
            </div>
        </div>
    );
};

export default EntradasAlmacen;
