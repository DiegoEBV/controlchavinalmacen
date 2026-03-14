import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Alert, Table, Spinner, Badge, Modal, Offcanvas } from 'react-bootstrap';
import { FixedSizeList as List } from 'react-window';
import { supabase } from '../config/supabaseClient';
import { getMovimientos, getAllInventario, getPedidosSalida, aprobarPedidoSalida, registrarSalida, getNextValeSalida, peekNextValeSalida } from '../services/almacenService';
import { getTerceros } from '../services/tercerosService';
import { getAllBloquesByObra } from '../services/frentesService';
import { Inventario, MovimientoAlmacen, Tercero, Bloque, PedidoSalida, PedidoSalidaDetalle } from '../types';
import { FaPrint, FaEye, FaEraser, FaCartArrowDown, FaFilePdf, FaDownload } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import PaginationControls from '../components/PaginationControls';
import SearchableSelect from '../components/SearchableSelect';
import { formatDisplayDate } from '../utils/dateUtils';
import ValePrintable from '../components/ValePrintable';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface SelectedItem {
    invId: string;
    tipo: 'MATERIAL' | 'EQUIPO' | 'EPP';
    id: string; // The ID of the material/equipo/epp
    nombre: string;
    unidad: string;
    cantidad: number;
}

const SalidasAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();

    const [loading, setLoading] = useState(false);
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [historial, setHistorial] = useState<MovimientoAlmacen[]>([]);
    const [pedidosPendientes, setPedidosPendientes] = useState<PedidoSalida[]>([]);
    const [totalHistory, setTotalHistory] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    // Form States
    const [itemsToAdd, setItemsToAdd] = useState<SelectedItem[]>([]);
    const [solicitante, setSolicitante] = useState('');
    const [solicitanteDni, setSolicitanteDni] = useState('');
    const [destino, setDestino] = useState('');
    const [numeroVale, setNumeroVale] = useState('');
    const [selectedTercero, setSelectedTercero] = useState('');
    const [selectedEncargado, setSelectedEncargado] = useState('');
    const [selectedBloque, setSelectedBloque] = useState('');

    // Masters
    const [terceros, setTerceros] = useState<Tercero[]>([]);
    const [bloques, setBloques] = useState<Bloque[]>([]);
    const [encargados, setEncargados] = useState<{ id: string, nombre: string }[]>([]);

    // Item Selection
    const [selectedType, setSelectedType] = useState<'MATERIAL' | 'EQUIPO' | 'EPP'>('MATERIAL');
    const [selectedItem, setSelectedItem] = useState('');
    const [itemQuantity, setItemQuantity] = useState<number>(0);

    // Pagination/Filters
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [searchTerm] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Printing
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [pedidoToPrint, setPedidoToPrint] = useState<{ pedido: PedidoSalida; items: PedidoSalidaDetalle[] } | null>(null);
    const [printFormat, setPrintFormat] = useState<'A4' | 'TICKET'>('A4');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showPendingDrawer, setShowPendingDrawer] = useState(false);

    // Mode: Atender Pedido
    const [selectedPedido, setSelectedPedido] = useState<PedidoSalida | null>(null);

    const loadData = async () => {
        if (!selectedObra) return;
        setLoading(true);
        setLastError(null);
        try {
            const [inventarioData, movesData, pedidosData] = await Promise.all([
                getAllInventario(selectedObra.id),
                getMovimientos(selectedObra.id, currentPage, pageSize, searchTerm, 'SALIDA'),
                getPedidosSalida(selectedObra.id)
            ]);

            setInventario(inventarioData || []);
            setHistorial(movesData.data);
            setTotalHistory(movesData.count);
            setPedidosPendientes((pedidosData || []).filter(p => p.estado === 'Pendiente' || p.estado === 'Parcial'));

            // Peek next vale for display (not consuming)
            try {
                const nextVale = await peekNextValeSalida(selectedObra.id);
                setNumeroVale(nextVale);
            } catch (valeErr) {
                console.warn("Could not peek next vale:", valeErr);
                setNumeroVale('V-' + new Date().getFullYear() + '-????');
            }
        } catch (err: any) {
            console.error("Error loading SalidasAlmacen data:", err);
            setLastError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const loadMaestros = async () => {
        if (!selectedObra) return;
        const [t, b, e] = await Promise.all([
            getTerceros(selectedObra.id),
            getAllBloquesByObra(selectedObra.id),
            supabase.from('profiles').select('id, nombre').in('role', ['produccion', 'coordinador', 'admin'])
        ]);
        const tercerosList = t || [];
        setTerceros(tercerosList);

        // Handle unique blocks and natural sorting
        const rawBloques = b || [];
        const uniqueMap = new Map();
        rawBloques.forEach(block => {
            const name = block.nombre_bloque.trim().toUpperCase();
            if (!uniqueMap.has(name)) {
                uniqueMap.set(name, block);
            }
        });

        const sortedBloques = Array.from(uniqueMap.values()).sort((a, b) =>
            a.nombre_bloque.localeCompare(b.nombre_bloque, undefined, { numeric: true, sensitivity: 'base' })
        );

        setBloques(sortedBloques);
        setEncargados(e.data || []);

        // Default to 'CASA' if exists and nothing is selected
        if (!selectedTercero) {
            const casa = tercerosList.find(ter => ter.nombre_completo.toUpperCase().includes('CASA'));
            if (casa) {
                setSelectedTercero(casa.id);
            }
        }
    };

    useEffect(() => {
        if (selectedObra) {
            loadData();
            loadMaestros();
        } else {
            setInventario([]);
            setHistorial([]);
            setPedidosPendientes([]);
        }
    }, [selectedObra, currentPage, searchTerm]);

    useRealtimeSubscription(() => loadData(), { table: 'movimientos_almacen', event: '*' });

    const handleAddItem = () => {
        if (!selectedItem || itemQuantity <= 0) return;
        const inv = inventario.find(i => i.id === selectedItem);
        if (!inv) return;

        let itemId = '';
        let nombre = '';
        let unidad = '';
        let tipo: any = 'MATERIAL';

        if (inv.material) {
            itemId = inv.material_id!;
            nombre = inv.material.descripcion;
            unidad = inv.material.unidad;
            tipo = 'MATERIAL';
        } else if (inv.equipo) {
            itemId = inv.equipo_id!;
            nombre = inv.equipo.nombre;
            unidad = 'UND';
            tipo = 'EQUIPO';
        } else if (inv.epp) {
            itemId = inv.epp_id!;
            nombre = inv.epp.descripcion;
            unidad = inv.epp.unidad;
            tipo = 'EPP';
        }

        if (itemQuantity > inv.cantidad_actual) {
            alert(`Stock insuficiente. Solo hay ${inv.cantidad_actual} ${unidad} disponibles.`);
            return;
        }

        setItemsToAdd([...itemsToAdd, { invId: inv.id, tipo, id: itemId, nombre, unidad, cantidad: itemQuantity }]);
        setSelectedItem('');
        setItemQuantity(0);
    };

    const handleLoadPedido = (pedido: PedidoSalida) => {
        setSelectedPedido(pedido);
        setSolicitante(pedido.solicitante_nombre || '');
        setSolicitanteDni(pedido.solicitante_dni || '');
        setDestino(pedido.destino_o_uso || '');
        setNumeroVale(pedido.numero_vale || '');
        setSelectedTercero(pedido.tercero_id || '');
        setSelectedEncargado(pedido.encargado_id || '');
        setSelectedBloque(pedido.bloque_id || '');

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

            return { invId: d.id, tipo, id, nombre, unidad, cantidad: d.cantidad_solicitada };
        }) || [];

        setItemsToAdd(items);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const clearForm = () => {
        setSelectedPedido(null);
        setItemsToAdd([]);
        setSolicitante('');
        setSolicitanteDni('');
        setDestino('');
        setSelectedTercero('');
        setSelectedEncargado('');
        setSelectedBloque('');
        // Re-peek next vale if we have an obra
        if (selectedObra) {
            peekNextValeSalida(selectedObra.id).then(setNumeroVale).catch(() => {
                setNumeroVale('V-' + new Date().getFullYear() + '-????');
            });
        }
    };

    const handleRegister = async () => {
        if (itemsToAdd.length === 0) return;
        if (!selectedPedido && (!solicitante || !destino || !numeroVale)) return alert("Complete los datos del vale");

        setLoading(true);
        try {
            if (selectedPedido) {
                // Flow: Almacenero Approves Request
                await aprobarPedidoSalida(
                    selectedPedido.id,
                    itemsToAdd.map(i => ({
                        detalle_id: i.invId,
                        cantidad_entregada: i.cantidad
                    }))
                );
                setSuccessMsg(`Pedido ${selectedPedido.numero_vale} aprobado y salida registrada.`);
                setSelectedPedido(null);
            } else {
                // Flow: Manual Exit
                // 1. Get the REAL voucher number (consuming sequence)
                const realVale = await getNextValeSalida(selectedObra!.id);

                // 2. Register all items with this voucher
                await Promise.all(itemsToAdd.map(item =>
                    registrarSalida(
                        item.tipo,
                        item.id,
                        item.cantidad,
                        destino,
                        solicitante,
                        selectedObra!.id,
                        {
                            terceroId: selectedTercero,
                            encargadoId: selectedEncargado,
                            bloqueId: selectedBloque,
                            numeroVale: realVale,
                            solicitanteDni: solicitanteDni
                        }
                    )
                ));
                setSuccessMsg(`Salida registrada correctamente con Vale: ${realVale}`);
            }

            clearForm();
            loadData();
            setTimeout(() => setSuccessMsg(''), 5000);
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrintPedido = (pedido: PedidoSalida) => {
        setPedidoToPrint({ pedido, items: pedido.detalles || [] });
        setShowPrintModal(true);
    };

    // Clear PDF when modal closes or format changes
    useEffect(() => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
        }
    }, [showPrintModal, printFormat]);

    const handleGeneratePDF = async () => {
        // Target the hidden capture area to avoid modal/preview transforms
        const element = document.getElementById('pdf-capture-render');
        if (!element) return;

        setIsGeneratingPdf(true);
        try {
            // Wait for hidden element to be ready
            await new Promise(r => setTimeout(r, 1000));

            const canvas = await html2canvas(element, {
                scale: 2, // Standard high resolution scale
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                // A4 is roughly 794px at 96 DPI
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
            setLastError('Error al generar el PDF. Revisa la consola.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header mb-4 d-flex justify-content-between align-items-center">
                <div>
                    <h2>Registrar Salida de Almacén</h2>
                    <p className="text-muted">Retiro de materiales, equipos o EPPs {inventario.length > 0 ? `(${inventario.length} ítems en stock)` : '(Cargando inventario...)'}</p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    {pedidosPendientes.length > 0 && (
                        <Button
                            variant="danger"
                            className="rounded-pill p-2 px-3 shadow-sm bounce-in border-0 d-flex align-items-center"
                            onClick={() => setShowPendingDrawer(true)}
                        >
                            <i className="bi bi-bell-fill me-2"></i>
                            <span className="fw-bold">{pedidosPendientes.length} Pendientes</span>
                        </Button>
                    )}
                </div>
            </div>

            {successMsg && <Alert variant="success" className="mb-4 shadow-sm bounce-in">{successMsg}</Alert>}
            {lastError && <Alert variant="danger" className="mb-4 shadow-sm bounce-in">Error de carga: {lastError}</Alert>}

            <Row>
                {/* Formulario de Salida */}
                <Col lg={7}>
                    <Card className="custom-card shadow-sm border-0 mb-4 position-relative">
                        {selectedPedido && (
                            <div className="position-absolute top-0 end-0 p-3">
                                <Button variant="outline-danger" size="sm" onClick={clearForm}>
                                    <i className="bi bi-x-lg me-1"></i> Cancelar Atención
                                </Button>
                            </div>
                        )}
                        <Card.Header className="bg-light border-0 py-3">
                            <h5 className="mb-0 fw-bold text-dark">
                                <i className="bi bi-pencil-square me-2 text-primary"></i>
                                {selectedPedido ? `Atendiendo Pedido ${selectedPedido.numero_vale}` : 'Datos del Vale de Salida'}
                            </h5>
                        </Card.Header>
                        <Card.Body className="p-4">
                            <Row className="g-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold small text-muted text-uppercase">Número de Vale <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Generando correlativo..."
                                            readOnly
                                            value={numeroVale}
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold small text-muted text-uppercase">Destino / Uso <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Ej. Vaciado zapata 2"
                                            disabled={!!selectedPedido}
                                            value={destino}
                                            onChange={(e) => setDestino(e.target.value)}
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold small text-muted text-uppercase">Tercero / Empresa</Form.Label>
                                        <SearchableSelect
                                            options={terceros.map(t => ({ value: t.id, label: t.nombre_completo }))}
                                            value={selectedTercero}
                                            disabled={!!selectedPedido}
                                            onChange={(val) => setSelectedTercero(val.toString())}
                                            placeholder="Seleccione Tercero..."
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold small text-muted text-uppercase">Encargado (Solicita)</Form.Label>
                                        <SearchableSelect
                                            options={encargados.map(e => ({ value: e.id, label: e.nombre }))}
                                            value={selectedEncargado}
                                            disabled={!!selectedPedido}
                                            onChange={(val) => setSelectedEncargado(val.toString())}
                                            placeholder="Seleccione Encargado..."
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold small text-muted text-uppercase">Frente / Bloque</Form.Label>
                                        <SearchableSelect
                                            options={bloques.map(b => ({ value: b.id, label: b.nombre_bloque }))}
                                            value={selectedBloque}
                                            disabled={!!selectedPedido}
                                            onChange={(val) => setSelectedBloque(val.toString())}
                                            placeholder="Seleccione Frente/Bloque..."
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
                                            isInvalid={solicitanteDni.length > 0 && solicitanteDni.length < 8}
                                            onChange={(e) => setSolicitanteDni(e.target.value.replace(/[^0-9]/g, ''))}
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
                                            placeholder="Nombre de quien retira"
                                            value={solicitante}
                                            onChange={(e) => setSolicitante(e.target.value.toUpperCase())}
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>

                            <hr className="my-4" />

                            <h6 className="fw-bold mb-3">Ítems a Retirar</h6>
                            {!selectedPedido && (
                                <>
                                    <div className="d-flex gap-2 mb-3">
                                        {(['MATERIAL', 'EQUIPO', 'EPP'] as const).map(type => {
                                            const count = inventario.filter(i => {
                                                if (type === 'MATERIAL') return !!(i.material_id || i.material);
                                                if (type === 'EQUIPO') return !!(i.equipo_id || i.equipo);
                                                if (type === 'EPP') return !!(i.epp_id || i.epp);
                                                return false;
                                            }).length;
                                            return (
                                                <Button
                                                    key={type}
                                                    variant={selectedType === type ? "primary" : "outline-primary"}
                                                    size="sm"
                                                    className="rounded-pill px-3"
                                                    onClick={() => {
                                                        setSelectedType(type);
                                                        setSelectedItem('');
                                                    }}
                                                >
                                                    {type} ({count})
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    <Row className="g-2 mb-3">
                                        <Col md={7}>
                                            <SearchableSelect
                                                options={inventario
                                                    .filter(i => {
                                                        if (selectedType === 'MATERIAL') return !!(i.material_id || i.material);
                                                        if (selectedType === 'EQUIPO') return !!(i.equipo_id || i.equipo);
                                                        if (selectedType === 'EPP') return !!(i.epp_id || i.epp);
                                                        return false;
                                                    })
                                                    .map(i => ({
                                                        value: i.id,
                                                        label: i.material?.descripcion || i.equipo?.nombre || i.epp?.descripcion || 'Desconocido',
                                                        info: `Stock: ${i.cantidad_actual} ${i.material?.unidad || i.epp?.unidad || 'UND'}`
                                                    }))}
                                                value={selectedItem}
                                                onChange={(val: string | number) => setSelectedItem(val.toString())}
                                                placeholder={`Buscar ${selectedType.toLowerCase()}...`}
                                            />
                                        </Col>
                                        <Col md={3}>
                                            <Form.Control
                                                type="number"
                                                placeholder="Cant."
                                                value={itemQuantity || ''}
                                                max={inventario.find(i => i.id === selectedItem)?.cantidad_actual || undefined}
                                                step="any"
                                                isInvalid={selectedItem ? itemQuantity > (inventario.find(i => i.id === selectedItem)?.cantidad_actual || 0) : false}
                                                onChange={(e) => setItemQuantity(Number(e.target.value))}
                                            />
                                            <Form.Control.Feedback type="invalid">
                                                Excede stock
                                            </Form.Control.Feedback>
                                        </Col>
                                        <Col md={2}>
                                            <Button
                                                variant="outline-success"
                                                className="w-100 h-100 d-flex align-items-center justify-content-center rounded-pill border-2"
                                                onClick={handleAddItem}
                                                disabled={!selectedItem || itemQuantity <= 0}
                                                title="Agregar"
                                            >
                                                <FaCartArrowDown size={20} />
                                            </Button>
                                        </Col>
                                    </Row>
                                </>
                            )}

                            <div className="table-responsive">
                                <Table hover className="align-middle border rounded-3 overflow-hidden">
                                    <thead className="bg-light small text-uppercase" style={{ fontSize: '0.75rem' }}>
                                        <tr>
                                            <th className="ps-3">Item</th>
                                            <th className="text-center" style={{ width: '130px' }}>Cantidad</th>
                                            <th className="text-center" style={{ width: '80px' }}>Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemsToAdd.map((item, idx) => {
                                            const invItem = inventario.find(i => i.id === item.invId);
                                            const stockMax = invItem?.cantidad_actual || 999999;

                                            return (
                                                <tr key={idx} className="border-bottom">
                                                    <td className="ps-3">
                                                        <div className="fw-bold text-dark">{item.nombre}</div>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <Badge bg="light" text="dark" className="border" style={{ fontSize: '0.65rem' }}>{item.tipo}</Badge>
                                                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>{item.unidad}</small>
                                                            {invItem && (
                                                                <small className="text-primary fw-bold" style={{ fontSize: '0.7rem' }}>
                                                                    (Stock: {invItem.cantidad_actual})
                                                                </small>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="text-center">
                                                        <div className="d-flex flex-column align-items-center">
                                                            <Form.Control
                                                                type="number"
                                                                size="sm"
                                                                className={`text-center fw-bold ${item.cantidad > stockMax ? 'text-danger border-danger shadow-sm' : 'text-primary'}`}
                                                                value={item.cantidad}
                                                                step="any"
                                                                min={0.01}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    const newItems = [...itemsToAdd];
                                                                    newItems[idx].cantidad = val;
                                                                    setItemsToAdd(newItems);
                                                                }}
                                                                style={{ maxWidth: '90px', borderRadius: '6px' }}
                                                            />
                                                            {item.cantidad > stockMax && (
                                                                <small className="text-danger fw-bold" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                                                                    ¡Excede stock!
                                                                </small>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="text-center">
                                                        <Button
                                                            variant="outline-danger"
                                                            size="sm"
                                                            className="rounded-pill px-3 py-1"
                                                            onClick={() => setItemsToAdd(itemsToAdd.filter((_, i) => i !== idx))}
                                                            title="Eliminar material"
                                                            style={{ borderWidth: '1.5px', fontSize: '0.8rem' }}
                                                        >
                                                            <FaEraser size={18} />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {itemsToAdd.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="text-center py-5 text-muted">
                                                    <div className="opacity-50">
                                                        <i className="bi bi-cart-plus fs-1 d-block mb-2"></i>
                                                        Agregue materiales para procesar la salida.
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </div>
                        </Card.Body>
                        <Card.Footer className="bg-white py-3 border-top-0">
                            <Button
                                variant="success"
                                className="w-100 py-2 fw-bold"
                                disabled={loading || itemsToAdd.length === 0 || solicitanteDni.length !== 8}
                                onClick={handleRegister}
                            >
                                {loading ? (
                                    <><Spinner size="sm" className="me-2" /> Procesando...</>
                                ) : (
                                    <>
                                        <i className={`bi ${selectedPedido ? 'bi-check2-all' : 'bi-check2-circle'} me-2`}></i>
                                        {selectedPedido ? 'Aprobar Pedido y Registrar Salida' : 'Procesar Salida y Generar Vale'}
                                    </>
                                )}
                            </Button>
                        </Card.Footer>
                    </Card>
                </Col>

                {/* Historial Reciente */}
                <Col lg={5}>
                    <Card className="custom-card shadow-sm border-0 h-100">
                        <Card.Header className="bg-light border-0 py-3">
                            <h5 className="mb-0 fw-bold text-dark d-flex justify-content-between align-items-center">
                                <span><i className="bi bi-clock-history me-2 text-primary"></i>Historial Reciente</span>
                                <Badge bg="primary" pill style={{ fontSize: '0.7rem' }}>{totalHistory} total</Badge>
                            </h5>
                        </Card.Header>
                        <Card.Body className="p-0">
                            <div className="table-responsive">
                                <Table hover className="mb-0 table-sm">
                                    <thead className="bg-light small p-3">
                                        <tr>
                                            <th className="ps-3 border-0">Vale</th>
                                            <th className="border-0">Item</th>
                                            <th className="text-center border-0">Cant.</th>
                                            <th className="pe-3 border-0 text-end">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody className="small">
                                        {historial.map(m => (
                                            <tr key={m.id}>
                                                <td className="ps-3 border-0 py-2"><strong>{m.numero_vale}</strong></td>
                                                <td className="border-0 py-2 text-truncate" style={{ maxWidth: '150px' }}>
                                                    {m.material?.descripcion || m.equipo?.nombre || m.epp?.descripcion}
                                                </td>
                                                <td className="text-center border-0 py-2"><strong>{m.cantidad}</strong></td>
                                                <td className="pe-3 border-0 py-2 text-end text-muted">{formatDisplayDate(m.fecha)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </div>
                        </Card.Body>
                        <Card.Footer className="bg-white p-3 border-0">
                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={Math.ceil(totalHistory / pageSize)}
                                totalItems={totalHistory}
                                pageSize={pageSize}
                                onPageChange={setCurrentPage}
                            />
                        </Card.Footer>
                    </Card>
                </Col>
            </Row>

            {/* Side Drawer for Pending Orders */}
            <Offcanvas
                show={showPendingDrawer}
                onHide={() => setShowPendingDrawer(false)}
                placement="end"
                className="bg-light shadow"
                style={{ width: '340px' }}
                backdrop={false}
                scroll={true}
            >
                <Offcanvas.Header closeButton className="bg-white border-bottom shadow-sm">
                    <Offcanvas.Title className="fw-bold">
                        <i className="bi bi-inbox-fill me-2 text-primary"></i>
                        Pedidos Pendientes
                        <Badge bg="danger" pill className="ms-3 align-middle" style={{ fontSize: '0.75rem' }}>
                            {pedidosPendientes.length}
                        </Badge>
                    </Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body className="p-0">
                    {pedidosPendientes.length === 0 ? (
                        <div className="text-center py-5">
                            <i className="bi bi-check-circle-fill text-success opacity-50 display-4 mb-3"></i>
                            <p className="text-muted">No hay pedidos pendientes.</p>
                        </div>
                    ) : (
                        <List
                            height={window.innerHeight - 80}
                            itemCount={pedidosPendientes.length}
                            itemSize={220}
                            width="100%"
                        >
                            {({ index, style }) => {
                                const p = pedidosPendientes[index];
                                return (
                                    <div style={{ ...style, padding: '10px 20px' }}>
                                        <Card
                                            className={`border h-100 ${selectedPedido?.id === p.id ? 'border-primary bg-primary bg-opacity-10' : 'bg-white'}`}
                                            style={{
                                                borderRadius: '16px',
                                                cursor: 'pointer',
                                                margin: '4px'
                                            }}
                                            onClick={() => {
                                                handleLoadPedido(p);
                                                setShowPendingDrawer(false);
                                            }}
                                        >
                                            <Card.Body className="p-3 d-flex flex-column justify-content-between">
                                                <div>
                                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                                        <span className="fw-bold text-primary small bg-primary bg-opacity-10 px-2 py-1 rounded">{p.numero_vale}</span>
                                                        <Badge bg={p.estado === 'Parcial' ? 'warning' : 'info'} pill style={{ fontSize: '0.65rem' }}>
                                                            {p.estado}
                                                        </Badge>
                                                    </div>
                                                    <h6 className="fw-bold mb-1 text-dark text-truncate" style={{ fontSize: '1rem' }} title={p.solicitante_nombre}>
                                                        {p.solicitante_nombre || 'Sin Solicitante'}
                                                    </h6>
                                                    <div className="small text-muted mb-2 text-truncate" style={{ fontSize: '0.85rem' }}>
                                                        <i className="bi bi-geo-alt me-1"></i> {p.destino_o_uso}
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="d-flex justify-content-between align-items-center mb-3 pt-2 border-top">
                                                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                            <i className="bi bi-calendar3 me-1"></i> {formatDisplayDate(p.created_at)}
                                                        </small>
                                                        <Badge bg="light" text="dark" className="border" style={{ fontSize: '0.75rem' }}>
                                                            {p.detalles?.length || 0} ítems
                                                        </Badge>
                                                    </div>
                                                    <div className="d-flex gap-2">
                                                        <Button
                                                            variant={selectedPedido?.id === p.id ? "primary" : "outline-primary"}
                                                            size="sm"
                                                            className="flex-grow-1 fw-bold rounded-pill py-2"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleLoadPedido(p);
                                                                setShowPendingDrawer(false);
                                                            }}
                                                            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            <FaEye size={16} className="me-2" />
                                                            {selectedPedido?.id === p.id ? 'Atendiendo...' : 'Procesar'}
                                                        </Button>
                                                        <Button
                                                            variant="outline-secondary"
                                                            size="sm"
                                                            className="rounded-pill px-3"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handlePrintPedido(p);
                                                            }}
                                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            <FaPrint size={16} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Card.Body>
                                        </Card>
                                    </div>
                                );
                            }}
                        </List>
                    )}
                </Offcanvas.Body>
            </Offcanvas>

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

export default SalidasAlmacen;
