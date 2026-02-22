import React, { useState, useEffect } from 'react';
import { Card, Table, Badge, Button, Row, Col, Spinner } from 'react-bootstrap';
import { getRequerimientosServicios, updateDetalleLogistica } from '../services/requerimientosService';
import { Requerimiento } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/PaginationControls';

const GestionServicios: React.FC = () => {
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [loading, setLoading] = useState(true);
    const { selectedObra } = useAuth();

    useEffect(() => {
        if (selectedObra) {
            loadData();
        }
    }, [selectedObra]);

    const loadData = async () => {
        setLoading(true);
        const res = await getRequerimientosServicios(selectedObra?.id);
        if (res.data) {
            setRequerimientos(res.data);
        }
        setLoading(false);
    };

    // Auto-refresh when requerimientos change
    useRealtimeSubscription(() => {
        loadData();
    }, { table: 'requerimientos', throttleMs: 2000 });

    useRealtimeSubscription(() => {
        loadData();
    }, { table: 'detalles_requerimiento', throttleMs: 2000 });


    const handleMarcarAtendido = async (detalleId: string) => {
        if (!confirm('¿Marcar este servicio como Atendido?')) return;

        try {
            const detailToUpdate = requerimientos.flatMap(r => r.detalles || []).find(d => d.id === detalleId);
            if (!detailToUpdate) return;

            await updateDetalleLogistica(detalleId, {
                cantidad_atendida: detailToUpdate.cantidad_solicitada,
                estado: 'Atendido'
            });
            await loadData();
        } catch (error) {
            console.error('Error al actualizar servicio:', error);
            alert('Hubo un error al marcar como atendido');
        }
    };

    // Flatten requirements with their details for easier rendering
    // (computed before any early return to satisfy Rules of Hooks)
    const serviciosFlat = requerimientos.flatMap(req =>
        (req.detalles || [])
            .filter(d => d.tipo === 'Servicio')
            .map(d => ({
                reqId: req.id,
                reqCorrelativo: req.item_correlativo,
                solicitante: req.solicitante,
                frente: req.frente?.nombre_frente || 'N/A',
                bloque: req.bloque || 'N/A',
                fecha: req.fecha_solicitud,
                detalleId: d.id,
                descripcion: d.descripcion,
                cantidad: d.cantidad_solicitada,
                estado: d.estado,
                created_at: d.created_at
            }))
    );

    const { currentPage, totalPages, totalItems, pageSize, paginatedItems: pagedServicios, goToPage } = usePagination(serviciosFlat, 15);

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="fade-in">
            <div className="page-header mb-4">
                <h2>Gestión de Servicios</h2>
            </div>

            <Row>
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header className="bg-white fw-bold">Servicios Solicitados</Card.Header>
                        <Card.Body>
                            <Table hover responsive className="table-borderless-custom mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th>Req #</th>
                                        <th>Fecha</th>
                                        <th>Solicitante</th>
                                        <th>Frente / Bloque</th>
                                        <th>Descripción Servicio</th>
                                        <th>Cant.</th>
                                        <th>Estado</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedServicios.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="fw-bold">#{item.reqCorrelativo}</td>
                                            <td>{item.fecha}</td>
                                            <td>{item.solicitante}</td>
                                            <td>{item.frente} <br /><small className="text-muted">{item.bloque}</small></td>
                                            <td>{item.descripcion}</td>
                                            <td>{item.cantidad}</td>
                                            <td>
                                                <Badge bg={item.estado === 'Atendido' ? 'success' : 'warning'}>
                                                    {item.estado}
                                                </Badge>
                                            </td>
                                            <td>
                                                {item.estado !== 'Atendido' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="success"
                                                        onClick={() => handleMarcarAtendido(item.detalleId)}
                                                    >
                                                        ✅ Marcar Atendido
                                                    </Button>
                                                ) : (
                                                    <span className="text-muted small">Completado</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {serviciosFlat.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="text-center text-muted py-4">
                                                No hay servicios pendientes en esta obra.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </Table>
                            <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={goToPage} />
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default GestionServicios;
