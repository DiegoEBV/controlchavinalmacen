import React, { useState, useEffect, useMemo } from 'react';
import { Badge, ProgressBar } from 'react-bootstrap';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, ComposedChart, Area
} from 'recharts';
import { supabase } from '../config/supabaseClient';
import { getRequerimientos } from '../services/requerimientosService';
import { getAllMovimientos } from '../services/almacenService';
import { useAuth } from '../context/AuthContext';
import { Requerimiento, MovimientoAlmacen } from '../types';

// ─── Paleta ─────────────────────────────────────────────────────────────────
const PALETTE = {
    emerald: '#10B981', 
    indigo: '#6366F1',
    amber: '#F59E0B',
    sky: '#0EA5E9',
    slate: '#64748B',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    navy: '#1E293B'
};

const PIE_COLORS = [PALETTE.emerald, PALETTE.indigo, PALETTE.sky, PALETTE.amber, '#8B5CF6'];

const GRADIENTS = {
    emerald: 'url(#colorEmerald)',
    indigo: 'url(#colorIndigo)',
    sky: 'url(#colorSky)',
    amber: 'url(#colorAmber)'
};



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
// ─── KPI Card ───────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, icon, gradient, dark }: { label: string; value: string | number; sub?: string; color: string; icon: string; gradient?: boolean; dark?: boolean }) => (
    <div className={`dashboard-card h-100 ${dark ? 'dashboard-card-dark' : gradient ? 'dashboard-card-gradient-1' : ''} glass-card`}>
        <div className="d-flex justify-content-between align-items-start position-relative z-index-1">
            <div className="flex-grow-1">
                <div className={`stat-label mb-1 ${dark || gradient ? 'text-white-50' : ''}`}>{label}</div>
                <div className="stat-value mb-1">{value}</div>
                {sub && <div className={`${dark || gradient ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.75rem' }}>{sub}</div>}
            </div>
            <div className="p-2 rounded-circle glass-card" style={{ fontSize: '1.5rem', background: 'rgba(255,255,255,0.1)' }}>
                {icon}
            </div>
        </div>
        {/* Subtle background glow */}
        {!dark && !gradient && <div className="position-absolute border-radius-pill" style={{ width: 100, height: 100, background: color, filter: 'blur(60px)', opacity: 0.1, top: -20, right: -20 }} />}
    </div>
);

// ─── Tooltip personalizado ────────────────────────────────────────────────────
// ─── Tooltip personalizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass-card border-0 shadow-lg p-3" style={{ fontSize: '0.85rem', minWidth: 150 }}>
                <p className="mb-2 fw-bold text-dark border-bottom pb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <div key={i} className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-muted d-flex align-items-center">
                            <span className="rounded-circle me-2" style={{ width: 8, height: 8, background: p.color }} />
                            {p.name}
                        </span>
                        <span className="fw-bold ms-3" style={{ color: p.color }}>{p.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// ─── Gradients Component ─────────────────────────────────────────────────────
const ChartGradients = () => (
    <svg style={{ height: 0, width: 0, position: 'absolute' }}>
        <defs>
            <linearGradient id="colorEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PALETTE.emerald} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE.emerald} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorIndigo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PALETTE.indigo} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE.indigo} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PALETTE.sky} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE.sky} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorAmber" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PALETTE.amber} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE.amber} stopOpacity={0} />
            </linearGradient>
        </defs>
    </svg>
);

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
                getAllMovimientos(selectedObra.id),
                getRequerimientos(selectedObra.id),
                supabase
                    .from('inventario_obra')
                    .select('*, material:materiales(id, descripcion, categoria, unidad), epp:epps_c(id, descripcion, unidad), equipo:equipos(id, nombre)')
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
        let totalDiasLead = 0, countLead = 0;

        reqs.forEach(r => {
            if (fechaCorteMov && new Date(r.fecha_solicitud) < fechaCorteMov) return;
            r.detalles?.filter(d => detalleValido(d, r.id)).forEach(d => {
                aprobado += d.cantidad_solicitada || 0;
                ate += d.cantidad_atendida || 0;
                ccAte += d.cantidad_caja_chica || 0;

                // Estimar Lead Time (Atención)
                // Buscamos la primera SALIDA de este material después de la fecha de solicitud
                if (d.cantidad_atendida > 0) {
                    const primerSalida = movimientos
                        .filter(m => m.tipo === 'SALIDA' && m.material_id === d.material_id && new Date(m.created_at) >= new Date(r.fecha_solicitud))
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
                    
                    if (primerSalida) {
                        const diff = new Date(primerSalida.created_at).getTime() - new Date(r.fecha_solicitud).getTime();
                        totalDiasLead += diff / (1000 * 60 * 60 * 24);
                        countLead++;
                    }
                }
            });
        });
        return {
            ratio: aprobado > 0 ? Math.round((ate / aprobado) * 100) : 0,
            totalAprobado: aprobado,
            totalAte: ate,
            pctCC: ate > 0 ? Math.round((ccAte / ate) * 100) : 0,
            avgLeadTime: countLead > 0 ? (totalDiasLead / countLead).toFixed(1) : '-'
        };
    }, [reqs, fechaCorteMov, detalleValido, movimientos]);

    // ── KPI 9: Predicción de Pedido & Velocidad (15 días) ───────────────────────
    const prediccionPedido = useMemo(() => {
        const hace15 = new Date(); hace15.setDate(hace15.getDate() - 15);
        const consumo15: Record<string, number> = {};
        
        movimientos
            .filter(m => m.tipo === 'SALIDA' && m.material_id && new Date(m.created_at) >= hace15)
            .forEach(m => {
                consumo15[m.material_id!] = (consumo15[m.material_id!] || 0) + m.cantidad;
            });

        return inventario
            .map(inv => {
                const materialId = inv.material_id;
                if (!materialId) return null;
                const consumoDiario = (consumo15[materialId] || 0) / 15;
                const stockActual = inv.cantidad_actual || 0;
                const proyeccion15d = consumoDiario * 15;
                const deficit = Math.max(0, proyeccion15d - stockActual);

                const name = inv.material?.descripcion || inv.epp?.descripcion || inv.equipo?.nombre || 'Sin nombre';
                const unidad = inv.material?.unidad || inv.epp?.unidad || 'uds';

                return {
                    id: materialId,
                    name,
                    stock: stockActual,
                    consumoDiario,
                    proyeccion15d,
                    sugerido: Math.ceil(deficit * 1.1), // 10% buffer
                    unidad
                };
            })
            .filter(p => p && p.proyeccion15d > 0)
            .sort((a, b) => (b?.proyeccion15d || 0) - (a?.proyeccion15d || 0))
            .slice(0, 10);
    }, [inventario, movimientos]);

    // ── KPI 10: Dead Stock (Sin movimiento) ────────────────────────────────────
    const deadStock = useMemo(() => {
        const ultimasSalidas: Record<string, string> = {};
        movimientos
            .filter(m => m.tipo === 'SALIDA' && (m.material_id || m.epp_id || m.equipo_id))
            .forEach(m => {
                const itemId = (m.material_id || m.epp_id || m.equipo_id)!;
                const mDate = new Date(m.created_at).getTime();
                const curDate = ultimasSalidas[itemId] ? new Date(ultimasSalidas[itemId]).getTime() : 0;
                if (mDate > curDate) ultimasSalidas[itemId] = m.created_at;
            });

        return inventario
            .filter(inv => inv.cantidad_actual > 0)
            .map(inv => {
                const materialId = inv.material_id || inv.epp_id || inv.equipo_id;
                const ultima = ultimasSalidas[materialId];
                const diasSinMover = ultima ? diasDesde(ultima) : -1;
                
                const name = inv.material?.descripcion || inv.epp?.descripcion || inv.equipo?.nombre || 'Ítem no identificado';
                
                return {
                    name,
                    categoria: inv.material?.categoria || 'General',
                    stock: inv.cantidad_actual,
                    diasSinMover,
                    lastDate: ultima ? new Date(ultima).toLocaleDateString() : 'Nunca'
                };
            })
            .filter(d => d.diasSinMover > 30 || d.diasSinMover === -1) 
            .sort((a, b) => b.diasSinMover - a.diasSinMover)
            .slice(0, 10);
    }, [inventario, movimientos]);

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
        <div className="fade-in container-fluid pb-5 px-4 h-100">
            <ChartGradients />

            {/* ── Header ── */}
            <div className="glass-card d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 p-4 gap-3">
                <div>
                    <h2 className="mb-0 fw-800" style={{ fontSize: '1.75rem' }}>
                        📊 Panel de Control <span className="text-muted fw-400 ms-1" style={{ fontSize: '1rem' }}>Materiales & Tendencias</span>
                    </h2>
                    <div className="d-flex align-items-center mt-1">
                        <span className="badge bg-success me-2">En vivo</span>
                        <span className="text-muted small">{selectedObra.nombre_obra}</span>
                    </div>
                </div>

                {/* Filtro de período - Floating Glass Design */}
                <div className="glass-card p-1 d-flex gap-1 bg-white-50 shadow-sm border-radius-pill">
                    {([['7', '7D'], ['30', '30D'], ['90', '90D'], ['todo', 'TODO']] as const).map(([val, label]) => (
                        <button
                            key={val}
                            className={`btn btn-sm border-radius-pill px-3 py-2 border-0 transition-all ${periodoFiltro === val ? 'bg-primary text-white shadow-sm' : 'btn-light'}`}
                            onClick={() => setPeriodoFiltro(val)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="dashboard-grid">
                {/* ── Panel Lateral: KPIs Críticos ── */}
                <div className="d-flex flex-column gap-3">
                    <KpiCard
                        label="Atención General"
                        value={`${eficiencia.ratio}%`}
                        sub={`${eficiencia.totalAte} / ${eficiencia.totalAprobado} uds`}
                        color={PALETTE.emerald}
                        icon="📈"
                        gradient
                    />
                    <KpiCard
                        label="Caja Chica"
                        value={`${eficiencia.pctCC}%`}
                        sub="Sobre compras totales"
                        color={PALETTE.slate}
                        icon="💵"
                    />
                    <KpiCard
                        label="Ítems Pendientes"
                        value={reqsPendientes.total}
                        sub={`${reqsPendientes.critico} críticos (+14d)`}
                        color={PALETTE.amber}
                        icon="⏳"
                    />
                    <KpiCard
                        label="Riesgo Stock"
                        value={stockCritico.length}
                        sub="Materiales en quiebre"
                        color={PALETTE.indigo}
                        icon="⚠️"
                    />
                    <KpiCard
                        label="Uso Caja Chica"
                        value={`${totalEntradas > 0 ? Math.round((totalCajaChica / totalEntradas) * 100) : 0}%`}
                        sub="Sobre compras totales"
                        color={PALETTE.sky}
                        icon="💵"
                        dark
                    />

                    {/* Antigüedad Minibox */}
                    <div className="dashboard-card glass-card mt-2">
                        <div className="stat-label mb-3">Antigüedad Pendientes</div>
                        <div className="space-y-3">
                            {[
                                { l: 'Crítico', v: reqsPendientes.critico, c: 'danger' },
                                { l: 'Alto', v: reqsPendientes.alto, c: 'warning' },
                                { l: 'Normal', v: reqsPendientes.normal, c: 'success' }
                            ].map((item, idx) => (
                                <div key={idx} className="mb-3">
                                    <div className="d-flex justify-content-between mb-1 small fw-600">
                                        <span>{item.l}</span>
                                        <span>{item.v}</span>
                                    </div>
                                    <ProgressBar
                                        now={reqsPendientes.total > 0 ? (item.v / reqsPendientes.total) * 100 : 0}
                                        variant={item.c}
                                        style={{ height: 6 }}
                                        className="rounded-pill"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Área Principal: Gráficos ── */}
                <div className="d-flex flex-column gap-4">
                    <div className="row g-4">
                        {/* Flujo Semanal Gráfico Principal */}
                        <div className="col-12 col-xl-8">
                            <div className="dashboard-card glass-card h-100">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <div className="stat-label">Tendencia: Entradas vs Salidas</div>
                                    <div className="small text-muted d-flex gap-3">
                                        <span><span className="dot bg-primary me-1" />Entradas</span>
                                        <span><span className="dot bg-orange me-1" />Salidas</span>
                                    </div>
                                </div>
                                <div className="chart-container" style={{ height: 320, width: '100%' }}>
                                    {flujoSemanal.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                            <ComposedChart data={flujoSemanal} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#718096' }} dy={10} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#718096' }} />
                                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
                                                <Area type="monotone" dataKey="entradas" fill={GRADIENTS.sky} stroke={PALETTE.sky} strokeWidth={3} />
                                                <Bar dataKey="salidas" fill={PALETTE.amber} radius={[6, 6, 0, 0]} barSize={25} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="d-flex align-items-center justify-content-center h-100 text-muted">No hay movimientos en este periodo</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Origen de Entradas Pie */}
                        <div className="col-12 col-xl-4">
                            <div className="dashboard-card glass-card h-100">
                                <div className="stat-label mb-4">Origen de Suministro</div>
                                <div className="chart-container" style={{ height: 260, width: '100%' }}>
                                    {pieCompras.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                            <PieChart>
                                                <Pie
                                                    data={pieCompras}
                                                    innerRadius={65}
                                                    outerRadius={95}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                    animationBegin={200}
                                                >
                                                    {pieCompras.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<CustomTooltip />} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="d-flex align-items-center justify-content-center h-100 text-muted">Sin datos</div>
                                    )}
                                </div>
                                <div className="d-flex flex-wrap justify-content-center gap-3 mt-3">
                                    {pieCompras.map((entry, i) => (
                                        <div key={i} className="small d-flex align-items-center gap-1">
                                            <span className="dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                            <span className="text-muted">{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="row g-4">
                        {/* Top Materiales Consumidos */}
                        <div className="col-12 col-lg-7">
                            <div className="dashboard-card glass-card h-100">
                                <div className="stat-label mb-4">Top 10 Materiales Consumidos</div>
                                <div className="chart-container" style={{ height: 350, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <BarChart data={topConsumo} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                            <XAxis type="number" hide />
                                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#4A5568' }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                                            <Bar dataKey="salidas" fill={PALETTE.indigo} radius={[0, 10, 10, 0]} barSize={20} animationDuration={1500} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="row g-4">
                        {/* Predicción de Pedido (15 días) */}
                        <div className="col-12 col-xl-6">
                            <div className="dashboard-card glass-card h-100">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <div className="stat-label">🔮 Predicción de Pedido (15 días)</div>
                                    <Badge bg="primary-subtle" text="primary" className="rounded-pill">Top 10 Sugeridos</Badge>
                                </div>
                                <div className="table-responsive">
                                    <table className="table table-borderless-custom mb-0">
                                        <thead>
                                            <tr>
                                                <th className="rounded-start">Material</th>
                                                <th className="text-center">Consumo/D</th>
                                                <th className="text-center">Stock</th>
                                                <th className="text-center rounded-end">Sugerido</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {prediccionPedido.map((p, i) => {
                                                if (!p) return null;
                                                return (
                                                    <tr key={i} className="align-middle">
                                                        <td className="small fw-600">{p.name}</td>
                                                        <td className="text-center text-muted small">{fmt(p.consumoDiario, 1)}</td>
                                                        <td className="text-center fw-bold">{p.stock}</td>
                                                        <td className="text-center">
                                                            <span className={`badge rounded-pill ${p.sugerido > 0 ? 'bg-primary' : 'bg-success-subtle text-success'}`}>
                                                                {p.sugerido > 0 ? `Pedir ${p.sugerido}` : 'OK'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {prediccionPedido.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-4 text-muted">Sin datos de consumo reciente</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Dead Stock Explorer */}
                        <div className="col-12 col-xl-6">
                            <div className="dashboard-card glass-card h-100">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <div className="stat-label">❄️ Baja Rotación (Dead Stock)</div>
                                    <Badge bg="warning-subtle" text="dark" className="rounded-pill">+30 días sin uso</Badge>
                                </div>
                                <div className="table-responsive">
                                    <table className="table table-borderless-custom mb-0">
                                        <thead>
                                            <tr>
                                                <th className="rounded-start">Material</th>
                                                <th className="text-center">Stock</th>
                                                <th className="text-center">Últ. Salida</th>
                                                <th className="text-center rounded-end">Antig.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deadStock.map((d, i) => (
                                                <tr key={i} className="align-middle">
                                                    <td className="small fw-600">{d.name}</td>
                                                    <td className="text-center fw-bold">{d.stock}</td>
                                                    <td className="text-center text-muted small">{d.lastDate}</td>
                                                    <td className="text-center">
                                                        <span className={`badge rounded-pill ${d.diasSinMover === -1 ? 'bg-secondary' : d.diasSinMover > 90 ? 'bg-danger' : 'bg-warning'}`}>
                                                            {d.diasSinMover === -1 ? 'Sin rotación' : d.diasSinMover > 365 ? '+1 año' : `${d.diasSinMover}d`}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {deadStock.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-4 text-muted">Todo el inventario está en movimiento</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stock en Riesgo Table Refactor */}
                    <div className="dashboard-card glass-card border-0">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <div className="stat-label">🚨 Materiales en Riesgo Crítico</div>
                            <span className="badge bg-danger rounded-pill px-3">{stockCritico.length} Alertas activas</span>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-borderless-custom mb-0">
                                <thead>
                                    <tr>
                                        <th className="rounded-start">Material</th>
                                        <th>Categoría</th>
                                        <th className="text-center">Stock</th>
                                        <th className="text-center">Días Est.</th>
                                        <th className="text-center rounded-end">Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockCritico.map((item, i) => (
                                        <tr key={i} className="align-middle">
                                            <td className="fw-700">{item.material}</td>
                                            <td><span className="badge bg-secondary-subtle text-secondary px-2">{item.categoria}</span></td>
                                            <td className="text-center fw-600">{item.stock} <span className="fw-400 text-muted small">{item.unidad}</span></td>
                                            <td className="text-center">
                                                <div className={`fw-800 ${item.nivel === 'critico' ? 'text-danger' : 'text-warning'}`}>
                                                    {item.diasStock >= 999 ? '∞' : `${item.diasStock}d`}
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                <button className={`btn btn-sm w-100 rounded-pill fw-600 ${item.nivel === 'critico' ? 'btn-danger' : 'btn-outline-warning'}`}>
                                                    {item.nivel === 'critico' ? 'Urgente' : 'Reponer'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {stockCritico.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-5 text-muted">
                                                <div className="fs-1"></div>
                                                Inventario saludable. No hay riesgos detectados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstadisticasMateriales;
