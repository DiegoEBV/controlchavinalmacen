import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Alert } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { registrarEntrada, getMovimientos } from '../services/almacenService';
import { getSolicitudesCompra, getOrdenesCompra } from '../services/comprasService';
import { Requerimiento, Material, MovimientoAlmacen, SolicitudCompra, DetalleSC, OrdenCompra } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { mergeUpdates } from '../utils/stateUpdates';

const EntradasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    // Fuentes de Datos
    const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    const [materialesList, setMaterialesList] = useState<Material[]>([]);
    // Mantener reqs sin procesar para encontrar IDs
    const [allReqs, setAllReqs] = useState<Requerimiento[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);

    // Estado de Selección
    const [selectedSC, setSelectedSC] = useState<SolicitudCompra | null>(null);
    const [selectedDetailSC, setSelectedDetailSC] = useState<DetalleSC | null>(null);

    // Estado del Formulario
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [cantidadIngreso, setCantidadIngreso] = useState(0);
    const [docReferencia, setDocReferencia] = useState('');

    // --- Suscripciones en Tiempo Real Optimizadas ---

    // 1. Movimientos (Entradas) - INSERT solamente, usualmente
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            // Necesario filtrar SOLO Entradas si se obtiene por ID, 
            // pero obtener por ID devuelve la fila sin importar el tipo.
            // Filtraremos en memoria después de obtener o asumiremos lógica del backend.
            const { data: newMoves } = await supabase
                .from('movimientos_almacen')
                .select('*')
                .in('id', Array.from(upserts))
                .eq('tipo', 'ENTRADA'); // Intento de filtro del lado del servidor

            if (newMoves && newMoves.length > 0) {
                setHistorial(prev => mergeUpdates(prev, newMoves, new Set()));
            }
        }
    }, { table: 'movimientos_almacen', event: 'INSERT', throttleMs: 2000 });

    // 2. Solicitudes Compra - UPDATE solamente (cambios de estado, detalles)
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            const { data: updatedSCs } = await supabase
                .from('solicitudes_compra')
                .select(`
                    *,
                    requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante),
                    detalles:detalles_sc(*, material:materiales(*))
                `)
                .in('id', Array.from(upserts));

            if (updatedSCs) {
                setSolicitudes(prev => mergeUpdates(prev, updatedSCs as SolicitudCompra[], new Set()));

                // Actualizar SC Seleccionada si fue modificada
                const currentSelectedId = selectedSC?.id;
                if (currentSelectedId) {
                    const updatedSelected = updatedSCs.find(s => s.id === currentSelectedId);
                    if (updatedSelected) {
                        setSelectedSC(updatedSelected as SolicitudCompra);
                    }
                }
            }
        }
    }, { table: 'solicitudes_compra', event: 'UPDATE', throttleMs: 2000 });


    // 3. Órdenes Compra - Para filtrar SCs
    useRealtimeSubscription(async ({ upserts }) => {
        if (upserts.size > 0) {
            // Solo actualización escalar para activar re-renderizado del filtro
            const { data: newOCs } = await supabase
                .from('ordenes_compra')
                .select('*')
                .in('id', Array.from(upserts));

            if (newOCs) {
                setOrdenes(prev => mergeUpdates(prev, newOCs as OrdenCompra[], new Set()));
            }
        }
    }, { table: 'ordenes_compra', event: '*', throttleMs: 2000 });

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllReqs([]);
            setSolicitudes([]);
            setOrdenes([]);
            setHistorial([]);
        }
    }, [selectedObra]);

    const loadData = async (refreshSCId?: string) => {
        if (!selectedObra) return;
        // Necesitamos Reqs para mapear IDs, y SCs para la UI
        const [reqsData, matsData, movesData, scsData, ocsData] = await Promise.all([
            getRequerimientos(selectedObra.id),
            getMateriales(),
            getMovimientos(selectedObra.id),
            getSolicitudesCompra(selectedObra.id),
            getOrdenesCompra(selectedObra.id)
        ]);

        if (reqsData.data) setAllReqs(reqsData.data);
        if (matsData) setMaterialesList(matsData);
        if (movesData) {
            setHistorial(movesData.filter((m: MovimientoAlmacen) => m.tipo === 'ENTRADA'));
        }
        if (ocsData) setOrdenes(ocsData);

        if (scsData) {
            // ¿Filtrar solo SCs aprobadas/pendientes si se desea? 
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

        // 1. Validación
        if (cantidadIngreso <= 0) return alert("Cantidad debe ser mayor a 0");
        if (!docReferencia) return alert("Ingrese Documento de Referencia");

        // 2. Encontrar el ID del Detalle de Requerimiento Original (Crítico para backend legado)
        // lógica detallada: encontrar req -> encontrar ítem con mismo material/desc
        const parentReq = allReqs.find(r => r.id === selectedSC.requerimiento_id);
        if (!parentReq || !parentReq.detalles) return alert("Error: No se encontraron detalles del Requerimiento padre.");

        // Intentar coincidir por ID de Material si está disponible, o recurrir a Descripción
        // Verificación 1: Validar estrictamente contra Cantidad Aprobada SC
        // ¿Necesitamos re-calcular 'consumido' aquí para estar seguros, o confiar en que la UI lo pase?
        // Lo más seguro es re-calcular.
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

    // Filtrar SCs completamente completadas Y aquellas sin OC
    const activeSolicitudes = solicitudes.filter(sc => {
        if (!sc.detalles) return false;

        // 1. Debe tener una Orden de Compra asociada (activa/emitida)
        const hasOC = ordenes.some(o => o.sc_id === sc.id && o.estado !== 'Anulada');
        if (!hasOC) return false;

        // 2. Verificar si ALGÚN ítem todavía tiene cantidad pendiente
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
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <h5 className="mb-0 text-primary fw-bold">Items de {selectedSC.numero_sc}</h5>
                        {selectedSC.requerimiento?.frente && <span className="badge bg-secondary">Frente: {selectedSC.requerimiento.frente.nombre_frente}</span>}
                    </div>
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
                                    // Heurística: Verificar si se han realizado suficientes entradas DESPUÉS de que se creó esta SC
                                    const consumed = historial
                                        .filter(h =>
                                            // Verificar igualdad estricta cuidadosamente, el casting de tipos podría ser necesario si los IDs son números vs cadenas
                                            String(h.requerimiento_id) === String(selectedSC.requerimiento_id) &&
                                            h.material_id === d.material_id &&
                                            new Date(h.created_at || h.fecha) >= new Date(selectedSC.created_at)
                                        )
                                        .reduce((sum, h) => sum + h.cantidad, 0);

                                    // Redondear a 2 decimales para evitar problemas de flotantes
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
                                                        setCantidadIngreso(pending); // Sugerir cantidad restante
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

            {/* Tabla de Historial */}
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
                                // Encontrar detalles del material en lista cargada
                                const mat = materialesList.find(m => m.id === h.material_id);
                                // Castear a any para acceder a la propiedad 'requerimiento' unida, aún no en tipos estrictos
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
