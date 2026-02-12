
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Modal, Form, Alert, Tabs, Tab, InputGroup } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { getEquipos, createEquipo, updateEquipo, deleteEquipo, getMovimientosPendientes, registrarSalida, registrarRetorno, getProductionUsers } from '../services/equipoService';

import { Equipo, MovimientoEquipo } from '../types';

const GestionEquipos: React.FC = () => {
    const { selectedObra, profile } = useAuth();
    const [activeTab, setActiveTab] = useState('inventario');
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [movimientos, setMovimientos] = useState<MovimientoEquipo[]>([]);
    // Constante solicitantes ahora se usará para historial o sugerencias si se desea, 
    // pero el input principal será texto libre para 'nombre_solicitante'.
    // const [solicitantes, setSolicitantes] = useState<any[]>([]); 
    const [productionUsers, setProductionUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Modals state
    const [showEquipoModal, setShowEquipoModal] = useState(false);
    const [showSalidaModal, setShowSalidaModal] = useState(false);
    const [showRetornoModal, setShowRetornoModal] = useState(false);

    // Form data
    const [currentEquipo, setCurrentEquipo] = useState<Partial<Equipo>>({ estado: 'Operativo' });
    const [salidaData, setSalidaData] = useState({
        equipo_id: '',
        nombre_solicitante: '', // Texto libre
        encargado_id: '',       // ID de usuario de producción
        bloque_destino: '',
        codigo_busqueda: ''
    });
    const [retornoData, setRetornoData] = useState({
        id: '',
        estado_retorno: 'Operativo',
        evidencia_url: ''
    });

    useEffect(() => {
        if (selectedObra) {
            loadData();
            loadProductionUsers();
        }
    }, [selectedObra, activeTab]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const loadData = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            if (activeTab === 'inventario') {
                const { data } = await getEquipos(selectedObra.id);
                setEquipos(data || []);
            } else {
                const { data } = await getMovimientosPendientes(selectedObra.id);
                setMovimientos(data || []);
                const { data: eqs } = await getEquipos(selectedObra.id);
                setEquipos(eqs || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadProductionUsers = async () => {
        const { data } = await getProductionUsers();
        setProductionUsers(data || []);
    };

    const handleSaveEquipo = async () => {
        if (!selectedObra) return;
        try {
            if (currentEquipo.id) {
                await updateEquipo(currentEquipo.id, currentEquipo);
            } else {
                await createEquipo({ ...currentEquipo, obra_id: selectedObra.id } as any);
            }
            setShowEquipoModal(false);
            loadData();
        } catch (error) {
            alert('Error al guardar equipo');
        }
    };

    const handleDeleteEquipo = async (id: string) => {
        if (confirm('¿Eliminar equipo?')) {
            await deleteEquipo(id);
            loadData();
        }
    };

    const handleSalida = async () => {
        if (!selectedObra || !profile) return;
        try {
            const { error } = await registrarSalida({
                equipo_id: salidaData.equipo_id,
                nombre_solicitante: salidaData.nombre_solicitante,
                encargado_id: salidaData.encargado_id,
                usuario_autoriza_id: profile.id,
                bloque_destino: salidaData.bloque_destino,
                fecha_salida: new Date().toISOString(),
                fecha_retorno_estimada: null as any
            });

            if (error) {
                alert('Error al registrar salida: ' + error);
                return;
            }

            setShowSalidaModal(false);
            setSalidaData({
                equipo_id: '',
                nombre_solicitante: '',
                encargado_id: '',
                bloque_destino: '',
                codigo_busqueda: ''
            });
            loadData();
        } catch (error) {
            alert('Error al registrar salida');
        }
    };

    const handleRetorno = async () => {
        try {
            const { error } = await registrarRetorno(retornoData.id, {
                fecha_retorno_real: new Date().toISOString(),
                estado_retorno: retornoData.estado_retorno,
                evidencia_url: retornoData.evidencia_url
            });

            if (error) {
                alert('Error al registrar retorno: ' + error);
                return;
            }

            setShowRetornoModal(false);
            loadData();
        } catch (error) {
            alert('Error al registrar retorno');
        }
    };

    const isOverdue = (fechaEstimada: string) => {
        return new Date() > new Date(fechaEstimada);
    };

    const handleSearchCode = (code: string) => {
        setSalidaData(prev => ({ ...prev, codigo_busqueda: code }));
        const found = equipos.find(e => e.codigo === code && e.estado === 'Operativo');
        if (found) {
            setSalidaData(prev => ({ ...prev, equipo_id: found.id }));
        }
    };

    const overdueCount = movimientos.filter(m => isOverdue(m.fecha_retorno_estimada)).length;

    return (
        <div className="fade-in">
            <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-3">
                <h2 className="mb-0 text-center text-md-start">Gestión de Equipos</h2>
                <div className="text-muted">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>

            {overdueCount > 0 && activeTab === 'control' && (
                <Alert variant="danger" className="mb-4">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    <strong>Atención:</strong> Hay {overdueCount} equipos que no han sido devueltos y ya pasó la hora estimada (5:00 PM).
                </Alert>
            )}

            <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'inventario')} className="mb-4 custom-tabs">
                <Tab eventKey="inventario" title="Inventario de Activos">
                    <Card className="custom-card">
                        <Card.Body>
                            <div className="d-flex justify-content-between mb-3">
                                <h4>Listado de Equipos</h4>
                                <Button onClick={() => { setCurrentEquipo({ estado: 'Operativo' }); setShowEquipoModal(true); }}>
                                    + Nuevo Equipo
                                </Button>
                            </div>
                            <Table responsive hover className="table-borderless-custom">
                                <thead className="bg-light">
                                    <tr>
                                        <th>Código</th>
                                        <th>Nombre</th>
                                        <th>Estado</th>
                                        <th>Fecha Adq.</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {equipos.map(eq => (
                                        <tr key={eq.id}>
                                            <td>{eq.codigo}</td>
                                            <td>{eq.nombre}</td>
                                            <td>
                                                <Badge bg={eq.estado === 'Operativo' ? 'success' : eq.estado === 'En Uso' ? 'warning' : 'danger'}>
                                                    {eq.estado}
                                                </Badge>
                                            </td>
                                            <td>{eq.fecha_adquisicion}</td>
                                            <td>
                                                <Button size="sm" variant="outline-primary" className="me-1" onClick={() => { setCurrentEquipo(eq); setShowEquipoModal(true); }}>
                                                    <i className="bi bi-pencil"></i>
                                                </Button>
                                                <Button size="sm" variant="outline-danger" onClick={() => handleDeleteEquipo(eq.id)}>
                                                    <i className="bi bi-trash"></i>
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {equipos.length === 0 && (
                                        <tr><td colSpan={5} className="text-center">No hay equipos registrados.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Tab>

                <Tab eventKey="control" title="Control Diario (Salidas/Retornos)">
                    <Card className="custom-card">
                        <Card.Body>
                            <div className="d-flex justify-content-between mb-3">
                                <div>
                                    <h4>Movimientos Pendientes</h4>
                                    <p className="text-muted mb-0">Equipos actualmente en obra</p>
                                </div>
                                <Button variant="success" onClick={() => setShowSalidaModal(true)}>
                                    <i className="bi bi-box-arrow-right me-2"></i>
                                    Registrar Salida
                                </Button>
                            </div>
                            <Table responsive hover className="table-borderless-custom">
                                <thead className="bg-light">
                                    <tr>
                                        <th>Equipo</th>
                                        <th>Retirado Por</th>
                                        <th>Encargado (Obra)</th>
                                        <th>Fecha/Hora Salida</th>
                                        <th>Destino</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} className="text-center">Cargando...</td></tr>
                                    ) : movimientos.map(mov => {
                                        const overdue = isOverdue(mov.fecha_retorno_estimada);
                                        return (
                                            <tr key={mov.id} className={overdue ? 'table-danger' :
                                                // @ts-ignore
                                                mov.equipo?.estado === 'Inoperativo' ? 'table-warning' : ''}>
                                                <td>
                                                    <strong>{mov.equipo?.codigo}</strong> <br /> {mov.equipo?.nombre}
                                                </td>
                                                <td>
                                                    <div className="fw-bold">{mov.nombre_solicitante || mov.solicitante?.nombre || 'Solicitante no registrado'}</div>
                                                </td>
                                                <td>
                                                    {mov.encargado?.nombre || <span className="text-muted text-italic">No asignado</span>}
                                                </td>
                                                <td>
                                                    {new Date(mov.fecha_salida).toLocaleDateString()} <br />
                                                    <small className="text-muted">{new Date(mov.fecha_salida).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                                                </td>
                                                <td>{mov.bloque_destino}</td>
                                                <td>
                                                    <Button size="sm" variant="primary" onClick={() => { setRetornoData({ id: mov.id, estado_retorno: 'Operativo', evidencia_url: '' }); setShowRetornoModal(true); }}>
                                                        Registrar Retorno
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!loading && movimientos.length === 0 && (
                                        <tr><td colSpan={6} className="text-center">No hay equipos pendientes de retorno.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Tab>
            </Tabs>

            <Modal show={showEquipoModal} onHide={() => setShowEquipoModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{currentEquipo.id ? 'Editar' : 'Nuevo'} Equipo</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre</Form.Label>
                            <Form.Control
                                value={currentEquipo.nombre || ''}
                                onChange={e => setCurrentEquipo({ ...currentEquipo, nombre: e.target.value })}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Código Identificación</Form.Label>
                            <Form.Control
                                value={currentEquipo.codigo || ''}
                                onChange={e => setCurrentEquipo({ ...currentEquipo, codigo: e.target.value })}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Estado Inicial</Form.Label>
                            <Form.Select
                                value={currentEquipo.estado || 'Operativo'}
                                onChange={e => setCurrentEquipo({ ...currentEquipo, estado: e.target.value as any })}
                            >
                                <option value="Operativo">Operativo</option>
                                <option value="Inoperativo">Inoperativo</option>
                                <option value="En Taller">En Taller</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Fecha Adquisición</Form.Label>
                            <Form.Control
                                type="date"
                                value={currentEquipo.fecha_adquisicion || ''}
                                onChange={e => setCurrentEquipo({ ...currentEquipo, fecha_adquisicion: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowEquipoModal(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveEquipo}>Guardar</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showSalidaModal} onHide={() => setShowSalidaModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Registrar Salida de Equipo</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Escanear/Buscar Código</Form.Label>
                            <InputGroup>
                                <InputGroup.Text><i className="bi bi-qr-code"></i></InputGroup.Text>
                                <Form.Control
                                    placeholder="Ingrese código..."
                                    value={salidaData.codigo_busqueda}
                                    onChange={e => handleSearchCode(e.target.value)}
                                    autoFocus
                                />
                            </InputGroup>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Equipo</Form.Label>
                            <Form.Select
                                value={salidaData.equipo_id}
                                onChange={e => setSalidaData({ ...salidaData, equipo_id: e.target.value })}
                            >
                                <option value="">Seleccione Equipo...</option>
                                {equipos.filter(e => e.estado === 'Operativo').map(e => (
                                    <option key={e.id} value={e.id}>
                                        {e.codigo} - {e.nombre}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre de quien retira (Solicitante)</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Juan Perez (Capataz)"
                                value={salidaData.nombre_solicitante}
                                onChange={e => setSalidaData({ ...salidaData, nombre_solicitante: e.target.value })}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Encargado / Responsable (Producción)</Form.Label>
                            <Form.Select
                                value={salidaData.encargado_id}
                                onChange={e => setSalidaData({ ...salidaData, encargado_id: e.target.value })}
                            >
                                <option value="">Seleccione Encargado...</option>
                                {productionUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.nombre}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Bloque / Destino</Form.Label>
                            <Form.Control
                                value={salidaData.bloque_destino}
                                onChange={e => setSalidaData({ ...salidaData, bloque_destino: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowSalidaModal(false)}>Cancelar</Button>
                    <Button
                        variant="primary"
                        onClick={handleSalida}
                        disabled={!salidaData.equipo_id || !salidaData.nombre_solicitante}
                    >
                        Registrar Salida
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showRetornoModal} onHide={() => setShowRetornoModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Registrar Retorno</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Estado al Retornar</Form.Label>
                            <Form.Select
                                value={retornoData.estado_retorno}
                                onChange={e => setRetornoData({ ...retornoData, estado_retorno: e.target.value })}
                            >
                                <option value="Operativo">Operativo (Buen Estado)</option>
                                <option value="Inoperativo">Inoperativo (Dañado)</option>
                                <option value="En Taller">Necesita Reparación</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Evidencia / Comentarios</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                placeholder="Describa el estado o pegue URL de foto..."
                                value={retornoData.evidencia_url}
                                onChange={e => setRetornoData({ ...retornoData, evidencia_url: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowRetornoModal(false)}>Cancelar</Button>
                    <Button variant="success" onClick={handleRetorno}>Confirmar Retorno</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GestionEquipos;
