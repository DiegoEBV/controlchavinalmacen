import React, { useState, useEffect } from 'react';
import { Card, Form, Table, Button, Row, Col, Badge, Alert, Tab, Tabs } from 'react-bootstrap';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { Requerimiento, Material } from '../types';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

// Local Storage Key
const HISTORY_KEY = 'reporte_materiales_history';
const RETENTION_DAYS = 15;

interface ReportHistoryItem {
    id: string;
    generatedAt: string;
    filters: {
        categoria: string;
        materialId: string;
        solicitante: string;
        especialidad: string;
        estado: string;
        fechaInicio: string;
        fechaFin: string;
    };
    resultCount: number;
}

const ReporteMateriales: React.FC = () => {
    // Data
    const [reqs, setReqs] = useState<Requerimiento[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [solicitantes, setSolicitantes] = useState<string[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [especialidades, setEspecialidades] = useState<string[]>([]);

    // Filters
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [categoria, setCategoria] = useState('');
    const [materialId, setMaterialId] = useState('');
    const [especialidad, setEspecialidad] = useState('');

    const [solicitante, setSolicitante] = useState('');
    const [estado, setEstado] = useState('');

    // Results
    const [reportData, setReportData] = useState<any[]>([]);
    const [summaryData, setSummaryData] = useState<any[]>([]);
    const [generated, setGenerated] = useState(false);

    // History
    const [history, setHistory] = useState<ReportHistoryItem[]>([]);

    const { selectedObra } = useAuth();

    useEffect(() => {
        if (selectedObra) {
            loadInitialData();
        } else {
            setReqs([]);
        }
        loadHistory();
    }, [selectedObra]);

    const loadInitialData = async () => {
        if (!selectedObra) return;
        try {
            const [rData, mData] = await Promise.all([
                getRequerimientos(selectedObra.id),
                getMateriales()
            ]);

            if (rData.data) {
                setReqs(rData.data);
                // Extract unique solicitantes
                const uniqueSols = Array.from(new Set(rData.data.map((r: Requerimiento) => r.solicitante).filter(Boolean)));
                setSolicitantes(uniqueSols as string[]);

                // Extract unique especialidades
                const uniqueEsps = Array.from(new Set(rData.data.map((r: Requerimiento) => r.especialidad).filter(Boolean)));
                setEspecialidades(uniqueEsps as string[]);
            }

            if (mData) {
                setMaterials(mData);
                const uniqueCats = Array.from(new Set(mData.map((m: Material) => m.categoria).filter(Boolean)));
                setCategorias(uniqueCats as string[]);
            }
        } catch (error) {
            console.error("Error loading data", error);
        }
    };

    const loadHistory = () => {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (stored) {
            let parsed: ReportHistoryItem[] = JSON.parse(stored);
            // Prune older than 15 days
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
            filters: { categoria, materialId, solicitante, estado, fechaInicio, fechaFin, especialidad },
            resultCount: count
        };
        const newHistory = [newItem, ...history];
        setHistory(newHistory);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    };

    const handleGenerate = () => {
        // Flatten Requerimientos -> Detalles
        let flattened: any[] = [];

        reqs.forEach(r => {
            // Date Filter
            if (fechaInicio && new Date(r.fecha_solicitud) < new Date(fechaInicio)) return;
            if (fechaFin && new Date(r.fecha_solicitud) > new Date(fechaFin)) return;
            // Solicitante Filter
            if (solicitante && r.solicitante !== solicitante) return;
            // Especialidad Filter
            if (especialidad && r.especialidad !== especialidad) return;

            r.detalles?.forEach(d => {
                // Estado Filter
                if (estado && d.estado !== estado) return;
                // Link Material info
                const matInfo = materials.find(m => m.descripcion === d.descripcion && m.categoria === d.material_categoria);

                // Material/Category Filter
                if (categoria && d.material_categoria !== categoria) return;
                // If materialId is selected, we need to match it. d doesn't always have material_id directly if it's old structure, 
                // but usually we rely on description+cat or if we have material_id in detalle (check interfaces).
                // Interface 'DetalleRequerimiento' doesn't strictly have material_id, relies on text mostly? 
                // Let's assume strict match on Description + Category if ID missing, or check if we can match ID from 'matInfo'.

                if (materialId) {
                    if (matInfo?.id !== materialId) return;
                }

                flattened.push({
                    fecha: r.fecha_solicitud,
                    solicitante: r.solicitante,
                    req_numero: r.item_correlativo,
                    especialidad: r.especialidad,
                    material: d.descripcion,
                    categoria: d.material_categoria,
                    unidad: d.unidad,
                    cant_solicitada: d.cantidad_solicitada,
                    cant_atendida: d.cantidad_atendida,
                    stock_max: matInfo?.stock_maximo || 0,
                    estado: d.estado
                });
            });
        });

        // Summary Grouping
        const summaryMap = new Map<string, any>();
        flattened.forEach(item => {
            const key = item.material + '|' + item.categoria;
            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    material: item.material,
                    categoria: item.categoria,
                    total_atendida: 0,
                    stock_max: item.stock_max
                });
            }
            const current = summaryMap.get(key);
            current.total_atendida += item.cant_atendida;
        });

        const summaryList = Array.from(summaryMap.values());

        setReportData(flattened);
        setSummaryData(summaryList);
        setGenerated(true);
        saveToHistory(flattened.length);
    };

    const handleClear = () => {
        setFechaInicio('');
        setFechaFin('');
        setCategoria('');
        setMaterialId('');
        setMaterialId('');
        setSolicitante('');
        setEstado('');
        setEspecialidad('');
        setReportData([]);
        setSummaryData([]);
        setGenerated(false);
    };

    const exportExcel = () => {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Detalle
        const wsDetalle = XLSX.utils.json_to_sheet(reportData);
        XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");

        // Sheet 2: Resumen
        const wsResumen = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(data, `Reporte_Materiales_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const exportPDF = () => {
        const doc = new jsPDF();

        doc.text("Reporte de Materiales", 14, 15);
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 22);

        // Summary Table
        doc.text("Resumen de Atención vs Stock Máximo", 14, 30);
        autoTable(doc, {
            startY: 35,
            head: [['Material', 'Categoría', 'Total Atendido', 'Stock Máx']],
            body: summaryData.map(s => [s.material, s.categoria, s.total_atendida, s.stock_max]),
        });

        // Detail Table
        const finalY = (doc as any).lastAutoTable.finalY || 40;
        doc.text("Detalle de Solicitudes", 14, finalY + 10);

        autoTable(doc, {
            startY: finalY + 15,
            head: [['Fecha', 'Solicitante', 'Especialidad', 'Material', 'Solicitada', 'Atendida', 'Estado']],
            body: reportData.map(r => [
                r.fecha ? new Date(r.fecha).toISOString().split('T')[0] : '-',
                r.solicitante,
                r.especialidad || '-',
                r.material,
                Number(r.cant_solicitada).toFixed(2),
                Number(r.cant_atendida).toFixed(2),
                r.estado
            ]),
        });

        doc.save(`Reporte_Materiales_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <div className="fade-in container-fluid">
            <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-2">
                <h2 className="mb-0 text-center text-md-start">Generador de Reportes de Materiales</h2>
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
                            <Form.Label>Categoría</Form.Label>
                            <Form.Select value={categoria} onChange={e => setCategoria(e.target.value)}>
                                <option value="">Todas</option>
                                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Especialidad</Form.Label>
                            <Form.Select value={especialidad} onChange={e => setEspecialidad(e.target.value)}>
                                <option value="">Todas</option>
                                {especialidades.map(e => <option key={e} value={e}>{e}</option>)}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Material</Form.Label>
                            <Form.Select value={materialId} onChange={e => setMaterialId(e.target.value)}>
                                <option value="">Todos</option>
                                {materials
                                    .filter(m => !categoria || m.categoria === categoria)
                                    .map(m => (
                                        <option key={m.id} value={m.id}>{m.descripcion}</option>
                                    ))}
                            </Form.Select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <Form.Label>Solicitante</Form.Label>
                            <Form.Select value={solicitante} onChange={e => setSolicitante(e.target.value)}>
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
                        <Col xs={12} md={3} className="d-flex align-items-end mt-3 mt-md-0">
                            <Button variant="primary" className="w-100 me-2" onClick={handleGenerate}>Generar Reporte</Button>
                            <Button variant="secondary" onClick={handleClear}>Limpiar</Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Tabs defaultActiveKey="reporte" className="mb-3">
                <Tab eventKey="reporte" title="Reporte Actual">
                    {generated ? (
                        <>
                            <h5 className="text-secondary mt-4">Cuadro Resumen (Atendido vs Stock Máx)</h5>
                            <Card className="custom-card mb-4">
                                <Table responsive hover>
                                    <thead>
                                        <tr>
                                            <th>Material</th>
                                            <th>Categoría</th>
                                            <th>Total Atendido</th>
                                            <th>Stock Máximo Configurado</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryData.map((s, idx) => (
                                            <tr key={idx}>
                                                <td className="fw-bold">{s.material}</td>
                                                <td>{s.categoria}</td>
                                                <td className="text-center">{Number(s.total_atendida).toFixed(2)}</td>
                                                <td className="text-center">{Number(s.stock_max).toFixed(2)}</td>
                                                <td>
                                                    {s.total_atendida > s.stock_max ?
                                                        <Badge bg="warning" text="dark">Sobrepasa Stock Máx</Badge> :
                                                        <Badge bg="success">Dentro de Límites</Badge>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
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
                                            <th>Especialidad</th>
                                            <th>Req #</th>
                                            <th>Material</th>
                                            <th>Cant. Solicitada</th>
                                            <th>Cant. Atendida</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{r.fecha ? new Date(r.fecha).toISOString().split('T')[0] : '-'}</td>
                                                <td>{r.solicitante}</td>
                                                <td>{r.especialidad || '-'}</td>
                                                <td>{r.req_numero}</td>
                                                <td>{r.material}</td>
                                                <td>{Number(r.cant_solicitada).toFixed(2)}</td>
                                                <td className="fw-bold text-primary">{Number(r.cant_atendida).toFixed(2)}</td>
                                                <td><Badge bg="secondary">{r.estado}</Badge></td>
                                            </tr>
                                        ))}
                                        {reportData.length === 0 && <tr><td colSpan={8} className="text-center">No se encontraron datos.</td></tr>}
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
                                                {h.filters.categoria ? `Cat: ${h.filters.categoria}, ` : ''}
                                                {h.filters.especialidad ? `Esp: ${h.filters.especialidad}, ` : ''}
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
