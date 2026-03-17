import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { getAllInventario, registrarSalida, registrarEntradaDirectaV3, getNextValeSalida, registrarDevolucionHistorial } from '../services/almacenService';
import { Inventario } from '../types';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { FaExchangeAlt } from 'react-icons/fa';

const DevolucionesAlmacen: React.FC = () => {
    const { selectedObra, profile } = useAuth();
    
    const [loading, setLoading] = useState(false);
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [lastError, setLastError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string>('');

    // Salida State
    const [selectedTypeSalida, setSelectedTypeSalida] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedItemSalida, setSelectedItemSalida] = useState('');
    const [cantidadSalida, setCantidadSalida] = useState<number>(0);
    const [motivo, setMotivo] = useState('');

    // Entrada State (Cambio)
    const [esCambio, setEsCambio] = useState(false);
    const [selectedTypeEntrada, setSelectedTypeEntrada] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedItemEntrada, setSelectedItemEntrada] = useState('');
    const [cantidadEntrada, setCantidadEntrada] = useState<number>(0);

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setInventario([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedObra]);

    const loadData = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            const inventarioData = await getAllInventario(selectedObra.id);
            setInventario(inventarioData || []);
        } catch (err: any) {
            console.error("Error loading inventario:", err);
            setLastError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const handleRegister = async () => {
        if (!selectedObra || !profile) return;
        if (!selectedItemSalida || cantidadSalida <= 0 || !motivo) {
            return alert("Complete los datos de salida obligatorios.");
        }
        if (esCambio && (!selectedItemEntrada || cantidadEntrada <= 0)) {
            return alert("Complete los datos del ítem de reemplazo.");
        }

        const invSalida = inventario.find(i => i.id === selectedItemSalida);
        if (!invSalida) return;

        if (cantidadSalida > invSalida.cantidad_actual) {
            return alert(`Stock insuficiente. Solo hay ${invSalida.cantidad_actual} disponibles para devolver.`);
        }

        let idSalidaReal = '';
        if (invSalida.material) idSalidaReal = invSalida.material_id!;
        else if (invSalida.equipo) idSalidaReal = invSalida.equipo_id!;
        else if (invSalida.epp) idSalidaReal = invSalida.epp_id!;

        let invEntrada: Inventario | undefined = undefined;
        let idEntradaReal = '';
        if (esCambio) {
            invEntrada = inventario.find(i => i.id === selectedItemEntrada);
            if (!invEntrada) return;
            if (invEntrada.material) idEntradaReal = invEntrada.material_id!;
            else if (invEntrada.equipo) idEntradaReal = invEntrada.equipo_id!;
            else if (invEntrada.epp) idEntradaReal = invEntrada.epp_id!;
        }

        setLoading(true);
        setLastError(null);
        setSuccessMsg('');

        let valeDeSalida = '';
        let vintarDeEntrada = null;

        try {
            // 1. Get real voucher
            valeDeSalida = await getNextValeSalida(selectedObra.id);

            // 2. Perform Salida
            const stringMotivo = `DEVOLUCIÓN: ${motivo} - Ref Cambio: ${esCambio ? idEntradaReal : 'NO'}`;
            
            await registrarSalida(
                selectedTypeSalida,
                idSalidaReal,
                cantidadSalida,
                stringMotivo,
                profile.nombre || 'Usuario Desconocido',
                selectedObra.id,
                {
                    numeroVale: valeDeSalida,
                }
            );

            // 3. Perform Entrada if exchange (with Auto-Retry)
            if (esCambio) {
                const entradaItems = [{
                    material_id: selectedTypeEntrada === 'MATERIAL' ? idEntradaReal : null,
                    equipo_id: selectedTypeEntrada === 'EQUIPO' ? idEntradaReal : null,
                    epp_id: selectedTypeEntrada === 'EPP' ? idEntradaReal : null,
                    cantidad: cantidadEntrada,
                    req_id: null,
                    det_req_id: null,
                    detalle_sc_id: null
                }];

                let success = false;
                let attempts = 0;
                let lastEntradaError = null;

                while (attempts < 3 && !success) {
                    try {
                        const res = await registrarEntradaDirectaV3(entradaItems, `DEVOLUCION-REEMPLAZO (${valeDeSalida})`, selectedObra.id);
                        vintarDeEntrada = res?.vintar_code || 'Registrado';
                        success = true;
                    } catch (err: any) {
                        lastEntradaError = err;
                        attempts++;
                        console.warn(`Entrada failed. Attempt ${attempts}/3. Retrying...`);
                        if (attempts < 3) await delay(1000);
                    }
                }

                if (!success) {
                    throw new Error(`La SALIDA (${valeDeSalida}) fue procesada correctamente, pero ocurrió un error crítico al registrar la ENTRADA de reemplazo después de 3 intentos. La entrada de reemplazo quedó pendiente de registro manual. Error: ${lastEntradaError?.message}`);
                }
            }

            // 4. Audit History
            try {
                await registrarDevolucionHistorial(
                    selectedObra.id,
                    profile.id,
                    selectedTypeSalida,
                    idSalidaReal,
                    cantidadSalida,
                    motivo,
                    esCambio,
                    valeDeSalida,
                    esCambio ? selectedTypeEntrada : undefined,
                    esCambio ? idEntradaReal : undefined,
                    esCambio ? cantidadEntrada : undefined,
                    vintarDeEntrada
                );
            } catch (auditErr) {
                console.warn("Could not save audit log for devolucion, but transaction succeeded:", auditErr);
            }

            setSuccessMsg(`¡Devolución registrada correctamente! ${valeDeSalida} ${vintarDeEntrada ? ` / Entrada: ${vintarDeEntrada}` : ''}`);
            
            // Clear Form
            setSelectedItemSalida('');
            setCantidadSalida(0);
            setMotivo('');
            setEsCambio(false);
            setSelectedItemEntrada('');
            setCantidadEntrada(0);
            loadData(); // reload inventory

        } catch (err: any) {
            setLastError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const getOptions = (type: string) => {
        return inventario
            .filter(i => {
                if (type === 'MATERIAL') return !!(i.material_id || i.material);
                if (type === 'EQUIPO') return !!(i.equipo_id || i.equipo);
                if (type === 'EPP') return !!(i.epp_id || i.epp);
                return false;
            })
            .map(i => ({
                value: i.id,
                label: i.material?.descripcion || i.equipo?.nombre || i.epp?.descripcion || 'Desconocido',
                info: `Stock: ${i.cantidad_actual}`
            }));
    };

    return (
        <div className="fade-in container-fluid">
            <div className="page-header mb-4">
                <h2>Gestión de Devoluciones y Cambios</h2>
                <p className="text-muted">Retorna materiales defectuosos o no conformes y gestiona sus reemplazos.</p>
            </div>

            {successMsg && <Alert variant="success" className="shadow-sm bounce-in">{successMsg}</Alert>}
            {lastError && <Alert variant="danger" className="shadow-sm bounce-in">{lastError}</Alert>}

            <Card className="custom-card shadow-sm border-0 mb-4">
                <Card.Header className="bg-light border-0 py-3">
                    <h5 className="mb-0 fw-bold text-dark">
                        <i className="bi bi-box-arrow-left me-2 text-danger"></i>
                        1. Ítem a Devolver (Salida)
                    </h5>
                </Card.Header>
                <Card.Body className="p-4">
                    <Row className="g-3">
                        <Col md={12}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Motivo de Devolución <span className="text-danger">*</span></Form.Label>
                                <Form.Control 
                                    type="text" 
                                    placeholder="Ej. Material no cumple especificaciones técnicas..." 
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                />
                            </Form.Group>
                        </Col>
                        
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Tipo de Ítem</Form.Label>
                                <Form.Select 
                                    value={selectedTypeSalida}
                                    onChange={(e) => {
                                        setSelectedTypeSalida(e.target.value as any);
                                        setSelectedItemSalida('');
                                    }}
                                >
                                    <option value="MATERIAL">Material</option>
                                    <option value="EQUIPO">Equipo</option>
                                    <option value="EPP">EPP</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Seleccionar Ítem <span className="text-danger">*</span></Form.Label>
                                <SearchableSelect
                                    options={getOptions(selectedTypeSalida)}
                                    value={selectedItemSalida}
                                    onChange={(val) => setSelectedItemSalida(val.toString())}
                                    placeholder={`Buscar ${selectedTypeSalida.toLowerCase()}...`}
                                />
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Cantidad <span className="text-danger">*</span></Form.Label>
                                <Form.Control 
                                    type="number" 
                                    step="any"
                                    min={0}
                                    value={cantidadSalida || ''}
                                    onChange={(e) => setCantidadSalida(Number(e.target.value))}
                                    isInvalid={selectedItemSalida ? cantidadSalida > (inventario.find(i => i.id === selectedItemSalida)?.cantidad_actual || 0) : false}
                                />
                                <Form.Control.Feedback type="invalid">
                                    Excede el stock actual.
                                </Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className={`custom-card shadow-sm border-0 mb-4 transition-all ${esCambio ? 'border-primary' : ''}`}>
                <Card.Header className="bg-light border-0 py-3 d-flex justify-content-between align-items-center">
                    <h5 className="mb-0 fw-bold text-dark">
                        <i className="bi bi-box-arrow-in-right me-2 text-success"></i>
                        2. Ítem de Reemplazo (Entrada)
                    </h5>
                    <Form.Check 
                        type="switch"
                        id="es-cambio-switch"
                        label={<span className="fw-bold text-primary">Es Cambio / Reemplazo</span>}
                        checked={esCambio}
                        onChange={(e) => setEsCambio(e.target.checked)}
                    />
                </Card.Header>
                {esCambio && (
                    <Card.Body className="p-4 bg-white fade-in">
                        <Alert variant="info" className="py-2 small">
                            <i className="bi bi-info-circle me-2"></i>
                            El ítem de reemplazo ingresará al almacén simulando una Entrada Directa.
                        </Alert>
                        <Row className="g-3">
                            <Col md={3}>
                                <Form.Group>
                                    <Form.Label className="fw-bold small text-muted text-uppercase">Tipo de Ítem</Form.Label>
                                    <Form.Select 
                                        value={selectedTypeEntrada}
                                        onChange={(e) => {
                                            setSelectedTypeEntrada(e.target.value as any);
                                            setSelectedItemEntrada('');
                                        }}
                                    >
                                        <option value="MATERIAL">Material</option>
                                        <option value="EQUIPO">Equipo</option>
                                        <option value="EPP">EPP</option>
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                            <Col md={6}>
                                <Form.Group>
                                    <Form.Label className="fw-bold small text-muted text-uppercase">Seleccionar Ítem <span className="text-danger">*</span></Form.Label>
                                    <SearchableSelect
                                        options={getOptions(selectedTypeEntrada)}
                                        value={selectedItemEntrada}
                                        onChange={(val) => setSelectedItemEntrada(val.toString())}
                                        placeholder={`Buscar ${selectedTypeEntrada.toLowerCase()}...`}
                                    />
                                    <Form.Text className="text-muted small">Seleccione el ítem que entrará como reemplazo.</Form.Text>
                                </Form.Group>
                            </Col>
                            <Col md={3}>
                                <Form.Group>
                                    <Form.Label className="fw-bold small text-muted text-uppercase">Cantidad <span className="text-danger">*</span></Form.Label>
                                    <Form.Control 
                                        type="number" 
                                        step="any"
                                        min={0}
                                        value={cantidadEntrada || ''}
                                        onChange={(e) => setCantidadEntrada(Number(e.target.value))}
                                    />
                                </Form.Group>
                            </Col>
                        </Row>
                    </Card.Body>
                )}
            </Card>

            <div className="d-flex justify-content-end mb-5">
                <Button 
                    variant="primary" 
                    size="lg" 
                    className="px-5 fw-bold rounded-pill"
                    onClick={handleRegister}
                    disabled={loading || cantidadSalida <= 0 || !selectedItemSalida || !motivo}
                >
                    {loading ? (
                        <><Spinner size="sm" className="me-2"/> Procesando Devolución...</>
                    ) : (
                        <><FaExchangeAlt className="me-2" /> Registrar Devolución</>
                    )}
                </Button>
            </div>
        </div>
    );
};

export default DevolucionesAlmacen;
