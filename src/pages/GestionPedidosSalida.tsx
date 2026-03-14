import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Table, Badge, Modal } from 'react-bootstrap';
import { getPedidosSalida, crearPedidoSalida, actualizarPedidoSalida, anularPedidoSalida, getAllInventario } from '../services/almacenService';
import { getTerceros } from '../services/tercerosService';
import { getAllBloquesByObra } from '../services/frentesService';
import { Inventario, Tercero, Bloque, PedidoSalida, PedidoSalidaDetalle } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import SearchableSelect from '../components/SearchableSelect';
import { FaPrint, FaEdit, FaBan, FaCartArrowDown, FaEraser } from 'react-icons/fa';
import { formatDisplayDate } from '../utils/dateUtils';
import ValePrintable from '../components/ValePrintable';
import { peekNextValeSalida } from '../services/almacenService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Spinner } from 'react-bootstrap';
import { FaFilePdf, FaDownload } from 'react-icons/fa';

interface SelectedItem {
    tipo: 'MATERIAL' | 'EQUIPO' | 'EPP';
    id: string; // The ID of the material/equipo/epp
    nombre: string;
    unidad: string;
    cantidad: number;
}

const GestionPedidosSalida: React.FC = () => {
    const { selectedObra, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [pedidos, setPedidos] = useState<PedidoSalida[]>([]);
    const [showFormModal, setShowFormModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [pedidoToPrint, setPedidoToPrint] = useState<{ pedido: PedidoSalida; items: PedidoSalidaDetalle[] } | null>(null);
    const [editingPedido, setEditingPedido] = useState<PedidoSalida | null>(null);

    // Printing
    const [printFormat, setPrintFormat] = useState<'A4' | 'TICKET'>('A4');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Form States
    const [itemsToAdd, setItemsToAdd] = useState<SelectedItem[]>([]);
    const [selectedTercero, setSelectedTercero] = useState('');
    const [selectedEncargado, setSelectedEncargado] = useState(profile?.id || '');
    const [solicitanteDni, setSolicitanteDni] = useState('');
    const [solicitanteNombre, setSolicitanteNombre] = useState('');
    const [selectedBloque, setSelectedBloque] = useState('');
    const [destino, setDestino] = useState('');

    // Masters
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [bloques, setBloques] = useState<Bloque[]>([]);

    // Item Selection
    const [selectedItem, setSelectedItem] = useState('');
    const [itemQuantity, setItemQuantity] = useState<number>(0);
    const [itemTipo, setItemTipo] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [nextVale, setNextVale] = useState<string>('');

    const loadData = async () => {
        if (!selectedObra || !profile) return;
        setLoading(true);
        try {
            let data = await getPedidosSalida(selectedObra.id);
            // For 'produccion' role, only show orders created by THIS user (Encargado)
            if (profile?.role === 'produccion') {
                data = data.filter(p => p.encargado_id === profile.id);
            }

            setPedidos(data);

            const inv = await getAllInventario(selectedObra.id);
            setInventario(inv || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadMaestros = async () => {
        if (!selectedObra) return;
        try {
            const [t, b, nv] = await Promise.all([
                getTerceros(selectedObra.id),
                getAllBloquesByObra(selectedObra.id),
                peekNextValeSalida(selectedObra.id)
            ]);

            setTerceros(t || []);

            // Clean duplicates and sort blocks naturally
            const uniqueBloques = Array.from(new Set((b || []).map(bl => bl.nombre_bloque)))
                .map(nombre => (b || []).find(bl => bl.nombre_bloque === nombre)!)
                .sort((a, b) => a.nombre_bloque.localeCompare(b.nombre_bloque, undefined, { numeric: true, sensitivity: 'base' }));

            setBloques(uniqueBloques);
            setNextVale(nv || '');
        } catch (err) {
            console.error("Error loading maestros:", err);
        }
    };

    useEffect(() => {
        loadData();
        loadMaestros();
    }, [selectedObra]);

    useRealtimeSubscription(() => loadData(), { table: 'pedidos_salida', event: '*' });

    // Clear PDF when modal closes or format changes
    useEffect(() => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
        }
    }, [showPrintModal, printFormat]);

    const handleGeneratePDF = async () => {
        const element = document.getElementById('pdf-capture-render');
        if (!element) return;

        setIsGeneratingPdf(true);
        try {
            await new Promise(r => setTimeout(r, 1000));

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: printFormat === 'TICKET' ? 400 : 794,
                onclone: (clonedDoc) => {
                    const el = clonedDoc.getElementById('pdf-capture-render');
                    if (el) {
                        el.style.opacity = '1';
                        el.style.display = 'block';
                        el.style.position = 'relative';
                        el.style.left = '0';
                    }
                }
            });

            const imgData = canvas.toDataURL('image/png', 1.0);
            let pdf: jsPDF;

            if (printFormat === 'TICKET') {
                const pdfWidth = 58;
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                pdf = new jsPDF({
                    unit: 'mm',
                    format: [pdfWidth, pdfHeight]
                });
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            } else {
                pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                
                const pages = element.querySelectorAll('.printable-vale');
                if (pages.length > 0) {
                    for (let i = 0; i < pages.length; i++) {
                        const pageCanvas = await html2canvas(pages[i] as HTMLElement, { 
                            scale: 2,
                            backgroundColor: '#ffffff',
                            windowWidth: 794
                        });
                        const pageImg = pageCanvas.toDataURL('image/png', 1.0);
                        if (i > 0) pdf.addPage();
                        pdf.addImage(pageImg, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
                    }
                } else {
                    const pdfContentHeight = (canvas.height * pdfWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdfContentHeight), undefined, 'FAST');
                }
            }

            const blob = pdf.output('blob');
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleOpenNew = () => {
        setEditingPedido(null);
        setItemsToAdd([]);
        setDestino('');
        setSelectedBloque('');

        // Default Tercero to CASA if it exists
        const casa = terceros.find(t => t.nombre_completo.toUpperCase().includes('CASA'));
        if (casa) setSelectedTercero(casa.id);
        else setSelectedTercero('');

        // Responsable fixed to current user profile
        setSelectedEncargado(profile?.id || '');
        setSolicitanteDni('');
        setSolicitanteNombre('');

        // Reload peek voucher
        if (selectedObra) peekNextValeSalida(selectedObra.id).then(setNextVale);

        setShowFormModal(true);
    };

    const handleEdit = (pedido: PedidoSalida) => {
        if (pedido.estado !== 'Pendiente') return alert("Solo se pueden editar pedidos en estado Pendiente");
        setEditingPedido(pedido);
        setDestino(pedido.destino_o_uso || '');
        setSelectedBloque(pedido.bloque_id || '');
        setSelectedTercero(pedido.tercero_id || '');
        setSelectedEncargado(pedido.encargado_id || '');
        setSolicitanteDni(pedido.solicitante_dni || '');
        setSolicitanteNombre(pedido.solicitante_nombre || '');

        const items: SelectedItem[] = pedido.detalles?.map(d => {
            let id = '';
            let nombre = '';
            let unidad = '';
            let tipo: any = 'MATERIAL';

            if (d.material) {
                id = d.material_id!;
                nombre = d.material.descripcion;
                unidad = d.material.unidad;
                tipo = 'MATERIAL';
            } else if (d.equipo) {
                id = d.equipo_id!;
                nombre = d.equipo.nombre;
                unidad = 'UND';
                tipo = 'EQUIPO';
            } else if (d.epp) {
                id = d.epp_id!;
                nombre = d.epp.descripcion;
                unidad = d.epp.unidad;
                tipo = 'EPP';
            }

            return { tipo, id, nombre, unidad, cantidad: d.cantidad_solicitada };
        }) || [];

        setItemsToAdd(items);
        setShowFormModal(true);
    };

    const handleAnular = async (pedidoId: string) => {
        if (!window.confirm("¿Está seguro de anular este pedido?")) return;
        try {
            await anularPedidoSalida(pedidoId);
            loadData();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleAddItem = () => {
        if (!selectedItem || itemQuantity <= 0) return;
        const inv = inventario.find(i => i.id === selectedItem);
        if (!inv) return;

        // Stock validation
        if (itemQuantity > inv.cantidad_actual) {
            alert(`Stock insuficiente para este ítem. Disponible: ${inv.cantidad_actual}`);
            return;
        }

        let itemId = '';
        let nombre = '';
        let unidad = '';
        let tipo: any = itemTipo;

        if (inv.material) {
            itemId = inv.material_id!;
            nombre = inv.material.descripcion;
            unidad = inv.material.unidad;
        } else if (inv.equipo) {
            itemId = inv.equipo_id!;
            nombre = inv.equipo.nombre;
            unidad = 'UND';
        } else if (inv.epp) {
            itemId = inv.epp_id!;
            nombre = inv.epp.descripcion;
            unidad = inv.epp.unidad;
        }

        // Avoid duplicates in the list
        const existing = itemsToAdd.find(i => i.id === itemId && i.tipo === tipo);
        if (existing) {
            alert("Este ítem ya ha sido agregado a la lista.");
            return;
        }

        setItemsToAdd([...itemsToAdd, { tipo, id: itemId, nombre, unidad, cantidad: itemQuantity }]);
        setSelectedItem('');
        setItemQuantity(0);
    };

    const handleSubmit = async () => {
        if (itemsToAdd.length === 0) return alert("Agregue al menos un ítem");
        if (!selectedBloque || !selectedTercero || !selectedEncargado || !solicitanteDni || !solicitanteNombre || !destino) return alert("Complete los campos obligatorios");

        setLoading(true);
        try {
            // CRITICAL: Final Real-Time Stock Validation
            const freshInv = await getAllInventario(selectedObra!.id);
            for (const item of itemsToAdd) {
                const invMatch = freshInv.find(i =>
                    (item.tipo === 'MATERIAL' && i.material_id === item.id) ||
                    (item.tipo === 'EQUIPO' && i.equipo_id === item.id) ||
                    (item.tipo === 'EPP' && i.epp_id === item.id)
                );

                if (!invMatch || invMatch.cantidad_actual < item.cantidad) {
                    throw new Error(`Stock insuficiente para ${item.nombre}. Disponible actualizado: ${invMatch?.cantidad_actual || 0}`);
                }
            }

            const items = itemsToAdd.map(i => ({
                material_id: i.tipo === 'MATERIAL' ? i.id : null,
                equipo_id: i.tipo === 'EQUIPO' ? i.id : null,
                epp_id: i.tipo === 'EPP' ? i.id : null,
                cantidad: i.cantidad
            }));

            if (editingPedido) {
                await actualizarPedidoSalida(editingPedido.id, destino, selectedBloque, selectedTercero, selectedEncargado, solicitanteDni, solicitanteNombre, items);
                alert("Pedido actualizado correctamente");
            } else {
                const res = await crearPedidoSalida(selectedObra!.id, solicitanteDni, solicitanteNombre, selectedEncargado, destino, selectedBloque, selectedTercero, items);
                alert(`Pedido enviado correctamente con el Vale: ${res.numero_vale}`);
            }

            setShowFormModal(false);
            loadData();
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = (pedido: PedidoSalida) => {
        setPedidoToPrint({ pedido, items: pedido.detalles || [] });
        setPdfUrl(null);
        setShowPrintModal(true);
    };

    return (
        <div className="fade-in">
            <div className="page-header mb-4 d-flex justify-content-between align-items-center">
                <div>
                    <h2>Gestión de Pedidos de Salida</h2>
                    <p className="text-muted">Solicite materiales y haga seguimiento a sus vales.</p>
                </div>
                <Button variant="primary" onClick={handleOpenNew} className="fw-bold">
                    <i className="bi bi-plus-lg me-2"></i> Nuevo Pedido
                </Button>
            </div>

            <Card className="custom-card shadow-sm border-0">
                <Card.Body className="p-0">
                    <Table hover responsive className="table-borderless-custom mb-0">
                        <thead>
                            <tr>
                                <th>Vale</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                                <th>Bloque</th>
                                <th>Destino</th>
                                <th className="text-end">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pedidos.map(p => (
                                <tr key={p.id}>
                                    <td className="fw-bold">{p.numero_vale}</td>
                                    <td>{formatDisplayDate(p.created_at)}</td>
                                    <td>
                                        <Badge bg={
                                            p.estado === 'Pendiente' ? 'info' :
                                                p.estado === 'Aprobado' ? 'success' :
                                                    p.estado === 'Parcial' ? 'warning' : 'danger'
                                        }>
                                            {p.estado === 'Aprobado' ? 'Atendido' : p.estado}
                                        </Badge>
                                    </td>
                                    <td>{p.bloque?.nombre_bloque}</td>
                                    <td className="text-truncate" style={{ maxWidth: '200px' }}>{p.destino_o_uso}</td>
                                    <td className="text-end">
                                        <Button
                                            variant="outline-secondary"
                                            size="sm"
                                            className="rounded-pill me-2 px-3 py-2"
                                            onClick={() => handlePrint(p)}
                                            title="Imprimir"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}
                                        >
                                            <FaPrint size={18} />
                                        </Button>
                                        <Button
                                            variant="outline-success"
                                            size="sm"
                                            className="rounded-pill me-2 px-3 py-2"
                                            onClick={() => handleEdit(p)}
                                            disabled={p.estado !== 'Pendiente'}
                                            title={p.estado === 'Pendiente' ? "Editar" : `No se puede editar un pedido ${p.estado}`}
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}
                                        >
                                            <FaEdit size={18} />
                                        </Button>
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            className="rounded-pill px-3 py-2"
                                            onClick={() => handleAnular(p.id)}
                                            disabled={p.estado !== 'Pendiente'}
                                            title={p.estado === 'Pendiente' ? "Anular" : `No se puede anular un pedido ${p.estado}`}
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}
                                        >
                                            <FaBan size={18} />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {pedidos.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="text-center py-4 text-muted">No tiene pedidos registrados.</td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>

            {/* Modal Form */}
            <Modal show={showFormModal} onHide={() => setShowFormModal(false)} size="lg" backdrop="static">
                <Modal.Header closeButton className="bg-light d-flex justify-content-between align-items-center">
                    <Modal.Title>{editingPedido ? 'Editar Pedido' : 'Nuevo Pedido de Material'}</Modal.Title>
                    {!editingPedido && nextVale && (
                        <div className="ms-auto me-3 text-end">
                            <Badge bg="dark" className="fs-6 px-3 py-2">Vale: {nextVale}</Badge>
                            <div className="text-muted small" style={{ fontSize: '0.7rem' }}>
                                (Número preliminar, se confirmará al guardar)
                            </div>
                        </div>
                    )}
                </Modal.Header>
                <Modal.Body>
                    <Row className="g-3 mb-4">
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Frente / Bloque <span className="text-danger">*</span></Form.Label>
                                <SearchableSelect
                                    options={bloques.map(b => ({ value: b.id, label: b.nombre_bloque }))}
                                    value={selectedBloque}
                                    onChange={(val) => setSelectedBloque(val.toString())}
                                    placeholder="Seleccione bloque..."
                                />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Autorizado por (Encargado)</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={profile?.nombre || ''}
                                    disabled
                                    className="bg-light fw-bold"
                                />
                            </Form.Group>
                        </Col>
                        <Col md={12}>
                            <h6 className="fw-bold mb-3 mt-2 border-bottom pb-2 text-primary"><i className="bi bi-person-badge me-2"></i>Datos del Obrero (Retirador)</h6>
                        </Col>
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">DNI <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="8 dígitos"
                                    value={solicitanteDni}
                                    maxLength={8}
                                    onChange={(e) => setSolicitanteDni(e.target.value.replace(/[^0-9]/g, ''))}
                                    isInvalid={solicitanteDni.length > 0 && solicitanteDni.length < 8}
                                    className="custom-input bg-white"
                                />
                                <Form.Control.Feedback type="invalid">
                                    Debe tener 8 dígitos
                                </Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                        <Col md={9}>
                            <Form.Group>
                                <Form.Label className="fw-bold small text-muted text-uppercase">Nombres Completos <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Nombres y Apellidos del obrero"
                                    value={solicitanteNombre}
                                    onChange={(e) => setSolicitanteNombre(e.target.value.toUpperCase())}
                                    className="custom-input bg-white"
                                />
                            </Form.Group>
                        </Col>

                        <Col md={12}>
                            <hr className="my-2" />
                        </Col>

                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Tercero / Empresa <span className="text-danger">*</span></Form.Label>
                                <SearchableSelect
                                    options={terceros.map(t => ({ value: t.id, label: t.nombre_completo }))}
                                    value={selectedTercero}
                                    onChange={(val) => setSelectedTercero(val.toString())}
                                    placeholder="Seleccione tercero..."
                                />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Destino / Uso <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Ej. Vaciado zapata 2"
                                    value={destino}
                                    onChange={(e) => setDestino(e.target.value)}
                                    className="custom-input"
                                />
                            </Form.Group>
                        </Col>
                    </Row>

                    <Card className="bg-light border-0 mb-3">
                        <Card.Body>
                            <h6 className="fw-bold mb-3">Agregar Items</h6>
                            <Row className="mb-3">
                                <Col>
                                    <div className="d-flex gap-2">
                                        {(['MATERIAL', 'EQUIPO', 'EPP'] as const).map(type => {
                                            const count = inventario.filter(i => {
                                                if (type === 'MATERIAL') return !!i.material_id;
                                                if (type === 'EQUIPO') return !!i.equipo_id;
                                                if (type === 'EPP') return !!i.epp_id;
                                                return false;
                                            }).length;
                                            return (
                                                <Button
                                                    key={type}
                                                    variant={itemTipo === type ? "primary" : "outline-primary"}
                                                    size="sm"
                                                    className="rounded-pill px-3"
                                                    onClick={() => {
                                                        setItemTipo(type);
                                                        setSelectedItem('');
                                                    }}
                                                >
                                                    {type} ({count})
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </Col>
                            </Row>
                            <Row className="g-2">
                                <Col md={8}>
                                    <SearchableSelect
                                        options={inventario
                                            .filter(i => {
                                                if (itemTipo === 'MATERIAL') return !!i.material_id;
                                                if (itemTipo === 'EQUIPO') return !!i.equipo_id;
                                                if (itemTipo === 'EPP') return !!i.epp_id;
                                                return false;
                                            })
                                            .map(i => ({
                                                value: i.id,
                                                label: i.material?.descripcion || i.equipo?.nombre || i.epp?.descripcion || 'Sin nombre',
                                                info: `Stock: ${i.cantidad_actual} ${i.material?.unidad || i.epp?.unidad || 'UND'}`
                                            }))}
                                        value={selectedItem}
                                        onChange={(val) => setSelectedItem(val.toString())}
                                        placeholder={`Buscar ${itemTipo.toLowerCase()}...`}
                                    />
                                </Col>
                                <Col md={2}>
                                    <Form.Control
                                        type="number"
                                        placeholder="Cant."
                                        value={itemQuantity || ''}
                                        onChange={(e) => setItemQuantity(Number(e.target.value))}
                                        className="text-center h-100"
                                    />
                                </Col>
                                <Col md={2}>
                                    <Button
                                        variant="outline-success"
                                        className="w-100 h-100 d-flex align-items-center justify-content-center rounded-pill border-2"
                                        onClick={handleAddItem}
                                        disabled={!selectedItem || itemQuantity <= 0}
                                        title="Agregar"
                                    >
                                        <FaCartArrowDown size={22} />
                                    </Button>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>

                    <Table size="sm" className="align-middle">
                        <thead className="small bg-white">
                            <tr>
                                <th>Item</th>
                                <th className="text-center">Cant.</th>
                                <th className="text-end"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToAdd.map((i, idx) => {
                                const currentStock = inventario.find(inv =>
                                    (i.tipo === 'MATERIAL' && inv.material_id === i.id) ||
                                    (i.tipo === 'EQUIPO' && inv.equipo_id === i.id) ||
                                    (i.tipo === 'EPP' && inv.epp_id === i.id)
                                )?.cantidad_actual || 0;

                                const isOverStock = i.cantidad > currentStock;

                                return (
                                    <tr key={idx} className={isOverStock ? 'table-danger-light' : ''}>
                                        <td>
                                            <div className="fw-bold">{i.nombre}</div>
                                            <div className="d-flex align-items-center gap-2">
                                                <Badge bg="secondary" className="small">{i.tipo}</Badge>
                                                <small className={`fw-bold ${isOverStock ? 'text-danger' : 'text-muted'}`}>
                                                    (Stock: {currentStock} {i.unidad})
                                                </small>
                                            </div>
                                            {isOverStock && (
                                                <div className="text-danger small fw-bold mt-1 animate-pulse">
                                                    <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                                    Stock insuficiente
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ width: '120px' }}>
                                            <Form.Control
                                                type="number"
                                                size="sm"
                                                value={i.cantidad}
                                                onChange={(e) => {
                                                    const newVal = Number(e.target.value);
                                                    const newItems = [...itemsToAdd];
                                                    newItems[idx].cantidad = newVal;
                                                    setItemsToAdd(newItems);
                                                }}
                                                className={`text-center fw-bold ${isOverStock ? 'border-danger text-danger' : ''}`}
                                            />
                                        </td>
                                        <td className="text-end">
                                            <Button
                                                variant="link"
                                                size="sm"
                                                className="text-danger p-0 delete-btn-hover"
                                                onClick={() => setItemsToAdd(itemsToAdd.filter((_, index) => index !== idx))}
                                                title="Eliminar ítem"
                                            >
                                                <FaEraser size={18} />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer className="bg-light">
                    <Button variant="outline-secondary" onClick={() => setShowFormModal(false)}>Cerrar</Button>
                    <Button
                        variant="primary"
                        disabled={loading || solicitanteDni.length !== 8 || itemsToAdd.some(i => {
                            const st = inventario.find(inv =>
                                (i.tipo === 'MATERIAL' && inv.material_id === i.id) ||
                                (i.tipo === 'EQUIPO' && inv.equipo_id === i.id) ||
                                (i.tipo === 'EPP' && inv.epp_id === i.id)
                            )?.cantidad_actual || 0;
                            return i.cantidad > st;
                        })}
                        onClick={handleSubmit}
                        className="px-4 fw-bold"
                    >
                        {loading ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Generando vale...
                            </>
                        ) : (editingPedido ? 'Actualizar Pedido' : 'Enviar Pedido')}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Print Modal */}
            <Modal show={showPrintModal} onHide={() => setShowPrintModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Vista Previa de Vale</Modal.Title>
                </Modal.Header>
                <Modal.Body className="bg-light p-0">
                    <div className="d-flex flex-column align-items-center p-3 no-print bg-white border-bottom gap-3 sticky-top shadow-sm" style={{ marginRight: 0 }}>
                        <div className="d-flex gap-2 align-items-center bg-light p-2 rounded-pill">
                            <Button
                                variant={printFormat === 'A4' ? 'primary' : 'outline-primary'}
                                size="sm"
                                className="rounded-pill px-4 border-0"
                                onClick={() => setPrintFormat('A4')}
                            >
                                <i className="bi bi-file-earmark-text me-2"></i> Formato A4
                            </Button>
                            <Button
                                variant={printFormat === 'TICKET' ? 'primary' : 'outline-primary'}
                                size="sm"
                                className="rounded-pill px-4 border-0"
                                onClick={() => setPrintFormat('TICKET')}
                            >
                                <i className="bi bi-tags me-2"></i> Formato Ticket (58mm)
                            </Button>
                        </div>

                        <div className="d-flex gap-2">
                            <Button
                                variant="success"
                                className="rounded-pill px-4 fw-bold shadow-sm"
                                onClick={handleGeneratePDF}
                                disabled={isGeneratingPdf}
                            >
                                {isGeneratingPdf ? (
                                    <><Spinner size="sm" className="me-2" /> Generando...</>
                                ) : (
                                    <><FaFilePdf className="me-2" /> Generar PDF</>
                                )}
                            </Button>

                            {pdfUrl ? (
                                <Button
                                    variant="primary"
                                    className="rounded-pill px-4 fw-bold shadow-sm"
                                    as="a"
                                    href={pdfUrl}
                                    download={`Vale_Salida_${pedidoToPrint?.pedido.numero_vale}.pdf`}
                                >
                                    <FaDownload className="me-2" /> Descargar PDF
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="preview-container p-4" style={{ backgroundColor: '#525659', minHeight: '600px', display: 'flex', justifyContent: 'center' }}>
                        {pdfUrl ? (
                            <iframe
                                src={pdfUrl}
                                title="PDF Preview"
                                style={{ width: '100%', height: '800px', border: 'none', borderRadius: '8px', backgroundColor: 'white' }}
                            />
                        ) : (
                            <div className="vale-preview-scroll" style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                                {pedidoToPrint && <ValePrintable pedido={pedidoToPrint.pedido} items={pedidoToPrint.items} format={printFormat} />}
                            </div>
                        )}
                    </div>

                    {/* Hidden area for PDF capture */}
                    <div id="pdf-capture-render" style={{
                        position: 'fixed',
                        left: '-9999px',
                        top: 0,
                        backgroundColor: 'white',
                        width: printFormat === 'TICKET' ? '120mm' : '210mm',
                        opacity: 0,
                        zIndex: -1
                    }}>
                        {pedidoToPrint && (
                            <ValePrintable
                                pedido={pedidoToPrint.pedido}
                                items={pedidoToPrint.items}
                                format={printFormat}
                                isCapturing={true}
                            />
                        )}
                    </div>
                </Modal.Body>
            </Modal>
            <style>{`
                .table-danger-light {
                    background-color: rgba(220, 53, 69, 0.05);
                }
                .delete-btn-hover {
                    transition: all 0.2s;
                    border-radius: 50%;
                }
                .delete-btn-hover:hover {
                    background-color: rgba(220, 53, 69, 0.1);
                    transform: scale(1.1);
                }
                .animate-pulse {
                    animation: pulse-red 2s infinite;
                }
                @keyframes pulse-red {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default GestionPedidosSalida;
