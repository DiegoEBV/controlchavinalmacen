import React, { useState, useEffect, useMemo } from 'react';
import { Card, Form, Table, Row, Col } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario } from '../services/almacenService';
import { StockItem, Inventario } from '../types';
import { useAuth } from '../context/AuthContext';
import PaginationControls from '../components/PaginationControls';
import { Modal, Button, Tabs, Tab, Alert, Badge } from 'react-bootstrap';
import SearchableSelect from '../components/SearchableSelect';
import { getMaterialesCatalog } from '../services/requerimientosService';
import { getEquipos } from '../services/equiposService';
import { getEpps } from '../services/eppsService';
import { registrarEntradaMasiva, getAllInventario } from '../services/almacenService';
import { FaUpload, FaTrash, FaExclamationTriangle, FaFileExcel, FaPencilAlt } from 'react-icons/fa';
import { exportStockToExcel } from '../utils/stockExport';
import { Toast, ToastContainer } from 'react-bootstrap';
import { formatDisplayDate } from '../utils/dateUtils';
import { registrarAjusteInventario } from '../services/almacenService';

const StockAlmacen: React.FC = () => {
    const { selectedObra, hasRole } = useAuth();
    const canManageStock = hasRole(['admin', 'almacenero', 'coordinador']);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [filterCategory, setFilterCategory] = useState('Todos');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageSize = 15;

    const [showInitialStockModal, setShowInitialStockModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMsg, setToastMsg] = useState('');

    // Ajuste de Inventario
    const [showAjusteModal, setShowAjusteModal] = useState(false);
    const [ajusteItem, setAjusteItem] = useState<StockItem | null>(null);
    const [ajusteCantidadFisica, setAjusteCantidadFisica] = useState<number | ''>('');
    const [ajusteMotivo, setAjusteMotivo] = useState('');
    const [ajusteLoading, setAjusteLoading] = useState(false);

    useEffect(() => {
        if (selectedObra) {
            loadStock();
        } else {
            setStockItems([]);
        }
    }, [selectedObra, currentPage, searchTerm]);

    // --- Suscripción en Tiempo Real ---
    useEffect(() => {
        const channel = supabase
            .channel('public:inventario_obra')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_obra' }, () => {
                loadStock();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedObra]);

    const loadStock = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            // Obtener inventario unificado paginado
            const { data: inventarioData, count } = await getInventario(selectedObra.id, currentPage, pageSize, searchTerm);

            // Normalize data into StockItem
            const normalizedItems: StockItem[] = inventarioData.map(item => {
                if (item.material) {
                    return { type: 'MATERIAL', data: item as Inventario & { material: any } };
                } else if (item.equipo) {
                    return { type: 'EQUIPO', data: item as Inventario & { equipo: any } };
                } else if (item.epp) {
                    return { type: 'EPP', data: item as Inventario & { epp: any } };
                }
                return null;
            }).filter((item): item is StockItem => item !== null);

            setStockItems(normalizedItems);
            setTotalItems(count || 0);
        } catch (error) {
            console.error("Error loading stock:", error);
        } finally {
            setLoading(false);
        }
    };

    const getCategories = () => {
        const cats = new Set<string>();
        stockItems.forEach(item => {
            if (item.type === 'MATERIAL') {
                const mat = (item.data as Inventario).material;
                if (mat) cats.add(mat.categoria);
            } else if (item.type === 'EQUIPO') {
                cats.add('Equipos');
            } else if (item.type === 'EPP') {
                cats.add('EPPs');
            }
        });
        return Array.from(cats).sort();
    };

    const pagedStock = useMemo(() => {
        if (filterCategory === 'Todos') return stockItems;
        return stockItems.filter(item => {
            let itemCategory = '';
            if (item.type === 'MATERIAL') itemCategory = (item.data as Inventario).material?.categoria || '';
            else if (item.type === 'EQUIPO') itemCategory = 'Equipos';
            else if (item.type === 'EPP') itemCategory = 'EPPs';

            if (filterCategory === 'Equipos') return item.type === 'EQUIPO';
            if (filterCategory === 'EPPs') return item.type === 'EPP';
            return itemCategory === filterCategory;
        });
    }, [stockItems, filterCategory]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    const handleExport = async () => {
        if (!selectedObra) return;
        setIsExporting(true);
        try {
            const allData = await getAllInventario(selectedObra.id);
            if (!allData || allData.length === 0) {
                alert("No hay datos para exportar.");
                return;
            }
            const { count } = exportStockToExcel(allData);
            setToastMsg(`Exportación completada: ${count} ítems procesados`);
            setShowToast(true);
        } catch (error) {
            console.error("Error exporting stock:", error);
            alert("Error al obtener el inventario total. Reintente.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleOpenAjuste = (item: StockItem) => {
        setAjusteItem(item);
        setAjusteCantidadFisica('');
        setAjusteMotivo('');
        setShowAjusteModal(true);
    };

    const handleAjusteSubmit = async () => {
        if (!ajusteItem || !selectedObra || ajusteCantidadFisica === '' || !ajusteMotivo) return;
        setAjusteLoading(true);
        try {
            const inv = ajusteItem.data as Inventario;
            const result = await registrarAjusteInventario(
                selectedObra.id,
                inv.material_id || null,
                (inv as any).equipo_id || null,
                (inv as any).epp_id || null,
                Number(ajusteCantidadFisica),
                ajusteMotivo,
                'Almacenero'
            );
            const res = result as any;
            if (res?.diferencia === 0) {
                setToastMsg('Sin diferencia. No se registró ajuste.');
            } else {
                setToastMsg(`Ajuste registrado: ${res?.tipo === 'AJUSTE_ENTRADA' ? '+' : '-'}${Math.abs(res?.diferencia || 0)} unidades`);
            }
            setShowToast(true);
            setShowAjusteModal(false);
            loadStock();
        } catch (err: any) {
            console.error(err);
            alert('Error al registrar ajuste: ' + (err.message || 'Error desconocido'));
        } finally {
            setAjusteLoading(false);
        }
    };

    const getAjusteItemInfo = () => {
        if (!ajusteItem) return { desc: '', stock: 0, unit: '' };
        const inv = ajusteItem.data as Inventario;
        if (ajusteItem.type === 'MATERIAL') return { desc: inv.material?.descripcion || '', stock: inv.cantidad_actual, unit: inv.material?.unidad || '' };
        if (ajusteItem.type === 'EQUIPO') return { desc: (inv as any).equipo?.nombre || '', stock: inv.cantidad_actual, unit: 'UND' };
        if (ajusteItem.type === 'EPP') return { desc: (inv as any).epp?.descripcion || '', stock: inv.cantidad_actual, unit: (inv as any).epp?.unidad || '' };
        return { desc: '', stock: 0, unit: '' };
    };

    return (
        <div className="fade-in">
            <div className="page-header d-flex justify-content-between align-items-center">
                <h2>Stock Actual en Obra</h2>
                {canManageStock && (
                    <div className="d-flex gap-2">
                        <Button
                            variant="success"
                            onClick={handleExport}
                            disabled={isExporting || loading || !selectedObra}
                            className="d-flex align-items-center rounded-pill px-4 fw-bold shadow-sm"
                        >
                            <FaFileExcel className="me-2" />
                            {isExporting ? 'Exportando...' : 'Exportar Stock'}
                        </Button>
                        <Button variant="primary" className="rounded-pill px-4 fw-bold shadow-sm" onClick={() => setShowInitialStockModal(true)}>
                            <i className="bi bi-plus-lg me-2"></i> Cargar Stock Inicial
                        </Button>
                    </div>
                )}
            </div>

            <Card className="custom-card">
                <Card.Body>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <Form.Control
                                placeholder="Buscar (Material, Equipo, EPP)..."
                                value={searchTerm}
                                onChange={e => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                        <div className="col-12 col-md-4">
                            <Form.Select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                            >
                                <option value="Todos">Todas las Categorías</option>
                                {getCategories().map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </Form.Select>
                        </div>
                    </div>
                </Card.Body>
            </Card>

            <Card className="custom-card p-0 overflow-hidden mt-4">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Frente / Marca</th>
                            <th>Descripción / Nombre</th>
                            <th>Categoría / Tipo</th>
                            <th className="text-center">Unidad</th>
                            <th className="text-center">Stock Actual</th>
                            <th className="text-end">CPP (S/)</th>
                            <th className="text-end">Subtotal (S/)</th>
                            <th>Último Ingreso</th>
                            {canManageStock && <th style={{width: '80px'}}></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="text-center p-5">Cargando inventario...</td></tr>
                        ) : pagedStock.length === 0 ? (
                            <tr><td colSpan={9} className="text-center p-5 text-muted">No hay ítems en stock.</td></tr>
                        ) : (
                            pagedStock.map((item, index) => {
                                let typeLabel = '';
                                let col2 = '-'; // Frente or Marca
                                let description = '-';
                                let category = '-';
                                let unit = '-';
                                let stock = 0;
                                let cpp = 0;
                                let lastIngress = formatDisplayDate(item.data.ultimo_ingreso);

                                if (item.type === 'MATERIAL') {
                                    const d = item.data as Inventario;
                                    typeLabel = 'Material';
                                    col2 = '-';
                                    description = d.material?.descripcion || '';
                                    category = d.material?.categoria || '';
                                    unit = d.material?.unidad || '';
                                    stock = d.cantidad_actual;
                                    cpp = d.costo_promedio || 0;
                                } else if (item.type === 'EQUIPO') {
                                    const d = (item.data as any).equipo;
                                    typeLabel = 'Equipo';
                                    col2 = d.marca || '-';
                                    description = `${d.nombre} [${d.codigo}]`;
                                    category = 'Equipo';
                                    unit = 'UND';
                                    stock = item.data.cantidad_actual;
                                    cpp = item.data.costo_promedio || 0;
                                } else if (item.type === 'EPP') {
                                    const d = (item.data as any).epp;
                                    typeLabel = 'EPP';
                                    col2 = '-';
                                    description = `${d.descripcion} [${d.codigo || ''}]`;
                                    category = d.tipo;
                                    unit = d.unidad;
                                    stock = item.data.cantidad_actual;
                                    cpp = item.data.costo_promedio || 0;
                                }

                                const subtotal = stock * cpp;

                                return (
                                    <tr key={`${item.type}-${index}`}>
                                        <td>
                                            <span className={`badge ${item.type === 'MATERIAL' ? 'bg-info' : item.type === 'EQUIPO' ? 'bg-primary' : 'bg-warning'}`}>
                                                {typeLabel}
                                            </span>
                                        </td>
                                        <td>{col2}</td>
                                        <td className="fw-medium">{description}</td>
                                        <td>{category}</td>
                                        <td className="text-center">{unit}</td>
                                        <td className="text-center">
                                            <strong className={stock === 0 ? 'text-danger' : 'text-success'}>
                                                {Number(stock).toFixed(2)}
                                            </strong>
                                        </td>
                                        <td className="text-end">{cpp > 0 ? `S/ ${Number(cpp).toFixed(2)}` : '-'}</td>
                                        <td className="text-end fw-bold">{subtotal > 0 ? `S/ ${Number(subtotal).toFixed(2)}` : '-'}</td>
                                        <td className="small text-muted">{lastIngress}</td>
                                        {canManageStock && (
                                            <td className="text-center align-middle">
                                                <Button 
                                                    variant="warning" 
                                                    size="sm" 
                                                    className="fw-bold rounded-pill px-3 shadow-sm" 
                                                    style={{ fontSize: '10px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Ajustar inventario" 
                                                    onClick={() => handleOpenAjuste(item)}
                                                >
                                                    AJUSTAR
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </Table>
                <div className="px-3 pb-3">
                    <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} />
                </div>
            </Card>
            <InitialStockModal
                show={showInitialStockModal}
                onHide={() => setShowInitialStockModal(false)}
                onSuccess={() => {
                    loadStock();
                    setShowInitialStockModal(false);
                }}
                existingStock={stockItems}
                obraId={selectedObra?.id || ''}
            />

            <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 9999 }}>
                <Toast onClose={() => setShowToast(false)} show={showToast} delay={4000} autohide bg="success">
                    <Toast.Header closeButton={false}>
                        <strong className="me-auto">Sistema</strong>
                    </Toast.Header>
                    <Toast.Body className="text-white">
                        {toastMsg}
                    </Toast.Body>
                </Toast>
            </ToastContainer>

            {/* Modal Ajuste de Inventario */}
            <Modal show={showAjusteModal} onHide={() => setShowAjusteModal(false)} centered>
                <Modal.Header closeButton className="bg-warning text-dark">
                    <Modal.Title><FaPencilAlt className="me-2" />Ajuste de Inventario</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {ajusteItem ? (() => {
                        const info = getAjusteItemInfo();
                        const diff = ajusteCantidadFisica !== '' ? Number(ajusteCantidadFisica) - info.stock : 0;
                        return (
                            <>
                                <Alert variant="info" className="small">
                                    Ingrese la cantidad real (conteo físico) para <strong>{info.desc}</strong>. El sistema calculará y registrará la diferencia automáticamente.
                                </Alert>
                                <div className="p-3 bg-light rounded border mb-3">
                                    <Row>
                                        <Col xs={6}>
                                            <span className="text-muted small">Stock en Sistema</span>
                                            <h4 className="mb-0">{info.stock} {info.unit}</h4>
                                        </Col>
                                        <Col xs={6} className="text-end">
                                            {ajusteCantidadFisica !== '' && diff !== 0 && (
                                                <>
                                                    <span className="text-muted small">Diferencia</span>
                                                    <h4 className={`mb-0 ${diff > 0 ? 'text-success' : 'text-danger'}`}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(2)} {info.unit}
                                                    </h4>
                                                </>
                                            )}
                                        </Col>
                                    </Row>
                                </div>
                                <Form.Group className="mb-3">
                                    <Form.Label>Cantidad Física (Conteo Real) <span className="text-danger">*</span></Form.Label>
                                    <Form.Control
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Ingrese cantidad física..."
                                        value={ajusteCantidadFisica}
                                        onChange={(e) => setAjusteCantidadFisica(e.target.value === '' ? '' : Number(e.target.value))}
                                        autoFocus
                                    />
                                </Form.Group>
                                <Form.Group className="mb-3">
                                    <Form.Label>Motivo del Ajuste <span className="text-danger">*</span></Form.Label>
                                    <Form.Select value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)}>
                                        <option value="">Seleccione motivo...</option>
                                        <option value="Diferencia en conteo físico">Diferencia en conteo físico</option>
                                        <option value="Merma por manipulación">Merma por manipulación</option>
                                        <option value="Rotura o deterioro">Rotura o deterioro</option>
                                        <option value="Error de registro anterior">Error de registro anterior</option>
                                        <option value="Sobrante encontrado">Sobrante encontrado</option>
                                        <option value="Otro">Otro</option>
                                    </Form.Select>
                                </Form.Group>
                            </>
                        );
                    })() : (
                        <p className="text-muted text-center">Seleccione un ítem del stock para ajustar usando el ícono <FaPencilAlt className="text-warning" /> en la tabla.</p>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-0 pb-4">
                    <Button variant="link" className="text-secondary text-decoration-none fw-bold" onClick={() => setShowAjusteModal(false)}>
                        Cancelar
                    </Button>
                    <Button
                        variant="warning"
                        className="rounded-pill px-4 fw-bold shadow-sm"
                        onClick={handleAjusteSubmit}
                        disabled={ajusteLoading || !ajusteItem || ajusteCantidadFisica === '' || !ajusteMotivo || Number(ajusteCantidadFisica) < 0}
                    >
                        {ajusteLoading ? 'Procesando...' : 'Registrar Ajuste'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

// --- Sub-componente Modal para Carga Inicial ---
interface InitialStockModalProps {
    show: boolean;
    onHide: () => void;
    onSuccess: () => void;
    existingStock: StockItem[];
    obraId: string;
}

const InitialStockModal: React.FC<InitialStockModalProps> = ({ show, onHide, onSuccess, existingStock, obraId }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('MATERIAL');
    const [loading, setLoading] = useState(false);
    const [catalogs, setCatalogs] = useState<{ materials: any[], equipos: any[], epps: any[] }>({
        materials: [],
        equipos: [],
        epps: []
    });

    const [itemsToLoad, setItemsToLoad] = useState<any[]>([]);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        if (show) {
            loadCatalogs();
            setItemsToLoad([]);
            setSuccessMsg('');
        }
    }, [show]);

    const loadCatalogs = async () => {
        const [mats, eqs, epps] = await Promise.all([
            getMaterialesCatalog(),
            getEquipos(obraId, 1, 1000), // Get first 1000 for catalog
            getEpps(false, 1, 1000)
        ]);
        setCatalogs({
            materials: mats || [],
            equipos: eqs.data || [],
            epps: epps.data || []
        });
    };

    const handleAddItem = (type: string, id: string) => {
        if (itemsToLoad.find(i => i.id === id && i.type === type)) {
            return alert("Este ítem ya está en la lista.");
        }

        let itemData: any = null;
        if (type === 'MATERIAL') itemData = catalogs.materials.find(m => m.id === id);
        else if (type === 'EQUIPO') itemData = catalogs.equipos.find(e => e.id === id);
        else if (type === 'EPP') itemData = catalogs.epps.find(e => e.id === id);

        if (!itemData) return;

        const hasStock = existingStock.some(s => {
            if (type === 'MATERIAL') return s.type === 'MATERIAL' && s.data.material_id === id;
            if (type === 'EQUIPO') return s.type === 'EQUIPO' && (s.data as any).equipo_id === id;
            if (type === 'EPP') return s.type === 'EPP' && (s.data as any).epp_id === id;
            return false;
        });

        setItemsToLoad([...itemsToLoad, {
            type,
            id,
            data: itemData,
            cantidad: 0,
            hasStock
        }]);
    };

    const handleRemoveItem = (index: number) => {
        const newList = [...itemsToLoad];
        newList.splice(index, 1);
        setItemsToLoad(newList);
    };

    const handleUpdateQty = (index: number, qty: number) => {
        const newList = [...itemsToLoad];
        newList[index].cantidad = qty;
        setItemsToLoad(newList);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws);

                const newItems = [...itemsToLoad];

                for (const row of data as any[]) {
                    const norm: any = {};
                    Object.keys(row).forEach(k => {
                        const cleanKey = k.toLowerCase().trim().replace(/\s+/g, '_');
                        norm[cleanKey] = row[k];
                    });

                    const desc = (norm.descripcion || norm.nombre || norm.material || '').toString().trim().toUpperCase();
                    const cant = parseFloat(norm.cantidad || 0);
                    const cat = (norm.categoria || norm.tipo || '').toString().trim().toUpperCase();

                    if (!desc) continue;

                    // Match logic
                    let matched: any = null;
                    let type = 'MATERIAL';

                    // Try Material first
                    matched = catalogs.materials.find(m =>
                        m.descripcion.toUpperCase() === desc &&
                        (!cat || m.categoria.toUpperCase() === cat)
                    );

                    if (!matched) {
                        matched = catalogs.equipos.find(e => e.nombre.toUpperCase() === desc);
                        if (matched) type = 'EQUIPO';
                    }

                    if (!matched) {
                        matched = catalogs.epps.find(e => e.descripcion.toUpperCase() === desc);
                        if (matched) type = 'EPP';
                    }

                    if (matched) {
                        if (!newItems.find(i => i.id === matched.id && i.type === type)) {
                            const hasStock = existingStock.some(s => {
                                if (type === 'MATERIAL') return s.type === 'MATERIAL' && s.data.material_id === matched.id;
                                if (type === 'EQUIPO') return s.type === 'EQUIPO' && (s.data as any).equipo_id === matched.id;
                                if (type === 'EPP') return s.type === 'EPP' && (s.data as any).epp_id === matched.id;
                                return false;
                            });

                            newItems.push({
                                type,
                                id: matched.id,
                                data: matched,
                                cantidad: cant,
                                hasStock
                            });
                        }
                    } else {
                        // Unmatched entry
                        newItems.push({
                            type: 'UNKNOWN',
                            desc,
                            cantidad: cant,
                            error: true
                        });
                    }
                }

                setItemsToLoad(newItems);
            } catch (err) {
                console.error(err);
                alert("Error al procesar Excel");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleSave = async () => {
        if (itemsToLoad.length === 0) return alert("No hay items para cargar.");
        if (itemsToLoad.some(i => i.type === 'UNKNOWN')) return alert("Hay items que no coinciden con el catálogo. Selecciónelos manualmente o elimínelos.");
        if (itemsToLoad.some(i => i.cantidad <= 0)) return alert("Todos los items deben tener una cantidad mayor a 0.");

        setLoading(true);
        try {
            const payload = itemsToLoad.map(i => ({
                material_id: i.type === 'MATERIAL' ? i.id : null,
                equipo_id: i.type === 'EQUIPO' ? i.id : null,
                epp_id: i.type === 'EPP' ? i.id : null,
                cantidad: i.cantidad,
                req_id: null,
                det_req_id: null
            }));

            const userName = user?.user_metadata?.nombre_completo || user?.email || 'Sistema';
            await registrarEntradaMasiva(payload, 'STOCK INICIAL', obraId, userName);

            setSuccessMsg("¡Stock inicial cargado correctamente!");
            setTimeout(() => onSuccess(), 1500);
        } catch (error: any) {
            console.error(error);
            alert("Error: " + (error.message || "Error desconocido"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} size="xl" backdrop="static">
            <style>
                {`
                    /* Estilos para asegurar que las pestañas se vean bien */
                    .custom-tabs-sm .nav-link {
                        padding: 0.5rem 0.6rem;
                        font-size: 0.85rem;
                        color: #6c757d !important;
                        background: #fff;
                        border: 1px solid #dee2e6;
                        margin-right: 4px;
                        border-radius: 6px 6px 0 0;
                        transition: all 0.2s;
                    }
                    .custom-tabs-sm .nav-link:hover {
                        background: #f8f9fa;
                        border-color: #ced4da;
                    }
                    .custom-tabs-sm .nav-link.active {
                        background-color: #fff !important;
                        border-color: #dee2e6 #dee2e6 #fff !important;
                        color: #0d6efd !important;
                        font-weight: 600;
                        box-shadow: 0 -2px 5px rgba(0,0,0,0.03);
                    }
                `}
            </style>
            <Modal.Header closeButton>
                <Modal.Title>Cargar Stock Inicial en Almacén</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {successMsg && <Alert variant="success">{successMsg}</Alert>}

                <div className="row g-4">
                    <div className="col-12 col-md-4">
                        <Card className="h-100 shadow-sm border-0 bg-light">
                            <Card.Body>
                                <h6 className="fw-bold mb-3 d-flex align-items-center">
                                    <span className="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center me-2" style={{ width: '22px', height: '22px', fontSize: '11px' }}>1</span>
                                    Selección Manual
                                </h6>
                                <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'MATERIAL')} className="mb-3 custom-tabs-sm border-0">
                                    <Tab eventKey="MATERIAL" title="Material">
                                        <SearchableSelect
                                            options={catalogs.materials.map(m => ({ value: m.id, label: m.descripcion, info: m.categoria }))}
                                            value=""
                                            onChange={(val) => handleAddItem('MATERIAL', val.toString())}
                                            placeholder="Buscar Material..."
                                        />
                                    </Tab>
                                    <Tab eventKey="EQUIPO" title="Equipo">
                                        <SearchableSelect
                                            options={catalogs.equipos.map(e => ({ value: e.id, label: e.nombre, info: e.marca }))}
                                            value=""
                                            onChange={(val) => handleAddItem('EQUIPO', val.toString())}
                                            placeholder="Buscar Equipo..."
                                        />
                                    </Tab>
                                    <Tab eventKey="EPP" title="EPP">
                                        <SearchableSelect
                                            options={catalogs.epps.map(e => ({ value: e.id, label: e.descripcion, info: e.tipo }))}
                                            value=""
                                            onChange={(val) => handleAddItem('EPP', val.toString())}
                                            placeholder="Buscar EPP..."
                                        />
                                    </Tab>
                                </Tabs>

                                <div className="mt-4 pt-3 border-top">
                                    <h6 className="fw-bold mb-2 d-flex align-items-center">
                                        <span className="bg-success text-white rounded-circle d-inline-flex align-items-center justify-content-center me-2" style={{ width: '22px', height: '22px', fontSize: '11px' }}>2</span>
                                        Importación Masiva
                                    </h6>
                                    <label className="btn btn-outline-success w-100 d-flex align-items-center justify-content-center py-2 shadow-sm">
                                        <FaUpload className="me-2" /> Importar desde Excel
                                        <input type="file" hidden accept=".xlsx, .xls" onChange={handleImportExcel} />
                                    </label>
                                    <small className="text-muted d-block mt-2 text-center" style={{ fontSize: '0.75rem' }}>
                                        Columnas: <strong>Descripcion, Cantidad, Categoria</strong>
                                    </small>
                                </div>
                            </Card.Body>
                        </Card>
                    </div>

                    <div className="col-12 col-md-8">
                        <Card className="h-100 shadow-sm border-0">
                            <Card.Header className="bg-white py-3 border-bottom-0">
                                <h6 className="fw-bold mb-0">Lista de Carga ({itemsToLoad.length} ítems)</h6>
                            </Card.Header>
                            <div className="table-responsive" style={{ maxHeight: '450px' }}>
                                <Table hover className="mb-0">
                                    <thead className="bg-light sticky-top">
                                        <tr>
                                            <th>Ítem</th>
                                            <th style={{ width: '130px' }}>Cantidad</th>
                                            <th>Estado</th>
                                            <th style={{ width: '40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemsToLoad.length === 0 ? (
                                            <tr><td colSpan={4} className="text-center p-5 text-muted fst-italic">No hay ítems en la lista. Agregue manual o vía Excel.</td></tr>
                                        ) : (
                                            itemsToLoad.map((item, idx) => {
                                                const isUnknown = item.type === 'UNKNOWN';
                                                let label = '';
                                                let info = '';

                                                if (isUnknown) {
                                                    label = item.desc;
                                                    info = 'No encontrado en Catálogo';
                                                } else {
                                                    label = item.type === 'MATERIAL' ? item.data.descripcion : (item.type === 'EQUIPO' ? item.data.nombre : item.data.descripcion);
                                                    info = item.type === 'MATERIAL' ? item.data.categoria : (item.type === 'EQUIPO' ? item.data.marca : item.data.tipo);
                                                }

                                                return (
                                                    <tr key={idx} className={isUnknown ? 'table-danger' : (item.hasStock ? 'table-warning' : '')}>
                                                        <td className="align-middle">
                                                            <div className="fw-bold" style={{ fontSize: '0.9rem' }}>{label}</div>
                                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{info}</div>
                                                        </td>
                                                        <td className="align-middle">
                                                            <Form.Control
                                                                type="number"
                                                                size="sm"
                                                                value={item.cantidad}
                                                                onChange={(e) => handleUpdateQty(idx, parseFloat(e.target.value) || 0)}
                                                                disabled={isUnknown}
                                                                min="0"
                                                                className="border-primary-subtle"
                                                            />
                                                        </td>
                                                        <td className="small align-middle">
                                                            {isUnknown ? (
                                                                <Badge bg="danger" className="d-flex align-items-center p-2">
                                                                    <FaExclamationTriangle className="me-1" /> Desconocido
                                                                </Badge>
                                                            ) : item.hasStock ? (
                                                                <Badge bg="warning" text="dark" className="d-flex align-items-center p-2">
                                                                    <FaExclamationTriangle className="me-1" /> Ya tiene stock
                                                                </Badge>
                                                            ) : (
                                                                <Badge bg="success" className="p-2">Nuevo ingreso</Badge>
                                                            )}
                                                        </td>
                                                        <td className="align-middle">
                                                            <Button variant="link" className="text-danger p-0" onClick={() => handleRemoveItem(idx)}>
                                                                <FaTrash size={14} />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </Table>
                            </div>
                        </Card>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer className="bg-light py-3 border-top-0">
                <Button variant="outline-secondary" onClick={onHide} disabled={loading} className="px-4">Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={loading || itemsToLoad.length === 0} className="px-4 fw-bold shadow-sm">
                    {loading ? 'Procesando...' : `Confirmar Carga`}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default StockAlmacen;
