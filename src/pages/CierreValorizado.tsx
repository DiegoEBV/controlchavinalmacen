import React, { useState, useEffect, useMemo } from 'react';
import { Card, Form, Table, Row, Col, Button, Modal, Alert, Badge } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatDisplayDate } from '../utils/dateUtils';
import { ejecutarCierreMensual, getCierresMensuales } from '../services/almacenService';
import { FaLock, FaFileExcel } from 'react-icons/fa';

interface MonthOption {
    label: string;
    year: number;
    month: number;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const CierreValorizado: React.FC = () => {
    const { selectedObra, hasRole } = useAuth();
    const [allMovimientos, setAllMovimientos] = useState<any[]>([]);
    const [cierres, setCierres] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [closingMonth, setClosingMonth] = useState(false);

    const canViewCierre = hasRole(['admin', 'almacenero', 'coordinador']);
    const canCloseMonth = hasRole(['almacenero', 'admin']);

    if (!canViewCierre) {
        return (
            <div className="p-5 text-center">
                <Alert variant="danger">
                    <Alert.Heading>Acceso Denegado</Alert.Heading>
                    <p>No tiene permisos suficientes para ver el Cierre Valorizado.</p>
                </Alert>
            </div>
        );
    }

    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

    useEffect(() => {
        if (selectedObra) {
            loadMovimientos();
            loadCierres();
        }
    }, [selectedObra]);

    const loadMovimientos = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            let allMoves: any[] = [];
            let from = 0;
            const step = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from('movimientos_almacen')
                    .select(`
                        id, tipo, cantidad, fecha, documento_referencia, destino_o_uso,
                        solicitante, numero_vale, vintar_code, costo_unitario, created_at,
                        material:materiales(descripcion, categoria, unidad),
                        equipo:equipos(nombre, codigo),
                        epp:epps_c(descripcion, codigo, unidad)
                    `)
                    .eq('obra_id', selectedObra.id)
                    .order('fecha', { ascending: true })
                    .range(from, from + step - 1);
                if (error) { console.error(error); break; }
                if (!data || data.length === 0) break;
                allMoves = [...allMoves, ...data];
                if (data.length < step) break;
                from += step;
            }
            setAllMovimientos(allMoves);
        } catch (err) {
            console.error('Error loading movimientos:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadCierres = async () => {
        if (!selectedObra) return;
        const data = await getCierresMensuales(selectedObra.id);
        setCierres(data);
    };

    const isMonthClosed = useMemo(() => {
        return cierres.some(c => c.anio === selectedYear && c.mes === selectedMonth);
    }, [cierres, selectedYear, selectedMonth]);

    const currentCierre = useMemo(() => {
        return cierres.find(c => c.anio === selectedYear && c.mes === selectedMonth);
    }, [cierres, selectedYear, selectedMonth]);

    const monthMovimientos = useMemo(() => {
        return allMovimientos.filter(m => {
            const d = new Date(m.fecha);
            return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
        });
    }, [allMovimientos, selectedYear, selectedMonth]);

    const beforeMonthMovimientos = useMemo(() => {
        const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
        return allMovimientos.filter(m => new Date(m.fecha) < startOfMonth);
    }, [allMovimientos, selectedYear, selectedMonth]);

    const kpis = useMemo(() => {
        let valorInicial = 0;
        for (const m of beforeMonthMovimientos) {
            const subtotal = (m.cantidad || 0) * (m.costo_unitario || 0);
            if (m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_ENTRADA') valorInicial += subtotal;
            else if (m.tipo === 'SALIDA' || m.tipo === 'AJUSTE_SALIDA') valorInicial -= subtotal;
        }
        let ingresos = 0;
        let egresos = 0;
        for (const m of monthMovimientos) {
            const subtotal = (m.cantidad || 0) * (m.costo_unitario || 0);
            if (m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_ENTRADA') ingresos += subtotal;
            else if (m.tipo === 'SALIDA' || m.tipo === 'AJUSTE_SALIDA') egresos += subtotal;
        }
        return {
            valorInicial: Math.max(0, valorInicial),
            ingresos,
            egresos,
            saldoFinal: Math.max(0, valorInicial + ingresos - egresos)
        };
    }, [monthMovimientos, beforeMonthMovimientos]);

    const availableMonths = useMemo(() => {
        const seen = new Set<string>();
        const months: MonthOption[] = [];
        for (const m of allMovimientos) {
            const d = new Date(m.fecha);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            if (!seen.has(key)) {
                seen.add(key);
                months.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
            }
        }
        const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
        if (!seen.has(currentKey)) {
            months.push({ label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`, year: now.getFullYear(), month: now.getMonth() + 1 });
        }
        return months.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
    }, [allMovimientos]);

    const formatCurrency = (value: number) => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const getItemDescription = (m: any) => {
        if (m.material) return { desc: m.material.descripcion, cat: m.material.categoria, unidad: m.material.unidad };
        if (m.equipo) return { desc: m.equipo.nombre, cat: 'Equipo', unidad: 'UND' };
        if (m.epp) return { desc: m.epp.descripcion, cat: 'EPP', unidad: m.epp.unidad };
        return { desc: 'Desconocido', cat: '-', unidad: '-' };
    };

    const getTipoBadge = (tipo: string) => {
        switch (tipo) {
            case 'ENTRADA': return <Badge bg="success">Entrada</Badge>;
            case 'SALIDA': return <Badge bg="danger">Salida</Badge>;
            case 'AJUSTE_ENTRADA': return <Badge bg="info">Ajuste +</Badge>;
            case 'AJUSTE_SALIDA': return <Badge bg="warning" text="dark">Ajuste -</Badge>;
            default: return <Badge bg="secondary">{tipo}</Badge>;
        }
    };

    const handleCierreMensual = async () => {
        if (!selectedObra) return;
        setClosingMonth(true);
        try {
            const result = await ejecutarCierreMensual(selectedObra.id, selectedYear, selectedMonth, 'Almacenero');
            const res = result as any;
            alert(`✅ Cierre ejecutado exitosamente!\n\nValor Total: ${formatCurrency(res?.valor_total || 0)}\nÍtems: ${res?.total_items || 0}`);
            setShowConfirmModal(false);
            loadCierres();
        } catch (err: any) {
            alert('❌ Error: ' + (err.message || 'No se pudo ejecutar el cierre'));
        } finally {
            setClosingMonth(false);
        }
    };

    const handleExportExcel = async () => {
        const XLSX = await import('xlsx');
        const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
        const rows = monthMovimientos.map(m => {
            const item = getItemDescription(m);
            const cu = m.costo_unitario || 0;
            const subtotal = (m.cantidad || 0) * cu;
            return {
                'Fecha': formatDisplayDate(m.fecha),
                'Tipo': m.tipo,
                'Documento': m.documento_referencia || m.numero_vale || m.vintar_code || '-',
                'Material': item.desc,
                'Categoría': item.cat,
                'Cantidad': m.cantidad,
                'Unidad': item.unidad,
                'Costo Unit. (S/)': cu,
                'Subtotal (S/)': subtotal
            };
        });

        // Add summary rows
        rows.push({} as any);
        rows.push({ 'Fecha': 'RESUMEN', 'Tipo': monthLabel } as any);
        rows.push({ 'Fecha': 'Valor Inicial', 'Subtotal (S/)': kpis.valorInicial } as any);
        rows.push({ 'Fecha': 'Total Ingresos', 'Subtotal (S/)': kpis.ingresos } as any);
        rows.push({ 'Fecha': 'Total Egresos', 'Subtotal (S/)': kpis.egresos } as any);
        rows.push({ 'Fecha': 'Saldo Final', 'Subtotal (S/)': kpis.saldoFinal } as any);

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Cierre ${monthLabel}`);
        XLSX.writeFile(wb, `Cierre_Valorizado_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.xlsx`);
    };

    return (
        <div className="fade-in">
            <div className="page-header d-flex justify-content-between align-items-center">
                <div>
                    <h2>Cierre Valorizado</h2>
                    <p className="text-muted mb-0">Resumen ejecutivo y detalle cronológico de movimientos valorizados por mes.</p>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    {isMonthClosed && (
                        <Badge bg="success" className="px-3 py-2 fs-6">
                            <FaLock className="me-1" /> CERRADO
                        </Badge>
                    )}
                </div>
            </div>

            {/* Month Selector + Actions */}
            <Row className="mb-4 mt-3 align-items-end">
                <Col xs={12} md={3}>
                    <Form.Group>
                        <Form.Label className="fw-bold">Seleccionar Período</Form.Label>
                        <Form.Select
                            value={`${selectedYear}-${selectedMonth}`}
                            onChange={(e) => {
                                const [y, m] = e.target.value.split('-').map(Number);
                                setSelectedYear(y);
                                setSelectedMonth(m);
                            }}
                        >
                            {availableMonths.map(opt => (
                                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                                    {opt.label} {cierres.some(c => c.anio === opt.year && c.mes === opt.month) ? '🔒' : ''}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Col>
                <Col xs={12} md={9} className="d-flex gap-2 justify-content-md-end mt-3 mt-md-0">
                    <Button 
                        variant="success" 
                        className="rounded-pill px-4 fw-bold shadow-sm"
                        onClick={handleExportExcel} 
                        disabled={monthMovimientos.length === 0}
                    >
                        <FaFileExcel className="me-2" /> Exportar Excel
                    </Button>
                    {canCloseMonth && !isMonthClosed && (
                        <Button 
                            variant="danger" 
                            className="rounded-pill px-4 fw-bold shadow-sm"
                            onClick={() => setShowConfirmModal(true)}
                        >
                            <FaLock className="me-2" /> Cerrar Mes
                        </Button>
                    )}
                </Col>
            </Row>

            {/* Cierre info banner */}
            {isMonthClosed && currentCierre && (
                <Alert variant="success" className="d-flex justify-content-between align-items-center">
                    <span>
                        <strong>Mes cerrado</strong> el {formatDisplayDate(currentCierre.fecha_cierre)} por <strong>{currentCierre.usuario}</strong>.
                        Valor total al cierre: <strong>{formatCurrency(currentCierre.valor_total || 0)}</strong> ({currentCierre.total_items} ítems).
                    </span>
                </Alert>
            )}

            {/* KPI Cards */}
            <Row className="mb-4 g-3">
                <Col xs={6} md={3}>
                    <Card className="text-center border-0 shadow-sm h-100" style={{ borderLeft: '4px solid #6c757d' }}>
                        <Card.Body className="py-3">
                            <div className="text-muted small mb-1">Valor Inicial</div>
                            <div className="fw-bold fs-5 text-secondary">{formatCurrency(kpis.valorInicial)}</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={6} md={3}>
                    <Card className="text-center border-0 shadow-sm h-100" style={{ borderLeft: '4px solid #198754' }}>
                        <Card.Body className="py-3">
                            <div className="text-muted small mb-1">Ingresos del Mes</div>
                            <div className="fw-bold fs-5 text-success">{formatCurrency(kpis.ingresos)}</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={6} md={3}>
                    <Card className="text-center border-0 shadow-sm h-100" style={{ borderLeft: '4px solid #dc3545' }}>
                        <Card.Body className="py-3">
                            <div className="text-muted small mb-1">Egresos del Mes</div>
                            <div className="fw-bold fs-5 text-danger">{formatCurrency(kpis.egresos)}</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={6} md={3}>
                    <Card className="text-center border-0 shadow-sm h-100" style={{ borderLeft: '4px solid #0d6efd' }}>
                        <Card.Body className="py-3">
                            <div className="text-muted small mb-1">Saldo Final</div>
                            <div className="fw-bold fs-5 text-primary">{formatCurrency(kpis.saldoFinal)}</div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Detail Table */}
            <Card className="custom-card p-0 overflow-hidden">
                <Card.Header className="bg-white d-flex justify-content-between align-items-center py-3">
                    <h5 className="mb-0 fw-bold text-secondary">Detalle de Movimientos Valorizados</h5>
                    <span className="badge bg-secondary">{monthMovimientos.length} movimientos</span>
                </Card.Header>
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Documento</th>
                            <th>Material / Descripción</th>
                            <th className="text-center">Cantidad</th>
                            <th className="text-end">Costo Unit. (S/)</th>
                            <th className="text-end">Subtotal (S/)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="text-center p-5">Cargando movimientos...</td></tr>
                        ) : monthMovimientos.length === 0 ? (
                            <tr><td colSpan={7} className="text-center p-5 text-muted">No hay movimientos en este período.</td></tr>
                        ) : (
                            monthMovimientos.map(m => {
                                const item = getItemDescription(m);
                                const cu = m.costo_unitario || 0;
                                const subtotal = (m.cantidad || 0) * cu;
                                const isEntrada = m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_ENTRADA';
                                const docRef = m.documento_referencia || m.numero_vale || m.vintar_code || '-';

                                return (
                                    <tr key={m.id}>
                                        <td className="small">{formatDisplayDate(m.fecha)}</td>
                                        <td>{getTipoBadge(m.tipo)}</td>
                                        <td className="small fw-bold">{docRef}</td>
                                        <td>
                                            <div className="fw-medium">{item.desc}</div>
                                            <div className="small text-muted">{item.cat}</div>
                                        </td>
                                        <td className="text-center">{m.cantidad} {item.unidad}</td>
                                        <td className="text-end">{cu > 0 ? formatCurrency(cu) : '-'}</td>
                                        <td className={`text-end fw-bold ${isEntrada ? 'text-success' : 'text-danger'}`}>
                                            {subtotal > 0 ? (isEntrada ? '+' : '-') + formatCurrency(subtotal) : '-'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                    {monthMovimientos.length > 0 && (
                        <tfoot className="border-top">
                            <tr className="fw-bold bg-light">
                                <td colSpan={5}></td>
                                <td className="text-end">Total Ingresos:</td>
                                <td className="text-end text-success">{formatCurrency(kpis.ingresos)}</td>
                            </tr>
                            <tr className="fw-bold bg-light">
                                <td colSpan={5}></td>
                                <td className="text-end">Total Egresos:</td>
                                <td className="text-end text-danger">{formatCurrency(kpis.egresos)}</td>
                            </tr>
                            <tr className="fw-bold bg-light">
                                <td colSpan={5}></td>
                                <td className="text-end text-primary">Saldo Final:</td>
                                <td className="text-end text-primary fs-5">{formatCurrency(kpis.saldoFinal)}</td>
                            </tr>
                        </tfoot>
                    )}
                </Table>
            </Card>

            {/* Confirmation Modal */}
            <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered>
                <Modal.Header closeButton className="bg-danger text-white">
                    <Modal.Title><FaLock className="me-2" />Confirmar Cierre Mensual</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Alert variant="warning">
                        <strong>⚠️ Importante:</strong> Antes de cerrar el mes, asegúrese de haber realizado el <strong>Ajuste de Inventario</strong> (conteo físico) en la vista de Stock.
                    </Alert>
                    <p>Está a punto de cerrar el período <strong>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong>.</p>
                    <p>Esto generará un <strong>snapshot</strong> del inventario actual con todos los costos. Esta acción <strong>no se puede deshacer</strong>.</p>
                    <div className="bg-light p-3 rounded">
                        <div className="d-flex justify-content-between"><span>Valor Inicial:</span> <strong>{formatCurrency(kpis.valorInicial)}</strong></div>
                        <div className="d-flex justify-content-between text-success"><span>+ Ingresos:</span> <strong>{formatCurrency(kpis.ingresos)}</strong></div>
                        <div className="d-flex justify-content-between text-danger"><span>- Egresos:</span> <strong>{formatCurrency(kpis.egresos)}</strong></div>
                        <hr />
                        <div className="d-flex justify-content-between text-primary fs-5"><span>Saldo Final:</span> <strong>{formatCurrency(kpis.saldoFinal)}</strong></div>
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 pb-4">
                    <Button variant="link" className="text-secondary text-decoration-none fw-bold" onClick={() => setShowConfirmModal(false)}>
                        Cancelar
                    </Button>
                    <Button 
                        variant="danger" 
                        className="rounded-pill px-4 fw-bold shadow-sm"
                        onClick={handleCierreMensual} 
                        disabled={closingMonth}
                    >
                        {closingMonth ? 'Procesando...' : <><FaLock className="me-2" /> Confirmar Cierre</>}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default CierreValorizado;
