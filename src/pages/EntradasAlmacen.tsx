import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Alert } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { getMovimientos, registrarEntradaMasiva } from '../services/almacenService';
import { getSolicitudesCompra, getOrdenesCompra } from '../services/comprasService';
import { Requerimiento, Material, MovimientoAlmacen, SolicitudCompra, DetalleSC, OrdenCompra } from '../types';
import { Modal } from 'react-bootstrap';
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
    // Cambiado a un Map para selección múltiple: ID -> Cantidad a ingresar (inicialmente pendiente)
    const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
    const [showModal, setShowModal] = useState(false);

    // Estado del Formulario
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
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
        setSelectedItems(new Map());
        setSuccessMsg('');
    };

    const toggleItemSelection = (detalle: DetalleSC, pending: number) => {
        const newMap = new Map(selectedItems);
        if (newMap.has(detalle.id)) {
            newMap.delete(detalle.id);
        } else {
            newMap.set(detalle.id, pending);
        }
        setSelectedItems(newMap);
    };

    const handleSelectAll = (detalles: DetalleSC[]) => {
        const newMap = new Map();
        detalles.forEach(d => {
            // Recalcular pendiente para asegurar consistencia
            const consumed = historial
                .filter(h =>
                    String(h.requerimiento_id) === String(selectedSC?.requerimiento_id) &&
                    h.material_id === d.material_id &&
                    new Date(h.created_at || h.fecha) >= new Date(selectedSC?.created_at || '')
                )
                .reduce((sum, h) => sum + h.cantidad, 0);
            const pending = Math.max(0, d.cantidad - consumed);
            if (pending > 0) newMap.set(d.id, pending);
        });
        setSelectedItems(newMap);
    };

    const handleBatchRegister = async () => {
        if (!selectedSC) return;
        if (selectedItems.size === 0) return alert("Seleccione al menos un ítem.");
        if (!docReferencia) return alert("Ingrese Documento de Referencia");

        setLoading(true);
        try {
            // Preparar payload
            const itemsToProcess = [];

            for (const [id, cantidad] of selectedItems.entries()) {
                const detalle = selectedSC.detalles?.find(d => d.id === id);
                if (!detalle) continue;

                // Validar cantidad
                const consumed = historial
                    .filter(h =>
                        String(h.requerimiento_id) === String(selectedSC.requerimiento_id) &&
                        h.material_id === detalle.material_id &&
                        new Date(h.created_at || h.fecha) >= new Date(selectedSC.created_at)
                    )
                    .reduce((sum, h) => sum + h.cantidad, 0);

                const pending = Math.max(0, detalle.cantidad - consumed);

                if (cantidad > pending) {
                    throw new Error(`La cantidad para ${detalle.material?.descripcion} excede el pendiente.`);
                }

                // Encontrar Req Detail ID (Lógica mantenida del original)
                const parentReq = allReqs.find(r => r.id === selectedSC.requerimiento_id);
                const targetDetReq = parentReq?.detalles?.find(d =>
                    d.descripcion === detalle.material?.descripcion &&
                    d.material_categoria === detalle.material?.categoria
                );

                if (!targetDetReq) throw new Error(`No se encontró detalle de requerimiento para ${detalle.material?.descripcion}`);

                itemsToProcess.push({
                    material_id: detalle.material_id,
                    cantidad: cantidad,
                    req_id: selectedSC.requerimiento_id,
                    det_req_id: targetDetReq.id,
                    sc_detail_id: detalle.id // Para validación futura si se implementa en backend
                });
            }

            const result = await registrarEntradaMasiva(
                itemsToProcess,
                docReferencia,
                selectedSC!.requerimiento?.obra_id || selectedObra!.id
            );

            setSuccessMsg(`Entrada Masiva Exitosa! Código VINTAR: ${result.vintar_code}`);
            setSelectedItems(new Map());
            setDocReferencia('');
            setShowModal(false);
            loadData(selectedSC.id); // Recargar
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
                        <div>
                            {selectedSC.requerimiento?.frente && <span className="badge bg-secondary me-2">Frente: {selectedSC.requerimiento.frente.nombre_frente}</span>}
                            <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => selectedSC.detalles && handleSelectAll(selectedSC.detalles)}
                            >
                                Seleccionar Todo
                            </Button>
                        </div>
                    </div>
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom mb-0">
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th>Material</th>
                                    <th>Cant. Aprobada</th>
                                    <th>Cant. Pendiente</th>
                                    <th>Unidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedSC.detalles?.map(d => {
                                    const consumed = historial
                                        .filter(h =>
                                            String(h.requerimiento_id) === String(selectedSC.requerimiento_id) &&
                                            h.material_id === d.material_id &&
                                            new Date(h.created_at || h.fecha) >= new Date(selectedSC.created_at)
                                        )
                                        .reduce((sum, h) => sum + h.cantidad, 0);

                                    const pending = Math.max(0, d.cantidad - consumed);

                                    if (pending <= 0) return null;

                                    const isSelected = selectedItems.has(d.id);
                                    return (
                                        <tr key={d.id} className={isSelected ? 'table-primary' : ''}>
                                            <td>
                                                <Form.Check
                                                    checked={isSelected}
                                                    onChange={() => toggleItemSelection(d, pending)}
                                                />
                                            </td>
                                            <td>
                                                <strong>{d.material?.descripcion || 'Sin Desc'}</strong>
                                                <div className="small text-muted">{d.material?.categoria}</div>
                                            </td>
                                            <td className="text-muted small">{d.cantidad}</td>
                                            <td className="fw-bold text-success">{pending}</td>
                                            <td>{d.unidad}</td>
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

                    <div className="mt-4 d-flex justify-content-end">
                        <Button
                            variant="success"
                            disabled={selectedItems.size === 0}
                            onClick={() => setShowModal(true)}
                        >
                            Procesar Entrada ({selectedItems.size})
                        </Button>
                    </div>
                </Card>
            )}

            {/* Modal de Confirmación */}
            <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Confirmar Entrada Masiva</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group className="mb-3">
                        <Form.Label>Documento de Referencia (Guía, Factura, etc.)</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Ej. GR-001-2024"
                            value={docReferencia}
                            onChange={(e) => setDocReferencia(e.target.value)}
                        />
                    </Form.Group>

                    <Table hover className="align-middle mb-0">
                        <colgroup>
                            <col style={{ width: '50%' }} />
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '30%' }} />
                        </colgroup>
                        <thead className="bg-light">
                            <tr>
                                <th className="py-2 border-0">Material / Descripción</th>
                                <th className="py-2 text-center border-0">Pendiente</th>
                                <th className="py-2 text-center border-0">A Ingresar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(selectedItems.entries()).map(([id, qty]) => {
                                const detalle = selectedSC?.detalles?.find(d => d.id === id);
                                if (!detalle) return null;

                                // Recalcular pendiente real (Max)
                                const consumed = historial
                                    .filter(h =>
                                        String(h.requerimiento_id) === String(selectedSC?.requerimiento_id) &&
                                        h.material_id === detalle.material_id &&
                                        new Date(h.created_at || h.fecha) >= new Date(selectedSC?.created_at || '')
                                    )
                                    .reduce((sum, h) => sum + h.cantidad, 0);
                                const maxPending = Math.max(0, detalle.cantidad - consumed);

                                return (
                                    <tr key={id}>
                                        <td className="border-0">
                                            <div className="fw-bold text-dark">{detalle.material?.descripcion}</div>
                                            <div className="small text-muted">{detalle.material?.categoria}</div>
                                        </td>
                                        <td className="text-center border-0">
                                            <span className="badge bg-light text-dark border">
                                                {maxPending} {detalle.unidad}
                                            </span>
                                        </td>
                                        <td className="border-0">
                                            <Form.Control
                                                type="number"
                                                min="0"
                                                max={maxPending}
                                                className="text-center fw-bold text-primary"
                                                value={qty}
                                                onChange={(e) => {
                                                    let val = parseFloat(e.target.value);
                                                    if (isNaN(val)) val = 0;
                                                    const newMap = new Map(selectedItems);
                                                    newMap.set(id, val);
                                                    setSelectedItems(newMap);
                                                }}
                                                isInvalid={qty <= 0 || qty > maxPending}
                                            />
                                            {qty > maxPending && <div className="text-danger small mt-1 text-center" style={{ fontSize: '0.8em' }}>Excede máximo</div>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={handleBatchRegister} disabled={loading}>
                        {loading ? 'Procesando...' : 'Generar VINTAR y Guardar'}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Tabla de Historial */}
            <div className="mt-5">
                <h4 className="text-secondary mb-3">Historial de Entradas Recientes</h4>
                <Card className="custom-card">
                    <Table hover responsive className="table-borderless-custom mb-0">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>N° Req.</th>
                                <th>VINTAR</th>
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
                                        <td>
                                            {h.vintar_code ? <span className="badge bg-info text-dark">{h.vintar_code}</span> : '-'}
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
