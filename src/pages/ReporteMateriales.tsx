import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Badge, Alert, Tab, Tabs } from 'react-bootstrap';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { getEquipos } from '../services/equiposService';
import { getEpps } from '../services/eppsService';
import { supabase } from '../config/supabaseClient';
import { Requerimiento, Material, Equipo, EppC } from '../types';
import { useAuth } from '../context/AuthContext';

// Clave de Almacenamiento Local
const HISTORY_KEY = 'reporte_materiales_history';
const RETENTION_DAYS = 15;

interface ReportHistoryItem {
    id: string;
    generatedAt: string;
    filters: {
        tipo: string;
        categoria: string;
        materialId: string;
        frente: string;
        especialidad: string;
        bloque: string;
        solicitante: string;
        estado: string;
        fechaInicio: string;
        fechaFin: string;
    };
    resultCount: number;
}

const ReporteMateriales: React.FC = () => {
    // Datos
    const [reqs, setReqs] = useState<Requerimiento[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [epps, setEpps] = useState<EppC[]>([]);
    const [solicitantes, setSolicitantes] = useState<string[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [frentes, setFrentes] = useState<string[]>([]);
    // Especialidades and Bloques are derived dynamically from `reqs` based on `frente`.

    // Filtros
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [tipo, setTipo] = useState('');
    const [categoria, setCategoria] = useState('');
    const [materialId, setMaterialId] = useState('');
    const [frente, setFrente] = useState('');
    const [especialidad, setEspecialidad] = useState('');
    const [bloque, setBloque] = useState('');

    const [solicitante, setSolicitante] = useState('');
    const [estado, setEstado] = useState('');

    // Resultados
    const [reportData, setReportData] = useState<any[]>([]);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [generated, setGenerated] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Historial
    const [history, setHistory] = useState<ReportHistoryItem[]>([]);

    const { selectedObra, profile } = useAuth();

    // Roles permitidos para ver todo
    const isPrivileged = ['admin', 'coordinador', 'almacenero', 'logistica'].includes(profile?.role || '');

    useEffect(() => {
        if (selectedObra && profile) {
            loadInitialData();
        } else {
            setReqs([]);
        }
        loadHistory();
    }, [selectedObra, profile]);

    const loadInitialData = async () => {
        if (!selectedObra) return;
        try {
            const [rData, mData, eData, eppData] = await Promise.all([
                getRequerimientos(selectedObra.id),
                getMateriales(1, 10000),
                getEquipos(selectedObra.id, 1, 10000),
                getEpps(true, 1, 10000)
            ]);

            if (rData.data) {
                let filteredReqs = rData.data;

                // Filtrar si no es privilegiado
                if (!isPrivileged && profile?.nombre) {
                    filteredReqs = filteredReqs.filter((r: Requerimiento) => r.solicitante === profile.nombre);
                    // Pre-seleccionar solicitante
                    setSolicitante(profile.nombre);
                }

                setReqs(filteredReqs);
                // Extraer solicitantes únicos
                const uniqueSols = Array.from(new Set(filteredReqs.map((r: Requerimiento) => r.solicitante).filter(Boolean)));
                setSolicitantes(uniqueSols as string[]);

                // Extraer frentes únicos
                const uniqueFrentes = Array.from(new Set(filteredReqs.map((r: Requerimiento) => r.frente?.nombre_frente).filter(Boolean)));
                setFrentes(uniqueFrentes as string[]);
            }

            if (mData.data) {
                setMaterials(mData.data);
                const uniqueCats = Array.from(new Set(mData.data.map((m: Material) => m.categoria).filter(Boolean)));
                setCategorias(uniqueCats as string[]);
            }

            if (eData.data) {
                setEquipos(eData.data);
            }

            if (eppData.data) {
                setEpps(eppData.data);
            }
        } catch (error) {
            console.error("Error loading data", error);
        }
    };

    const loadHistory = () => {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (stored) {
            let parsed: ReportHistoryItem[] = JSON.parse(stored);
            // Podar más antiguos de 15 días
            const limitDate = new Date();
            limitDate.setDate(limitDate.getDate() - RETENTION_DAYS);

            const fresh = parsed.filter(item => new Date(item.generatedAt) > limitDate);

            if (fresh.length !== parsed.length) {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(fresh));
            }
            setHistory(fresh.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()));
        }
    };

    const saveToHistory = (count: number) => {
        const newItem: ReportHistoryItem = {
            id: crypto.randomUUID(),
            generatedAt: new Date().toISOString(),
            filters: { tipo, categoria, materialId, frente, especialidad, bloque, solicitante, estado, fechaInicio, fechaFin },
            resultCount: count
        };
        const newHistory = [newItem, ...history];
        setHistory(newHistory);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Aplanar Requerimientos -> Detalles
            let flattened: any[] = [];

            // Para optimizar DB calls, recogemos todos los (frente_id, specialty_id, material_id) necesarios antes.
            // En el nuevo modelo, los materiales se ligan al presupuesto (listinsumo_especialidad)
            // que depende del frente y la especialidad.
            const budgetCache = new Map<string, number>();

            // Extraemos los requerimientos y armamos los parámetros de búsqueda de presupuestos
            for (const r of reqs) {
                if (fechaInicio && new Date(r.fecha_solicitud) < new Date(fechaInicio)) continue;
                if (fechaFin && new Date(r.fecha_solicitud) > new Date(fechaFin)) continue;
                if (solicitante && r.solicitante !== solicitante) continue;
                if (frente && r.frente?.nombre_frente !== frente) continue;
                if (especialidad && r.especialidad !== especialidad) continue;
                if (bloque && !r.bloque?.split(',').map((b: string) => b.trim()).includes(bloque)) continue;

                if (!r.detalles) continue;

                for (const d of r.detalles) {
                    if (estado && d.estado !== estado) continue;
                    if (tipo && d.tipo !== tipo) continue;

                    let itemMatch = false;

                    // Matchers
                    if (d.tipo === 'Material') {
                        if (categoria && d.material_categoria !== categoria) continue;
                        if (materialId) {
                            if (d.material_id === materialId) itemMatch = true;
                            else continue; // optimization
                        } else {
                            itemMatch = true;
                        }
                    } else if (d.tipo === 'Equipo') {
                        if (materialId) {
                            if (d.equipo_id === materialId) itemMatch = true;
                        } else itemMatch = true;
                    } else if (d.tipo === 'EPP') {
                        if (materialId) {
                            if (d.epp_id === materialId) itemMatch = true;
                        } else itemMatch = true;
                    } else if (d.tipo === 'Servicio') {
                        if (materialId) {
                            if (d.descripcion === materialId) itemMatch = true;
                        } else itemMatch = true;
                    }

                    if (!itemMatch) continue;

                    let itemStockMax = 0;

                    // Si se seleccionó Material, necesitamos consultar `listinsumo_especialidad` para saber
                    // el presupuesto máximo de *este* material en *esta* especialidad y frente.
                    if (d.tipo === 'Material' && d.material_id && r.frente_id && r.specialty_id) {
                        const cacheKey = `${r.frente_id}_${r.specialty_id}_${d.material_id}`;
                        if (budgetCache.has(cacheKey)) {
                            itemStockMax = budgetCache.get(cacheKey) || 0;
                        } else {
                            // Buscar en base de datos el presupuesto límite
                            const { data: fsData } = await supabase
                                .from('front_specialties')
                                .select('id')
                                .eq('front_id', r.frente_id)
                                .eq('specialty_id', r.specialty_id)
                                .single();

                            if (fsData) {
                                const { data: listData } = await supabase
                                    .from('listinsumo_especialidad')
                                    .select('cantidad_presupuestada')
                                    .eq('front_specialty_id', fsData.id)
                                    .eq('material_id', d.material_id)
                                    .single();

                                itemStockMax = listData?.cantidad_presupuestada || 0;
                            }
                            budgetCache.set(cacheKey, itemStockMax);
                        }
                    }

                    flattened.push({
                        fecha: r.fecha_solicitud,
                        solicitante: r.solicitante,
                        req_numero: r.item_correlativo,
                        especialidad: r.especialidad,
                        frente: r.frente?.nombre_frente || '-',
                        material: d.descripcion,
                        categoria: d.material_categoria || d.tipo, // Usar Tipo si no hay categoría
                        unidad: d.unidad,
                        cant_solicitada: d.cantidad_solicitada,
                        cant_atendida: d.cantidad_atendida,
                        stock_max: itemStockMax, // Representa "Cantidad Presupuestada" ahora
                        estado: d.estado
                    });
                }
            }

            // Agrupación de Resumen
            const summaryMap = new Map<string, any>();
            flattened.forEach(item => {
                // Para el resumen, en lugar de sumar en global ciegamente, sumamos por frente/especialidad/material...
                // Pero un resumen simplificado podría ser agrupando por material/categoría sumando el cant atendida 
                // vs el stock max global (o promedio/suma de los max).
                // Dado que ahora el "stock_max" depende del frente/especialidad, sumar los maximos por material 
                // globalmente podría dar repetidos. Para simplificar mantendremos la suma de totales atendidos.
                const key = item.material + '|' + item.categoria;
                if (!summaryMap.has(key)) {
                    summaryMap.set(key, {
                        material: item.material,
                        categoria: item.categoria,
                        total_atendida: 0,
                        // Stock max para resumen global: es engañoso ahora. Tomaremos el máximo individual 
                        // encontrado, O idealmente, sumaríamos el listinsumo de todos los frentes.
                        // Mantendremos un tracking de los presupuestos únicos agregados.
                        unique_budgets: new Set<string>(),
                        stock_max: 0
                    });
                }
                const current = summaryMap.get(key);
                current.total_atendida += item.cant_atendida;

                // Hack para sumar presupuestos únicos en el resumen si aplica.
                const budgetId = `${item.frente}_${item.especialidad}`;
                if (!current.unique_budgets.has(budgetId)) {
                    current.unique_budgets.add(budgetId);
                    current.stock_max += item.stock_max;
                }
            });

            const summaryList = Array.from(summaryMap.values());

            setReportData(flattened);
            setSummaryData(summaryList);
            setGenerated(true);
            saveToHistory(flattened.length);

        } catch (error) {
            console.error("Error generating report", error);
            alert("Error al generar reporte: " + (error as any).message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleClear = () => {
        setFechaInicio('');
        setFechaFin('');
        setCategoria('');
        setTipo('');
        setMaterialId('');
        setFrente('');
        setEspecialidad('');
        setBloque('');
        setSolicitante('');
        setReportData([]);
        setSummaryData([]);
        setGenerated(false);
    };

    const exportExcel = async () => {
        try {
            const [XLSX, { saveAs }] = await Promise.all([
                import('xlsx'),
                import('file-saver')
            ]);

            const wb = XLSX.utils.book_new();

            // Hoja 1: Detalle
            const wsDetalle = XLSX.utils.json_to_sheet(reportData);
            XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");

            // Hoja 2: Resumen
            const wsResumen = XLSX.utils.json_to_sheet(summaryData.map(s => ({
                Material: s.material,
                Categoría: s.categoria,
                "Total Atendido": s.total_atendida,
                "Presupuesto Consolidado": s.stock_max
            })));
            XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
            saveAs(data, `Reporte_Materiales_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error("Error exporting excel:", error);
            alert("Error al exportar a Excel. Verifique su conexión.");
        }
    };

    const exportPDF = async () => {
        try {
            const [jsPDFModule, autoTableModule] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable')
            ]);
            const jsPDF = jsPDFModule.default;
            const autoTable = autoTableModule.default;

            const doc = new jsPDF();

            doc.text("Reporte de Trumbull | Materiales", 14, 15);
            doc.setFontSize(10);
            doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 22);

            // Tabla de Resumen
            doc.text("Resumen de Atención vs Presupuesto Consolidado", 14, 30);
            autoTable(doc, {
                startY: 35,
                head: [['Material', 'Categoría', 'Atendido', 'Presupuestado']],
                body: summaryData.map(s => [s.material, s.categoria, s.total_atendida, s.stock_max]),
            });

            // Tabla de Detalle
            const finalY = (doc as any).lastAutoTable.finalY || 40;
            doc.text("Detalle de Solicitudes", 14, finalY + 10);

            autoTable(doc, {
                startY: finalY + 15,
                head: [['Fecha', 'Solic', 'Frente/Esp.', 'Req#', 'Material', 'Soli', 'Aten', 'Est']],
                body: reportData.map(r => [
                    r.fecha ? new Date(r.fecha).toISOString().split('T')[0] : '-',
                    r.solicitante.substring(0, 10), // Truncate to fit PDF
                    `${r.frente}/${r.especialidad}`,
                    r.req_numero,
                    r.material.substring(0, 15),
                    Number(r.cant_solicitada).toFixed(1),
                    Number(r.cant_atendida).toFixed(1),
                    r.estado
                ]),
                styles: { fontSize: 7 } // Smaller font strictly for PDF Details
            });

            doc.save(`Reporte_Materiales_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("Error exporting PDF:", error);
            alert("Error al exportar a PDF. Verifique su conexión.");
        }
    };

    const availableEspecialidades = frente
        ? Array.from(new Set(reqs.filter(r => r.frente?.nombre_frente === frente).map(r => r.especialidad).filter(Boolean)))
        : Array.from(new Set(reqs.map(r => r.especialidad).filter(Boolean)));

    const extractUniqueBloques = (reqsList: Requerimiento[]) => {
        const allBloquesStr = reqsList.map(r => r.bloque).filter(Boolean) as string[];
        const splitBloques = allBloquesStr.flatMap(bStr => bStr.split(',').map(b => b.trim()).filter(Boolean));
        return Array.from(new Set(splitBloques));
    };

    const availableBloques = frente
        ? extractUniqueBloques(reqs.filter(r => r.frente?.nombre_frente === frente))
        : extractUniqueBloques(reqs);

    return (
        <div className="fade-in container-fluid">
            <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-2">
                <h2 className="mb-0 text-center text-md-start">Generador de Reportes de Materiales/Insumos</h2>
                <div className="d-flex gap-2">
                    {generated && (
                        <>
                            <Button variant="success" onClick={exportExcel}>Exportar Excel</Button>
                            <Button variant="danger" onClick={exportPDF}>Exportar PDF</Button>
                        </>
                    )}
                </div>
            </div>

            <Card className="custom-card mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Fecha Inicio</Form.Label>
                            <Form.Control type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Fecha Fin</Form.Label>
                            <Form.Control type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Tipo</Form.Label>
                            <Form.Select value={tipo} onChange={e => {
                                setTipo(e.target.value);
                                setMaterialId(''); // Reset item selection when type changes
                                setCategoria('');  // Reset category mainly if switching away from Material
                            }}>
                                <option value="">Todos</option>
                                <option value="Material">Material</option>
                                <option value="Equipo">Equipo</option>
                                <option value="EPP">EPP</option>
                                <option value="Servicio">Servicio</option>
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Frente</Form.Label>
                            <Form.Select value={frente} onChange={e => {
                                setFrente(e.target.value);
                                setEspecialidad(''); // Reset descendent filter
                                setBloque(''); // Reset descendent filter
                            }}>
                                <option value="">Todos</option>
                                {frentes.map(f => <option key={f} value={f}>{f}</option>)}
                            </Form.Select>
                        </Col>

                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Especialidad</Form.Label>
                            <Form.Select value={especialidad} onChange={e => setEspecialidad(e.target.value)}>
                                <option value="">Todas</option>
                                {availableEspecialidades.map(e => <option key={e as string} value={e as string}>{e as string}</option>)}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Bloque</Form.Label>
                            <Form.Select value={bloque} onChange={e => setBloque(e.target.value)}>
                                <option value="">Todos</option>
                                {availableBloques.map(b => <option key={b as string} value={b as string}>{b as string}</option>)}
                            </Form.Select>
                        </Col>
                        {tipo === 'Material' && (
                            <Col xs={12} sm={6} md={3}>
                                <Form.Label>Categoría</Form.Label>
                                <Form.Select value={categoria} onChange={e => setCategoria(e.target.value)}>
                                    <option value="">Todas</option>
                                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                </Form.Select>
                            </Col>
                        )}
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>{tipo === 'Equipo' ? 'Equipo' : tipo === 'EPP' ? 'EPP' : tipo === 'Servicio' ? 'Servicio' : 'Material'}</Form.Label>
                            <Form.Select value={materialId} onChange={e => setMaterialId(e.target.value)}>
                                <option value="">Todos</option>
                                {tipo === 'Material' || tipo === '' ? (
                                    materials
                                        .filter(m => !categoria || m.categoria === categoria)
                                        .map(m => (
                                            <option key={m.id} value={m.id}>{m.descripcion}</option>
                                        ))
                                ) : null}
                                {tipo === 'Equipo' ? (
                                    equipos.map(e => (
                                        <option key={e.id} value={e.id}>{e.nombre}</option>
                                    ))
                                ) : null}
                                {tipo === 'EPP' ? (
                                    epps.map(e => (
                                        <option key={e.id} value={e.id}>{e.descripcion}</option>
                                    ))
                                ) : null}
                                {tipo === 'Servicio' ? (
                                    // Extract unique services from reqs for dropdown
                                    Array.from(new Set(reqs.flatMap(r => r.detalles?.filter(d => d.tipo === 'Servicio').map(d => d.descripcion) || [])))
                                        .map((desc, idx) => (
                                            <option key={idx} value={desc}>{desc}</option>
                                        ))
                                ) : null}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Solicitante</Form.Label>
                            <Form.Select value={solicitante} onChange={e => setSolicitante(e.target.value)} disabled={!isPrivileged}>
                                <option value="">Todos</option>
                                {solicitantes.map(s => <option key={s} value={s}>{s}</option>)}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Estado</Form.Label>
                            <Form.Select value={estado} onChange={e => setEstado(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="Pendiente">Pendiente</option>
                                <option value="Parcial">Parcial</option>
                                <option value="Atendido">Atendido</option>
                                <option value="Cancelado">Cancelado</option>
                            </Form.Select>
                        </Col>
                        <Col xs={12} md={6} className="d-flex align-items-end mt-3 mt-md-0">
                            <Button variant="primary" className="w-100 me-2" onClick={handleGenerate} disabled={isGenerating}>
                                {isGenerating ? 'Generando...' : 'Generar Reporte'}
                            </Button>
                            <Button variant="secondary" className="w-50" onClick={handleClear} disabled={isGenerating}>Limpiar</Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Tabs defaultActiveKey="reporte" className="mb-3">
                <Tab eventKey="reporte" title="Reporte Actual">
                    {generated ? (
                        <>
                            <h5 className="text-secondary mt-4">Cuadro Resumen (Atendido vs Presupuestado)</h5>
                            <Card className="custom-card mb-4">
                                <Table responsive hover>
                                    <thead>
                                        <tr>
                                            <th>Material/Insumo</th>
                                            <th>Categoría</th>
                                            <th className="text-center">Total Atendido</th>
                                            <th className="text-center">Presupuesto<br /><small>(Suma de Frentes Aplicados)</small></th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryData.map((s, idx) => (
                                            <tr key={idx}>
                                                <td className="fw-bold">{s.material}</td>
                                                <td>{s.categoria}</td>
                                                <td className="text-center fw-bold text-primary">{Number(s.total_atendida).toFixed(2)}</td>
                                                <td className="text-center">{s.stock_max > 0 ? Number(s.stock_max).toFixed(2) : '-'}</td>
                                                <td>
                                                    {s.stock_max > 0 && s.total_atendida > s.stock_max ?
                                                        <Badge bg="warning" text="dark">Sobrepasa Presupuesto</Badge> :
                                                        s.stock_max > 0 ? <Badge bg="success">Dentro de Presupuesto</Badge> :
                                                            <Badge bg="secondary">No Definido</Badge>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                        {summaryData.length === 0 && <tr><td colSpan={5} className="text-center">No hay resumen que mostrar.</td></tr>}
                                    </tbody>
                                </Table>
                            </Card>

                            <h5 className="text-secondary">Detalle de Solicitudes</h5>
                            <Card className="custom-card">
                                <Table responsive hover size="sm">
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Solicitante</th>
                                            <th>Frente/Especialidad</th>
                                            <th>Req #</th>
                                            <th>Material/Insumo</th>
                                            <th>Cant. Solicitada</th>
                                            <th>Cant. Atendida</th>
                                            <th>Presupuesto (Límite Individual)</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.fecha ? new Date(r.fecha).toISOString().split('T')[0] : '-'}</td>
                                                <td>{r.solicitante}</td>
                                                <td>{r.frente} / {r.especialidad || '-'}</td>
                                                <td>{r.req_numero}</td>
                                                <td>{r.material}</td>
                                                <td>{Number(r.cant_solicitada).toFixed(2)}</td>
                                                <td className="fw-bold text-primary">{Number(r.cant_atendida).toFixed(2)}</td>
                                                <td>{r.stock_max > 0 ? Number(r.stock_max).toFixed(2) : '-'}</td>
                                                <td><Badge bg="secondary">{r.estado}</Badge></td>
                                            </tr>
                                        ))}
                                        {reportData.length === 0 && <tr><td colSpan={9} className="text-center">No se encontraron datos.</td></tr>}
                                    </tbody>
                                </Table>
                            </Card>
                        </>
                    ) : (
                        <Alert variant="info">Seleccione filtros y haga clic en "Generar Reporte" para ver los resultados.</Alert>
                    )}
                </Tab>

                <Tab eventKey="history" title="Historial Local (15 Días)">
                    <Card className="custom-card">
                        <Table responsive hover>
                            <thead>
                                <tr className="text-center">
                                    <th>Generado</th>
                                    <th>Filtros Usados</th>
                                    <th>Resultados</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.id}>
                                        <td>{new Date(h.generatedAt).toLocaleString()}</td>
                                        <td>
                                            <small>
                                                {h.filters.tipo ? `Tipo: ${h.filters.tipo}, ` : ''}
                                                {h.filters.categoria ? `Cat: ${h.filters.categoria}, ` : ''}
                                                {h.filters.frente ? `Fte: ${h.filters.frente}, ` : ''}
                                                {h.filters.especialidad ? `Esp: ${h.filters.especialidad}, ` : ''}
                                                {h.filters.bloque ? `Blq: ${h.filters.bloque}, ` : ''}
                                                {h.filters.solicitante ? `Sol: ${h.filters.solicitante}, ` : ''}

                                                {h.filters.estado ? `Est: ${h.filters.estado}, ` : ''}
                                                {h.filters.fechaInicio ? `Desde: ${h.filters.fechaInicio} ` : ''}
                                            </small>
                                            {Object.values(h.filters).every(x => !x) && <span className="text-muted">Sin Filtros</span>}
                                        </td>
                                        <td>{h.resultCount} registros</td>
                                        <td>
                                            {/* Restore functionality could be added here */}
                                            <Badge bg="secondary">Archivado</Badge>
                                        </td>
                                    </tr>
                                ))}
                                {history.length === 0 && <tr><td colSpan={4} className="text-center">No hay historial reciente.</td></tr>}
                            </tbody>
                        </Table>
                    </Card>
                </Tab>
            </Tabs>
        </div>
    );
};

export default ReporteMateriales;
