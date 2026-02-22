import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Table, Badge, ProgressBar } from 'react-bootstrap';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, ComposedChart, Area
} from 'recharts';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos } from '../services/requerimientosService';
import { getMovimientos } from '../services/almacenService';
import { useAuth } from '../context/AuthContext';
import { Requerimiento, MovimientoAlmacen } from '../types';

// ─── Paleta ─────────────────────────────────────────────────────────────────
const PALETTE = {
    verde: '#22c55e',
    azul: '#3b82f6',
    naranja: '#f97316',
    rojo: '#ef4444',
    morado: '#8b5cf6',
    cyan: '#06b6d4',
    amarillo: '#eab308',
    gris: '#6b7280',
};
const PIE_COLORS = [PALETTE.azul, PALETTE.verde, PALETTE.naranja, PALETTE.morado, PALETTE.cyan, PALETTE.amarillo, PALETTE.rojo];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, dec = 1) => n.toFixed(dec);



const diasDesde = (fechaStr: string) => {
    const diff = new Date().getTime() - new Date(fechaStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};
const semanaKey = (fechaStr: string) => {
    const d = new Date(fechaStr);
    // Obtener número de semana ISO simple
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `S${weekNum} (${d.toLocaleDateString('es-PE', { month: 'short' })})`;
};

// ─── KPI Card mini ───────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) => (
    <Card className="custom-card h-100" style={{ borderLeft: `4px solid ${color}` }}>
        <Card.Body className="p-3">
            <div className="d-flex justify-content-between align-items-start">
                <div>
                    <div className="text-muted small mb-1">{label}</div>
                    <div className="fw-bold fs-4" style={{ color }}>{value}</div>
                    {sub && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{sub}</div>}
                </div>
                <span style={{ fontSize: '1.8rem', opacity: 0.5 }}>{icon}</span>
            </div>
        </Card.Body>
    </Card>
);

// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border rounded shadow p-2" style={{ fontSize: '0.8rem' }}>
                <p className="mb-1 fw-bold">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} className="mb-0" style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
                ))}
            </div>
        );
    }
    return null;
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const EstadisticasMateriales: React.FC = () => {
    const { selectedObra } = useAuth();
    const [loading, setLoading] = useState(true);

    // Datos crudos
    const [movimientos, setMovimientos] = useState<MovimientoAlmacen[]>([]);
    const [reqs, setReqs] = useState<Requerimiento[]>([]);
    const [inventario, setInventario] = useState<any[]>([]);
    // Set de claves "requerimiento_id::item_id" donde la SC puso cantidad = 0
    const [scZeroSet, setScZeroSet] = useState<Set<string>>(new Set());

    // Filtros
    const [periodoFiltro, setPeriodoFiltro] = useState<'7' | '30' | '90' | 'todo'>('30');

    // ── Carga de datos ──────────────────────────────────────────────────────
    useEffect(() => {
        if (selectedObra) loadData();
        else setLoading(false);
    }, [selectedObra]);

    const loadData = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            const [movsData, reqsResp, invData, scZeroData] = await Promise.all([
                getMovimientos(selectedObra.id),
                getRequerimientos(selectedObra.id),
                supabase
                    .from('inventario_obra')
                    .select('*, material:materiales(id, descripcion, categoria, unidad)')
                    .eq('obra_id', selectedObra.id),
                // Trae los ítems de SC con cantidad=0 (rechazados/anulados en logística)
                supabase
                    .from('detalles_sc')
                    .select('material_id, epp_id, equipo_id, sc:solicitudes_compra!inner(requerimiento_id)')
                    .eq('cantidad', 0)
            ]);

            setMovimientos(movsData || []);
            setReqs(reqsResp.data || []);
            setInventario(invData.data || []);

            // Construir set de exclusión: clave = "reqId::itemId"
            const zeroSet = new Set<string>();
            (scZeroData.data || []).forEach((d: any) => {
                const reqId = d.sc?.requerimiento_id;
                const itemId = d.material_id || d.epp_id || d.equipo_id;
                if (reqId && itemId) zeroSet.add(`${reqId}::${itemId}`);
            });
            setScZeroSet(zeroSet);
        } catch (e) {
            console.error('Error loading stats:', e);
        } finally {
            setLoading(false);
        }
    };

    // ── Filtrar por período ──────────────────────────────────────────────────
    const fechaCorteMov = useMemo(() => {
        if (periodoFiltro === 'todo') return null;
        const d = new Date();
        d.setDate(d.getDate() - parseInt(periodoFiltro));
        return d;
    }, [periodoFiltro]);

    const movsFiltrados = useMemo(() =>
        movimientos.filter(m => !fechaCorteMov || new Date(m.created_at) >= fechaCorteMov),
        [movimientos, fechaCorteMov]
    );

    /**
     * Predicado de filtro para detalles_requerimiento.
     * Excluye los ítems que en la SC se pusieron en cantidad = 0:
     *   - Busca la clave "requerimiento_id::item_id" en scZeroSet
     *   - También excluye los marcados Cancelado con cantidad_atendida = 0 (fallback)
     */
    const detalleValido = useMemo(() =>
        (d: any, reqId: string) => {
            const itemId = d.material_id || d.epp_id || d.equipo_id;
            if (itemId && scZeroSet.has(`${reqId}::${itemId}`)) return false;
            // Fallback: estado Cancelado con cantidad 0
            if (d.estado === 'Cancelado' && (d.cantidad_atendida === 0 || d.cantidad_atendida === null)) return false;
            return true;
        },
        [scZeroSet]
    );

    // ── KPI 1: Resumen de movimientos ───────────────────────────────────────
    const { totalEntradas, totalCajaChica, totalOC } = useMemo(() => {
        let entradas = 0, cajaChica = 0, oc = 0;
        movsFiltrados.forEach(m => {
            if (m.tipo === 'ENTRADA') {
                entradas += m.cantidad;
                const doc = (m.documento_referencia || '').toUpperCase();
                if (doc.includes('CC') || doc.includes('CAJA')) cajaChica += m.cantidad;
                else oc += m.cantidad;
            }
        });
        return { totalEntradas: entradas, totalCajaChica: cajaChica, totalOC: oc };
    }, [movsFiltrados]);

    // ── KPI 2: Stock crítico ─────────────────────────────────────────────────
    // Calcular consumo diario de últimos 30 días para estimar días de stock
    const stockCritico = useMemo(() => {
        const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
        const consumo30: Record<string, number> = {};
        movimientos
            .filter(m => m.tipo === 'SALIDA' && m.material_id && new Date(m.created_at) >= hace30)
            .forEach(m => {
                consumo30[m.material_id!] = (consumo30[m.material_id!] || 0) + m.cantidad;
            });

        return inventario
            .filter(inv => inv.material && inv.cantidad_actual > 0)
            .map(inv => {
                const consumoDiario = (consumo30[inv.material_id] || 0) / 30;
                const diasStock = consumoDiario > 0 ? Math.floor(inv.cantidad_actual / consumoDiario) : 999;
                return {
                    material: inv.material?.descripcion || '-',
                    categoria: inv.material?.categoria || '-',
                    unidad: inv.material?.unidad || '-',
                    stock: inv.cantidad_actual,
                    consumoDiario: fmt(consumoDiario, 2),
                    diasStock,
                    nivel: diasStock <= 7 ? 'critico' : diasStock <= 14 ? 'bajo' : 'ok'
                };
            })
            .filter(i => i.nivel !== 'ok')
            .sort((a, b) => a.diasStock - b.diasStock)
            .slice(0, 10);
    }, [inventario, movimientos]);

    // ── KPI 3: Items sin stock solicitados ───────────────────────────────────
    // Se excluyen ítems cuya cantidad en SC es 0
    const sinStock = useMemo(() => {
        const stockMap: Record<string, number> = {};
        inventario.forEach(inv => {
            if (inv.material_id) stockMap[inv.material_id] = inv.cantidad_actual;
        });

        const pendMap: Record<string, { descripcion: string; total: number; reqs: number; diasMax: number }> = {};
        reqs.forEach(r => {
            r.detalles?.filter(d => detalleValido(d, r.id)).forEach(d => {
                if ((d.estado === 'Pendiente' || d.estado === 'Parcial') && d.material_id) {
                    const stock = stockMap[d.material_id] || 0;
                    const faltante = Math.max(0, d.cantidad_solicitada - (d.cantidad_atendida || 0));
                    if (faltante > 0 && stock < faltante) {
                        const key = d.material_id;
                        const dias = diasDesde(r.fecha_solicitud);
                        if (!pendMap[key]) pendMap[key] = { descripcion: d.descripcion, total: 0, reqs: 0, diasMax: 0 };
                        pendMap[key].total += faltante;
                        pendMap[key].reqs += 1;
                        pendMap[key].diasMax = Math.max(pendMap[key].diasMax, dias);
                    }
                }
            });
        });

        return Object.values(pendMap).sort((a, b) => b.diasMax - a.diasMax).slice(0, 8);
    }, [reqs, inventario, detalleValido]);

    // ── KPI 4: Flujo semanal entradas vs salidas ─────────────────────────────
    const flujoSemanal = useMemo(() => {
        const map: Record<string, { semana: string; entradas: number; salidas: number }> = {};
        movsFiltrados.forEach(m => {
            const key = semanaKey(m.created_at);
            if (!map[key]) map[key] = { semana: key, entradas: 0, salidas: 0 };
            if (m.tipo === 'ENTRADA') map[key].entradas += m.cantidad;
            else map[key].salidas += m.cantidad;
        });
        return Object.values(map).sort((a, b) => a.semana.localeCompare(b.semana));
    }, [movsFiltrados]);

    // ── KPI 5: Top materiales más consumidos (salidas) ───────────────────────
    const topConsumo = useMemo(() => {
        const map: Record<string, { name: string; salidas: number; entradas: number }> = {};
        movsFiltrados.forEach(m => {
            const nombre = m.material?.descripcion || m.equipo?.nombre || m.epp?.descripcion || 'Sin nombre';
            if (!map[nombre]) map[nombre] = { name: nombre, salidas: 0, entradas: 0 };
            if (m.tipo === 'SALIDA') map[nombre].salidas += m.cantidad;
            else map[nombre].entradas += m.cantidad;
        });
        return Object.values(map).filter(i => i.salidas > 0).sort((a, b) => b.salidas - a.salidas).slice(0, 10);
    }, [movsFiltrados]);

    // ── KPI 6: Requerimientos pendientes por antigüedad ──────────────────────
    // Excluye ítems cuya cantidad en SC es 0
    const reqsPendientes = useMemo(() => {
        const buckets = { critico: 0, alto: 0, normal: 0 };
        let totalItems = 0;
        reqs.forEach(r => {
            const dias = diasDesde(r.fecha_solicitud);
            r.detalles?.filter(d => detalleValido(d, r.id)).forEach(d => {
                if (d.estado === 'Pendiente' || d.estado === 'Parcial') {
                    totalItems++;
                    if (dias > 14) buckets.critico++;
                    else if (dias > 7) buckets.alto++;
                    else buckets.normal++;
                }
            });
        });
        return { ...buckets, total: totalItems };
    }, [reqs, detalleValido]);

    // ── KPI 7: Caja chica vs OC (pie) ────────────────────────────────────────
    const pieCompras = useMemo(() => {
        if (totalEntradas === 0) return [];
        const ccPct = Math.round((totalCajaChica / totalEntradas) * 100);
        const ocPct = Math.round((totalOC / totalEntradas) * 100);
        const resto = 100 - ccPct - ocPct;
        const data = [
            { name: 'Caja Chica', value: totalCajaChica },
            { name: 'Orden de Compra', value: totalOC },
        ];
        if (resto > 0) data.push({ name: 'Otros', value: totalEntradas - totalCajaChica - totalOC });
        return data.filter(d => d.value > 0);
    }, [totalEntradas, totalCajaChica, totalOC]);

    // ── KPI 8: Eficiencia de atención ────────────────────────────────────────
    // Denominador = TOTAL APROBADO (excluye cant=0 en SC)
    const eficiencia = useMemo(() => {
        let aprobado = 0, ate = 0, ccAte = 0;
        reqs.forEach(r => {
            if (fechaCorteMov && new Date(r.fecha_solicitud) < fechaCorteMov) return;
            r.detalles?.filter(d => detalleValido(d, r.id)).forEach(d => {
                aprobado += d.cantidad_solicitada || 0;
                ate += d.cantidad_atendida || 0;
                ccAte += d.cantidad_caja_chica || 0;
            });
        });
        return {
            ratio: aprobado > 0 ? Math.round((ate / aprobado) * 100) : 0,
            totalAprobado: aprobado,
            totalAte: ate,
            pctCC: ate > 0 ? Math.round((ccAte / ate) * 100) : 0,
        };
    }, [reqs, fechaCorteMov, detalleValido]);

    // ── KPI 9: Top solicitantes ──────────────────────────────────────────────
    // Excluye ítems cuya cantidad en SC es 0
    const topSolicitantes = useMemo(() => {
        const map: Record<string, number> = {};
        reqs.forEach(r => {
            if (fechaCorteMov && new Date(r.fecha_solicitud) < fechaCorteMov) return;
            const key = r.solicitante || 'Sin nombre';
            r.detalles?.filter(d => detalleValido(d, r.id)).forEach(d => {
                map[key] = (map[key] || 0) + (d.cantidad_solicitada || 0);
            });
        });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    }, [reqs, fechaCorteMov, detalleValido]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
            <div className="text-center">
                <div className="spinner-border text-primary mb-3" />
                <div className="text-muted">Cargando estadísticas...</div>
            </div>
        </div>
    );

    if (!selectedObra) return (
        <div className="text-center p-5 text-muted">
            <div style={{ fontSize: '3rem' }}>🏗️</div>
            <p>Seleccione una obra para ver las estadísticas.</p>
        </div>
    );

    return (
        <div className="fade-in container-fluid pb-5">
            {/* ── Header ── */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-2">
                <div>
                    <h2 className="mb-0">📊 Panel de Control — Obra</h2>
                    <small className="text-muted">{selectedObra.nombre_obra}</small>
                </div>
                {/* Filtro de período */}
                <div className="btn-group" role="group">
                    {([['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['todo', 'Todo']] as const).map(([val, label]) => (
                        <button
                            key={val}
                            className={`btn btn-sm ${periodoFiltro === val ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => setPeriodoFiltro(val)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Fila 1: KPIs rápidos ── */}
            <Row className="mb-4 g-3">
                <Col xs={6} md={3}>
                    <KpiCard
                        label="Tasa de Atención"
                        value={`${eficiencia.ratio}%`}
                        sub={`${eficiencia.totalAte} / ${eficiencia.totalAprobado} aprobadas`}
                        color={eficiencia.ratio >= 80 ? PALETTE.verde : eficiencia.ratio >= 60 ? PALETTE.amarillo : PALETTE.rojo}
                        icon="✅"
                    />
                </Col>
                <Col xs={6} md={3}>
                    <KpiCard
                        label="Items Pendientes"
                        value={reqsPendientes.total}
                        sub={`${reqsPendientes.critico} críticos (+14 días)`}
                        color={reqsPendientes.critico > 0 ? PALETTE.rojo : PALETTE.naranja}
                        icon="⏳"
                    />
                </Col>
                <Col xs={6} md={3}>
                    <KpiCard
                        label="Materiales en Riesgo"
                        value={stockCritico.length}
                        sub={`${stockCritico.filter(i => i.nivel === 'critico').length} se agotan en ≤7 días`}
                        color={stockCritico.filter(i => i.nivel === 'critico').length > 0 ? PALETTE.rojo : PALETTE.amarillo}
                        icon="⚠️"
                    />
                </Col>
                <Col xs={6} md={3}>
                    <KpiCard
                        label="Caja Chica / Total Entradas"
                        value={`${totalEntradas > 0 ? Math.round((totalCajaChica / totalEntradas) * 100) : 0}%`}
                        sub={`${totalCajaChica.toLocaleString()} vs ${totalEntradas.toLocaleString()} uds`}
                        color={totalEntradas > 0 && (totalCajaChica / totalEntradas) > 0.4 ? PALETTE.naranja : PALETTE.azul}
                        icon="💵"
                    />
                </Col>
            </Row>

            {/* ── Fila 2: Flujo semanal + Antigüedad pendientes ── */}
            <Row className="mb-4 g-3">
                <Col xs={12} md={8}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">📈 Flujo Semanal: Entradas vs Salidas</Card.Header>
                        <Card.Body style={{ height: 280 }}>
                            {flujoSemanal.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={flujoSemanal} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Area type="monotone" dataKey="entradas" fill="#dbeafe" stroke={PALETTE.azul} name="Entradas" strokeWidth={2} />
                                        <Bar dataKey="salidas" fill={PALETTE.naranja} name="Salidas" radius={[3, 3, 0, 0]} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sin movimientos en el período</div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={12} md={4}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">⏳ Antigüedad de Pendientes</Card.Header>
                        <Card.Body>
                            <div className="mb-3">
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="small text-danger fw-bold">🔴 Crítico (+14 días)</span>
                                    <Badge bg="danger">{reqsPendientes.critico}</Badge>
                                </div>
                                <ProgressBar
                                    now={reqsPendientes.total > 0 ? (reqsPendientes.critico / reqsPendientes.total) * 100 : 0}
                                    variant="danger"
                                    style={{ height: 8 }}
                                />
                            </div>
                            <div className="mb-3">
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="small text-warning fw-bold">🟡 Alto (7–14 días)</span>
                                    <Badge bg="warning" text="dark">{reqsPendientes.alto}</Badge>
                                </div>
                                <ProgressBar
                                    now={reqsPendientes.total > 0 ? (reqsPendientes.alto / reqsPendientes.total) * 100 : 0}
                                    variant="warning"
                                    style={{ height: 8 }}
                                />
                            </div>
                            <div className="mb-3">
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="small text-success fw-bold">🟢 Normal (&lt;7 días)</span>
                                    <Badge bg="success">{reqsPendientes.normal}</Badge>
                                </div>
                                <ProgressBar
                                    now={reqsPendientes.total > 0 ? (reqsPendientes.normal / reqsPendientes.total) * 100 : 0}
                                    variant="success"
                                    style={{ height: 8 }}
                                />
                            </div>
                            <hr />
                            <div className="text-center">
                                <span className="text-muted small">Total ítems pendientes</span>
                                <div className="display-6 fw-bold" style={{ color: PALETTE.naranja }}>{reqsPendientes.total}</div>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── Fila 3: Stock crítico ── */}
            <Row className="mb-4 g-3">
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header className="fw-bold d-flex justify-content-between align-items-center">
                            <span>🚨 Stock en Riesgo — Días Estimados Restantes</span>
                            <Badge bg={stockCritico.filter(i => i.nivel === 'critico').length > 0 ? 'danger' : 'warning'} text={stockCritico.filter(i => i.nivel === 'critico').length > 0 ? undefined : 'dark'}>
                                {stockCritico.length} materiales en riesgo
                            </Badge>
                        </Card.Header>
                        <Card.Body className="p-0">
                            {stockCritico.length > 0 ? (
                                <div className="table-responsive">
                                    <Table hover className="mb-0" size="sm">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Material</th>
                                                <th>Categoría</th>
                                                <th className="text-center">Stock Actual</th>
                                                <th className="text-center">Consumo/Día (últ 30d)</th>
                                                <th className="text-center">Días Restantes</th>
                                                <th className="text-center">Alerta</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockCritico.map((item, i) => (
                                                <tr key={i} className={item.nivel === 'critico' ? 'table-danger' : 'table-warning'}>
                                                    <td className="fw-bold">{item.material}</td>
                                                    <td><Badge bg="secondary" className="fw-normal">{item.categoria}</Badge></td>
                                                    <td className="text-center">{item.stock} {item.unidad}</td>
                                                    <td className="text-center">{item.consumoDiario}</td>
                                                    <td className="text-center fw-bold">
                                                        {item.diasStock >= 999 ? '—' : `${item.diasStock} días`}
                                                    </td>
                                                    <td className="text-center">
                                                        {item.nivel === 'critico'
                                                            ? <Badge bg="danger">⚡ URGENTE</Badge>
                                                            : <Badge bg="warning" text="dark">⚠️ REABASTECER</Badge>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center p-4 text-muted">
                                    <div style={{ fontSize: '2rem' }}>✅</div>
                                    <p className="mb-0">No hay materiales en riesgo de quiebre de stock.</p>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── Fila 4: Materiales faltantes vs Top consumo ── */}
            <Row className="mb-4 g-3">
                <Col xs={12} md={5}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">❌ Materiales Solicitados Sin Stock Suficiente</Card.Header>
                        <Card.Body className="p-0">
                            {sinStock.length > 0 ? (
                                <div className="table-responsive">
                                    <Table hover className="mb-0" size="sm">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Material</th>
                                                <th className="text-center">Faltante</th>
                                                <th className="text-center">Reqs</th>
                                                <th className="text-center">Max. Espera</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sinStock.map((item, i) => (
                                                <tr key={i} className={item.diasMax > 14 ? 'table-danger' : item.diasMax > 7 ? 'table-warning' : ''}>
                                                    <td className="fw-bold" style={{ fontSize: '0.82rem' }}>{item.descripcion}</td>
                                                    <td className="text-center">{item.total}</td>
                                                    <td className="text-center">{item.reqs}</td>
                                                    <td className="text-center">
                                                        <Badge bg={item.diasMax > 14 ? 'danger' : item.diasMax > 7 ? 'warning' : 'secondary'} text={item.diasMax <= 14 ? 'dark' : undefined}>
                                                            {item.diasMax}d
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center p-4 text-muted">
                                    <div style={{ fontSize: '2rem' }}>👍</div>
                                    <p className="mb-0">No hay materiales pendientes sin stock.</p>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col xs={12} md={7}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">📦 Top 10 Materiales Más Salidos del Almacén</Card.Header>
                        <Card.Body style={{ height: 300 }}>
                            {topConsumo.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topConsumo} layout="vertical" margin={{ left: 10, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 10 }} />
                                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 9 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Bar dataKey="entradas" fill={PALETTE.azul} name="Entradas" radius={[0, 3, 3, 0]} />
                                        <Bar dataKey="salidas" fill={PALETTE.naranja} name="Salidas" radius={[0, 3, 3, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sin movimientos en el período</div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── Fila 5: Origen de compras + Top solicitantes ── */}
            <Row className="mb-4 g-3">
                <Col xs={12} md={4}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">💵 Origen de Entradas al Almacén</Card.Header>
                        <Card.Body style={{ height: 260 }}>
                            {pieCompras.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height="80%">
                                        <PieChart>
                                            <Pie data={pieCompras} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                                                {pieCompras.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v) => [v, '']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="d-flex flex-wrap justify-content-center gap-2 mt-1">
                                        {pieCompras.map((entry, i) => (
                                            <span key={i} className="small" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                                                ● {entry.name}: <strong>{entry.value}</strong>
                                            </span>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sin entradas en el período</div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col xs={12} md={8}>
                    <Card className="custom-card h-100">
                        <Card.Header className="fw-bold">👷 Top Solicitantes (por Cantidad Pedida)</Card.Header>
                        <Card.Body style={{ height: 260 }}>
                            {topSolicitantes.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topSolicitantes} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} height={60} interval={0} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" name="Unidades solicitadas" fill={PALETTE.morado} radius={[4, 4, 0, 0]}>
                                            {topSolicitantes.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sin datos de solicitantes</div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── Fila 6: Resumen de eficiencia ── */}
            <Row className="mb-4 g-3">
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header className="fw-bold">🎯 Resumen de Eficiencia de Atención</Card.Header>
                        <Card.Body>
                            <Row className="g-3 text-center">
                                <Col xs={6} md={3}>
                                    <div className="text-muted small mb-1">Total Aprobado (SC)</div>
                                    <div className="fw-bold fs-4">{eficiencia.totalAprobado.toLocaleString()}</div>
                                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>unidades aprobadas en SC</div>
                                </Col>
                                <Col xs={6} md={3}>
                                    <div className="text-muted small mb-1">Total Atendido</div>
                                    <div className="fw-bold fs-4" style={{ color: PALETTE.verde }}>{eficiencia.totalAte.toLocaleString()}</div>
                                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>unidades</div>
                                </Col>
                                <Col xs={6} md={3}>
                                    <div className="text-muted small mb-1">% Atendido por Caja Chica</div>
                                    <div className="fw-bold fs-4" style={{ color: eficiencia.pctCC > 40 ? PALETTE.naranja : PALETTE.azul }}>
                                        {eficiencia.pctCC}%
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>del total atendido</div>
                                </Col>
                                <Col xs={6} md={3}>
                                    <div className="text-muted small mb-1">Tasa Global de Atención</div>
                                    <div className="fw-bold fs-4" style={{ color: eficiencia.ratio >= 80 ? PALETTE.verde : eficiencia.ratio >= 60 ? PALETTE.amarillo : PALETTE.rojo }}>
                                        {eficiencia.ratio}%
                                    </div>
                                    <div className="mt-2">
                                        <ProgressBar
                                            now={eficiencia.ratio}
                                            variant={eficiencia.ratio >= 80 ? 'success' : eficiencia.ratio >= 60 ? 'warning' : 'danger'}
                                            style={{ height: 10, borderRadius: 5 }}
                                        />
                                    </div>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default EstadisticasMateriales;
