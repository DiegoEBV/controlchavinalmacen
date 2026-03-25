import React, { useState, useEffect } from 'react';
import { Container, Button, Table, Form, Modal, Spinner, Alert, Tabs, Tab } from 'react-bootstrap';
import { FaPlus, FaSignOutAlt, FaSignInAlt, FaExclamationTriangle, FaCheckCircle, FaTools, FaCarSide } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { 
    getEquiposByObra, 
    EquipoEstado, 
    registrarMovimientoSalida, 
    registrarMovimientoRetorno, 
    registrarCargaInicialEquipo 
} from '../services/equiposMovimientoService';
import { supabase } from '../config/supabaseClient'; 

const GestionMovimientoEquipos: React.FC = () => {
    const { selectedObra, user } = useAuth();
    
    // Notification states
    const [globalMessage, setGlobalMessage] = useState<{text: string, type: 'success' | 'danger'} | null>(null);

    const [equipos, setEquipos] = useState<EquipoEstado[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('estado');

    // Selectores data
    const [usuarios, setUsuarios] = useState<{value: string, label: string}[]>([]);
    const [catalogo, setCatalogo] = useState<{id: string, nombre: string, marca: string}[]>([]);

    // Modals state
    const [showCargaInicial, setShowCargaInicial] = useState(false);
    const [showSalida, setShowSalida] = useState(false);
    const [showRetorno, setShowRetorno] = useState(false);
    const [selectedEquipo, setSelectedEquipo] = useState<EquipoEstado | null>(null);

    // Form states
    const [formDataCarga, setFormDataCarga] = useState({ nombre: '', codigo: '', marca: '' });
    const [formDataSalida, setFormDataSalida] = useState({ 
        encargadoId: '', 
        bloqueDestino: '', 
        fechaRetornoEstimada: new Date().toISOString().split('T')[0] + 'T18:00', // Default today 18:00
        nombreSolicitante: '' 
    });
    const [formDataRetorno, setFormDataRetorno] = useState({ estadoRetorno: 'Operativo' });

    useEffect(() => {
        if (selectedObra) {
            fetchData();
            fetchSelectData();
        }
    }, [selectedObra]);

    const fetchData = async () => {
        setLoading(true);
        const data = await getEquiposByObra(selectedObra!.id);
        setEquipos(data);
        setLoading(false);
    };

    const fetchSelectData = async () => {
        // Fetch users for encargados
        const { data: usersData } = await supabase.from('profiles').select('id, nombre, role').neq('role', 'admin');
        if (usersData) {
            setUsuarios(usersData.map(u => ({ value: u.id, label: `${u.nombre} (${u.role})` })));
        }

        // Fetch catalog (equipos where es_unidad_fisica is false or null)
        const { data: catalogData } = await supabase
            .from('equipos')
            .select('id, nombre, marca')
            .or('es_unidad_fisica.eq.false,es_unidad_fisica.is.null'); // Safety if column added but defaults not applied
        
        if (catalogData) {
            setCatalogo(catalogData);
        }
    };

    const showNotification = (text: string, type: 'success' | 'error') => {
        setGlobalMessage({ text, type: type === 'success' ? 'success' : 'danger' });
        setTimeout(() => setGlobalMessage(null), 3000);
    };

    const handleCargaInicial = async (e: React.FormEvent) => {
        e.preventDefault();
        const { success, error } = await registrarCargaInicialEquipo(
            selectedObra!.id, 
            formDataCarga.nombre, 
            formDataCarga.codigo, 
            formDataCarga.marca
        );

        if (success) {
            showNotification('Equipo registrado exitosamente', 'success');
            setShowCargaInicial(false);
            setFormDataCarga({ nombre: '', codigo: '', marca: '' });
            fetchData();
        } else {
            showNotification(error || 'Error al registrar equipo', 'error');
        }
    };

    const handleSalida = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEquipo) return;

        // Convertir la fecha local a ISO UTC
        const isoDate = new Date(formDataSalida.fechaRetornoEstimada).toISOString();

        const { success, error } = await registrarMovimientoSalida(
            selectedEquipo.id,
            user!.id,
            formDataSalida.bloqueDestino,
            isoDate,
            formDataSalida.nombreSolicitante || '',
            formDataSalida.encargadoId
        );

        if (success) {
            showNotification('Salida registrada', 'success');
            setShowSalida(false);
            setSelectedEquipo(null);
            fetchData();
        } else {
            showNotification(error || 'Error al registrar salida', 'error');
        }
    };

    const handleRetorno = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEquipo?.movimiento_id) return;

        const { success, error } = await registrarMovimientoRetorno(
            selectedEquipo.movimiento_id,
            formDataRetorno.estadoRetorno
        );

        if (success) {
            showNotification('Retorno registrado. Equipo nuevamente operativo.', 'success');
            setShowRetorno(false);
            setSelectedEquipo(null);
            fetchData();
        } else {
            showNotification(error || 'Error al registrar retorno', 'error');
        }
    };

    const getStatusBadge = (color: string) => {
        switch (color) {
            case 'VERDE': return <div className="badge-premium badge-verde"><FaCheckCircle /> Operativo</div>;
            case 'AMARILLO': return <div className="badge-premium badge-amarillo"><FaTools /> Taller</div>;
            case 'ROJO': return <div className="badge-premium badge-rojo"><FaExclamationTriangle /> Retraso</div>;
            case 'AZUL': return <div className="badge-premium badge-azul"><FaCarSide /> En Uso</div>;
            default: return <div className="badge-premium badge-gris">{color}</div>;
        }
    };


    return (
        <Container fluid className="p-4 fade-in">
            {globalMessage && (
                <Alert variant={globalMessage.type} onClose={() => setGlobalMessage(null)} dismissible className="shadow-sm border-0 mb-4">
                    {globalMessage.text}
                </Alert>
            )}
            
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="mb-0 fw-bold text-dark">🛠️ Gestión de Equipos Menores</h2>
                    <p className="text-muted mb-0">Control de ubicación y estado de herramientas en obra</p>
                </div>
                <div style={{ width: '300px' }}>
                    {/* El selector de obra ya está en el Layout/Navigation, pero si se necesitara uno local se pondría aquí */}
                </div>
            </div>

            <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'estado')} className="custom-tabs mb-4">
                <Tab eventKey="estado" title="Control Actual (Semáforos)">
                    <div className="custom-card">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h5 className="fw-bold m-0 text-primary">Estado Actual de Equipos</h5>
                            <div className="d-flex gap-2">
                                <Button variant="primary" size="sm" onClick={() => setShowCargaInicial(true)} className="d-flex align-items-center">
                                    <FaPlus className="me-2" /> Nuevo Equipo (Existente)
                                </Button>
                                <Button variant="outline-primary" size="sm" onClick={fetchData} className="d-flex align-items-center">
                                    Actualizar
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
                        ) : (
                            <div className="table-responsive">
                                <Table hover className="table-borderless-custom align-middle mb-0">
                                    <thead>
                                        <tr>
                                            <th className="ps-4">Semáforo</th>
                                            <th>Código</th>
                                            <th>Equipo / Marca</th>
                                            <th>Encargado Actual</th>
                                            <th>Bloque/Destino</th>
                                            <th>Retorno Estimado</th>
                                            <th className="text-end pe-4">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {equipos.map(eq => (
                                            <tr key={eq.id}>
                                                <td className="ps-4">{getStatusBadge(eq.color_alerta)}</td>
                                                <td><span className="fw-bold text-dark">{eq.codigo}</span></td>
                                                <td>
                                                    <div className="d-flex flex-column">
                                                        <span className="fw-semibold">{eq.nombre}</span>
                                                        <small className="text-muted">{eq.marca}</small>
                                                    </div>
                                                </td>
                                                <td>{eq.encargado_nombre || <span className="text-muted">-</span>}</td>
                                                <td>{eq.bloque_destino || <span className="text-muted">-</span>}</td>
                                                <td>
                                                    {eq.fecha_retorno_estimada ? (
                                                        <div className="d-flex flex-column" style={{ fontSize: '0.85rem' }}>
                                                            <span>{new Date(eq.fecha_retorno_estimada).toLocaleDateString()}</span>
                                                            <span className="text-muted">{new Date(eq.fecha_retorno_estimada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    ) : <span className="text-muted">-</span>}
                                                </td>
                                                <td className="text-end pe-4">
                                                    <div className="d-flex justify-content-end gap-2">
                                                        {eq.color_alerta === 'VERDE' && (
                                                            <Button variant="outline-primary" size="sm" 
                                                                className="px-3 d-flex align-items-center"
                                                                onClick={() => { setSelectedEquipo(eq); setShowSalida(true); }}>
                                                                <FaSignOutAlt className="me-2" /> Asignar
                                                            </Button>
                                                        )}
                                                        {(eq.color_alerta === 'AZUL' || eq.color_alerta === 'ROJO') && (
                                                            <Button variant="outline-success" size="sm"
                                                                className="px-3 d-flex align-items-center"
                                                                onClick={() => { setSelectedEquipo(eq); setShowRetorno(true); }}>
                                                                <FaSignInAlt className="me-2" /> Retornar
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {equipos.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="text-center py-5">
                                                    <div className="py-4">
                                                        <div className="mb-3" style={{ fontSize: '2.5rem', filter: 'grayscale(1)', opacity: 0.5 }}>🛠️</div>
                                                        <p className="text-muted fw-medium">No hay equipos registrados en esta obra aún.</p>
                                                        <small className="text-muted">Usa el botón "Nuevo Equipo" para empezar el control.</small>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>
                        )}
                    </div>
                </Tab>
                <Tab eventKey="historial" title="Historial Completo">
                    <div className="custom-card">
                        <Alert variant="info" className="bg-light border-0 py-4 text-center mb-0">
                            <h5 className="fw-bold mb-2">Próximamente</h5>
                            <p className="text-muted mb-0">El historial detallado de movimientos se está construyendo para ofrecer reportes analíticos.</p>
                        </Alert>
                    </div>
                </Tab>
            </Tabs>

            {/* Modal de Carga Inicial */}
            <Modal show={showCargaInicial} onHide={() => setShowCargaInicial(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Registrar Equipo Existente</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCargaInicial}>
                    <Modal.Body>
                        <Alert variant="info" className="p-2 mb-3">Usa este formulario para registrar equipos que ya están físicamente en la obra.</Alert>
                        <Form.Group className="mb-3">
                            <Form.Label>Código Interno de Obra (Único)</Form.Label>
                            <Form.Control required type="text" placeholder="Ej: TAL-001" 
                                value={formDataCarga.codigo} onChange={e => setFormDataCarga({...formDataCarga, codigo: e.target.value.toUpperCase()})} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre del Equipo (Catálogo)</Form.Label>
                            <Form.Select required 
                                value={formDataCarga.nombre} 
                                onChange={e => {
                                    const selected = catalogo.find(c => c.nombre === e.target.value);
                                    setFormDataCarga({
                                        ...formDataCarga, 
                                        nombre: e.target.value,
                                        marca: selected?.marca || ''
                                    });
                                }}>
                                <option value="">Seleccione el equipo del catálogo...</option>
                                {catalogo.map(c => (
                                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                                ))}
                            </Form.Select>
                            <Form.Text className="text-muted small">Lista basada en los equipos registrados para compra.</Form.Text>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Marca/Modelo (Opcional)</Form.Label>
                            <Form.Control type="text" 
                                value={formDataCarga.marca} onChange={e => setFormDataCarga({...formDataCarga, marca: e.target.value})} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowCargaInicial(false)}>Cerrar</Button>
                        <Button variant="primary" type="submit">Registrar Equipo</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modal de Asignación / Salida */}
            <Modal show={showSalida} onHide={() => {setShowSalida(false); setSelectedEquipo(null)}}>
                <Modal.Header closeButton className="bg-light">
                    <Modal.Title>Asignar Equipo a Producción</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSalida}>
                    <Modal.Body>
                        {selectedEquipo && (
                            <div className="mb-3 p-3 bg-white border rounded">
                                <strong>Equipo:</strong> {selectedEquipo.codigo} - {selectedEquipo.nombre}
                            </div>
                        )}
                        <Form.Group className="mb-3">
                            <Form.Label>Encargado (Responsable)</Form.Label>
                            <Form.Select required 
                                value={formDataSalida.encargadoId} 
                                onChange={e => setFormDataSalida({...formDataSalida, encargadoId: e.target.value})}>
                                <option value="">Seleccione un encargado...</option>
                                {usuarios.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Bloque / Destino / ID Actividad</Form.Label>
                            <Form.Control required type="text" placeholder="¿Dónde se usará?"
                                value={formDataSalida.bloqueDestino} 
                                onChange={e => setFormDataSalida({...formDataSalida, bloqueDestino: e.target.value})} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Fecha/Hora Estimada de Retorno</Form.Label>
                            <Form.Control required type="datetime-local" 
                                value={formDataSalida.fechaRetornoEstimada} 
                                onChange={e => setFormDataSalida({...formDataSalida, fechaRetornoEstimada: e.target.value})} />
                            <Form.Text className="text-muted">Se usa para activar la alerta roja si no es devuelto a tiempo.</Form.Text>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowSalida(false)}>Cancelar</Button>
                        <Button variant="primary" type="submit">Confirmar Asignación</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modal de Retorno */}
            <Modal show={showRetorno} onHide={() => {setShowRetorno(false); setSelectedEquipo(null)}}>
                <Modal.Header closeButton className="bg-light">
                    <Modal.Title>Registrar Retorno de Equipo</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleRetorno}>
                    <Modal.Body>
                        {selectedEquipo && (
                            <div className="mb-3 p-3 bg-white border rounded">
                                <strong>Equipo devuelto:</strong> {selectedEquipo.codigo} - {selectedEquipo.nombre} <br/>
                                <small>Encargado saliente: {selectedEquipo.encargado_nombre}</small>
                            </div>
                        )}
                        <Form.Group className="mb-3">
                            <Form.Label>Estado de Retorno</Form.Label>
                            <Form.Select required 
                                value={formDataRetorno.estadoRetorno} 
                                onChange={e => setFormDataRetorno({...formDataRetorno, estadoRetorno: e.target.value})}>
                                <option value="Operativo">Buen estado (Operativo)</option>
                                <option value="Inoperativo">Dañado (Inoperativo)</option>
                                <option value="Mantenimiento">Requiere Mantenimiento</option>
                            </Form.Select>
                            <Form.Text className="text-muted">
                                Si selecciona "Dañado", el equipo se bloqueará y pasará al estado "Amarillo".
                            </Form.Text>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowRetorno(false)}>Cancelar</Button>
                        <Button variant="success" type="submit">Confirmar Retorno</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </Container>
    );
};

export default GestionMovimientoEquipos;
