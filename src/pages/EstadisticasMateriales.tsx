import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Table, Badge } from 'react-bootstrap';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getRequerimientos, getMateriales } from '../services/requerimientosService';
import { getInventario } from '../services/almacenService';
import { Requerimiento, Material, Inventario } from '../types';
import { useAuth } from '../context/AuthContext';

const EstadisticasMateriales: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [topConsumed, setTopConsumed] = useState<any[]>([]);
    const [specialtyStats, setSpecialtyStats] = useState<any[]>([]);
    const [requesterStats, setRequesterStats] = useState<any[]>([]);
    const [stockVsConsumed, setStockVsConsumed] = useState<any[]>([]);
    const [predictions, setPredictions] = useState<any[]>([]);
    const [consumptionRatio, setConsumptionRatio] = useState<number>(0);

    const { selectedObra } = useAuth();

    // Filters
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);

    // Raw Data
    const [allReqs, setAllReqs] = useState<Requerimiento[]>([]);
    const [allMaterials, setAllMaterials] = useState<Material[]>([]);
    const [allInventario, setAllInventario] = useState<Inventario[]>([]);

    // Inventory Health
    const [stockoutRisk, setStockoutRisk] = useState<any[]>([]);
    const [excessInventory, setExcessInventory] = useState<any[]>([]);
    const [slowMoving, setSlowMoving] = useState<any[]>([]);

    // Efficiency Metrics
    const [avgFulfillmentTime, setAvgFulfillmentTime] = useState<number>(0);
    const [pendingMetrics, setPendingMetrics] = useState<{ total: number, avgDays: number, oldRequests: number }>({ total: 0, avgDays: 0, oldRequests: 0 });

    // Trends
    const [consumptionTrend, setConsumptionTrend] = useState<any[]>([]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

    useEffect(() => {
        if (selectedObra) {
            loadData();
        } else {
            setAllReqs([]);
            setAllInventario([]);
            setLoading(false);
        }
    }, [selectedObra]);

    useEffect(() => {
        if (allReqs.length > 0 && allMaterials.length > 0) {
            processStatistics(allReqs, allMaterials);
            processInventoryHealth(allReqs, allMaterials, allInventario);
            processEfficiencyMetrics(allReqs);
            processConsumptionTrends(allReqs);
        }
    }, [startDate, endDate, selectedCategory, allReqs, allMaterials, allInventario]);

    const loadData = async () => {
        if (!selectedObra) return;
        try {
            const [reqResponse, materialsData, inventarioData] = await Promise.all([
                getRequerimientos(selectedObra.id),
                getMateriales(),
                getInventario(selectedObra.id)
            ]);

            const reqs: Requerimiento[] = reqResponse.data || [];
            const materials: Material[] = materialsData || [];
            const inventario: Inventario[] = inventarioData || [];

            setAllReqs(reqs);
            setAllMaterials(materials);
            setAllInventario(inventario);

            // Extract Categories
            const categories = Array.from(new Set(materials.map(m => m.categoria).filter(Boolean)));
            setAvailableCategories(categories);

            setLoading(false);
        } catch (error) {
            console.error("Error loading statistics data:", error);
            setLoading(false);
        }
    };

    const processStatistics = (reqs: Requerimiento[], materials: Material[]) => {
        let allDetails: any[] = [];
        let totalSolicitadas = 0;
        let totalAtendidas = 0;

        reqs.forEach(r => {
            // Apply Date Filter on Requirement Level (using fecha_solicitud)
            if (startDate && new Date(r.fecha_solicitud) < new Date(startDate)) return;
            if (endDate && new Date(r.fecha_solicitud) > new Date(endDate)) return;

            if (r.detalles) {
                r.detalles.forEach(d => {
                    // Apply Category Filter
                    if (selectedCategory && d.material_categoria !== selectedCategory) return;

                    allDetails.push({ ...d, solicitante: r.solicitante, especialidad: r.especialidad, fecha: r.fecha_solicitud });
                    totalSolicitadas += d.cantidad_solicitada || 0;
                    totalAtendidas += d.cantidad_atendida || 0;
                });
            }
        });

        // 1. Ratio de Consumo Global
        setConsumptionRatio(totalSolicitadas > 0 ? (totalAtendidas / totalSolicitadas) * 100 : 0);

        // 2. Top Consumed Materials
        const materialMap = new Map<string, number>();
        allDetails.forEach(d => {
            const current = materialMap.get(d.descripcion) || 0;
            materialMap.set(d.descripcion, current + (d.cantidad_atendida || 0));
        });

        const sortedMaterials = Array.from(materialMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
        setTopConsumed(sortedMaterials);

        // 3. By Specialty
        const specialtyMap = new Map<string, number>();
        allDetails.forEach(d => {
            const current = specialtyMap.get(d.especialidad) || 0;
            specialtyMap.set(d.especialidad || 'Sin Especialidad', current + (d.cantidad_atendida || 0));
        });
        setSpecialtyStats(Array.from(specialtyMap.entries()).map(([name, value]) => ({ name, value })));

        // 4. By Requester
        const requesterMap = new Map<string, number>();
        allDetails.forEach(d => {
            const current = requesterMap.get(d.solicitante) || 0;
            requesterMap.set(d.solicitante || 'Desconocido', current + (d.cantidad_atendida || 0));
        });
        setRequesterStats(Array.from(requesterMap.entries()).slice(0, 10).map(([name, value]) => ({ name, value })));

        // 5. Stock vs Consumed (Critical items)
        // We need to match material details to material definitions to get Stock Max
        const comparisonData = materials.map(m => {
            const consumed = materialMap.get(m.descripcion) || 0;
            return {
                name: m.descripcion,
                consumed: consumed,
                stockMax: m.stock_maximo,
                ratio: m.stock_maximo > 0 ? (consumed / m.stock_maximo) : 0
            };
        }).filter(item => item.consumed > 0).sort((a, b) => b.consumed - a.consumed).slice(0, 15);
        setStockVsConsumed(comparisonData);

        // 6. Predictive Analysis
        // Calculate average daily consumption over last 30 days
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 30);

        const recentConsumptionMap = new Map<string, number>();

        allDetails.forEach(d => {
            if (new Date(d.fecha) >= limitDate) {
                const current = recentConsumptionMap.get(d.descripcion) || 0;
                recentConsumptionMap.set(d.descripcion, current + (d.cantidad_atendida || 0));
            }
        });

        const predictionsList = Array.from(recentConsumptionMap.entries()).map(([name, last30Total]) => {
            const avgDaily = last30Total / 30;
            return {
                material: name,
                avgDaily: avgDaily.toFixed(2),
                next15Days: (avgDaily * 15).toFixed(1),
                next30Days: (avgDaily * 30).toFixed(1)
            };
        }).sort((a, b) => parseFloat(b.next30Days) - parseFloat(a.next30Days)).slice(0, 10);

        setPredictions(predictionsList);
    };

    const processInventoryHealth = (reqs: Requerimiento[], materials: Material[], inventario: Inventario[]) => {
        // Map material -> total consumed in last 30 days
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        const consumptionMap = new Map<string, number>(); // material_id -> qty
        const lastRequestDateMap = new Map<string, Date>(); // material_id -> date

        reqs.forEach(r => {
            r.detalles?.forEach(d => {
                // Find material ID by matching description (since detalle doesn't always have ID in type)
                const mat = materials.find(m => m.descripcion === d.descripcion && m.categoria === d.material_categoria);
                if (mat) {
                    // Track Last Request
                    const reqDate = new Date(r.fecha_solicitud);
                    if (!lastRequestDateMap.has(mat.id) || reqDate > lastRequestDateMap.get(mat.id)!) {
                        lastRequestDateMap.set(mat.id, reqDate);
                    }

                    // Track Consumption Last 30 Days
                    if (reqDate >= last30Days) {
                        const current = consumptionMap.get(mat.id) || 0;
                        consumptionMap.set(mat.id, current + (d.cantidad_atendida || 0));
                    }
                }
            });
        });

        // 1. Stockout Risk: Stock < 20% of Max OR Stock < Avg Weekly Consumption
        const riskList: any[] = [];
        // 2. Excess: Stock > Max
        const excessList: any[] = [];
        // 3. Slow Moving: High Stock (e.g. > 0) AND No requests in 60 days
        const slowList: any[] = [];
        const slowThresholdDate = new Date();
        slowThresholdDate.setDate(slowThresholdDate.getDate() - 60);

        inventario.forEach(inv => {
            const mat = materials.find(m => m.id === inv.material_id);
            if (!mat) return;

            const stock = inv.cantidad_actual;
            const max = mat.stock_maximo || 100; // Default buffer
            const consumed30 = consumptionMap.get(mat.id) || 0;
            const lastReq = lastRequestDateMap.get(mat.id);

            // Risk: Low Stock relative to Max or Consumption
            if (stock > 0 && (stock < (max * 0.2) || (consumed30 > 0 && stock < (consumed30 / 4)))) {
                riskList.push({
                    material: mat.descripcion,
                    stock: stock,
                    max: max,
                    consumed30: consumed30
                });
            }

            // Excess
            if (stock > max) {
                excessList.push({
                    material: mat.descripcion,
                    stock: stock,
                    max: max,
                    excess: stock - max
                });
            }

            // Slow Moving
            if (stock > 0 && (!lastReq || lastReq < slowThresholdDate)) {
                slowList.push({
                    material: mat.descripcion,
                    stock: stock,
                    lastReq: lastReq ? lastReq.toISOString().split('T')[0] : 'Nunca'
                });
            }
        });

        setStockoutRisk(riskList.slice(0, 5));
        setExcessInventory(excessList.slice(0, 5));
        setSlowMoving(slowList.slice(0, 5));
    };

    const processEfficiencyMetrics = (reqs: Requerimiento[]) => {
        let totalFulfillmentTime = 0;
        let fulfilledCount = 0;

        let pendingCount = 0;
        let totalPendingTime = 0;
        let oldRequestsCount = 0; // Older than 7 days

        const now = new Date();

        reqs.forEach(r => {
            // Date Filter check (though typically metrics should reflect current state, we can respect the filter or not. 
            // Usually efficiency is analyzed over a period. Let's respect the filter if applied to 'req date')
            if (startDate && new Date(r.fecha_solicitud) < new Date(startDate)) return;
            if (endDate && new Date(r.fecha_solicitud) > new Date(endDate)) return;

            const reqDate = new Date(r.fecha_solicitud);

            r.detalles?.forEach(d => {
                // Category Filter
                if (selectedCategory && d.material_categoria !== selectedCategory) return;

                // 1. Fulfillment Time for Attended
                // Note: d.fecha_atencion might be string or undefined.
                if (d.estado === 'Atendido' || (d.cantidad_atendida > 0 && d.fecha_atencion)) {
                    if (d.fecha_atencion) {
                        const attDate = new Date(d.fecha_atencion);
                        const diffTime = Math.abs(attDate.getTime() - reqDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        totalFulfillmentTime += diffDays;
                        fulfilledCount++;
                    }
                }

                // 2. Pending Aging
                if (d.estado === 'Pendiente' || d.estado === 'Parcial') {
                    const diffTime = Math.abs(now.getTime() - reqDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    totalPendingTime += diffDays;
                    pendingCount++;

                    if (diffDays > 7) {
                        oldRequestsCount++;
                    }
                }
            });
        });

        setAvgFulfillmentTime(fulfilledCount > 0 ? (totalFulfillmentTime / fulfilledCount) : 0);
        setPendingMetrics({
            total: pendingCount,
            avgDays: pendingCount > 0 ? (totalPendingTime / pendingCount) : 0,
            oldRequests: oldRequestsCount
        });
    };

    const processConsumptionTrends = (reqs: Requerimiento[]) => {
        const dateMap = new Map<string, number>();

        reqs.forEach(r => {
            // Respect Date Filter
            if (startDate && new Date(r.fecha_solicitud) < new Date(startDate)) return;
            if (endDate && new Date(r.fecha_solicitud) > new Date(endDate)) return;

            const dateStr = new Date(r.fecha_solicitud).toISOString().split('T')[0];

            r.detalles?.forEach(d => {
                if (selectedCategory && d.material_categoria !== selectedCategory) return;

                const current = dateMap.get(dateStr) || 0;
                dateMap.set(dateStr, current + (d.cantidad_atendida || 0));
            });
        });

        const sortedTrends = Array.from(dateMap.entries())
            .map(([date, total]) => ({ date, total }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setConsumptionTrend(sortedTrends);
    };

    const handleExportPDF = () => {
        const input = document.getElementById('dashboard-content');
        if (input) {
            html2canvas(input, { scale: 2, backgroundColor: '#ffffff' }).then((canvas) => {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                const imgWidth = pdfWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                let heightLeft = imgHeight;
                let position = 0;

                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pdfHeight;
                }

                pdf.save('Dashboard_Estadisticas.pdf');
            });
        }
    };

    if (loading) return <div className="p-4 text-center">Cargando estadísticas...</div>;

    return (
        <div className="fade-in container-fluid" id="dashboard-content">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-center mb-4 gap-2">
                <h2 className="mb-0 text-center text-md-start">Dashboard de Estadísticas de Materiales</h2>
                <button className="btn btn-danger" onClick={handleExportPDF}>
                    📑 Descargar PDF
                </button>
            </div>

            {/* Filters */}
            <Card className="custom-card mb-4">
                <Card.Body>
                    <Row className="g-3 align-items-end">
                        <Col xs={12} sm={6} md={3}>
                            <label className="form-label">Fecha Inicio</label>
                            <input
                                type="date"
                                className="form-control"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <label className="form-label">Fecha Fin</label>
                            <input
                                type="date"
                                className="form-control"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <label className="form-label">Categoría</label>
                            <select
                                className="form-select"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            >
                                <option value="">Todas las Categorías</option>
                                {availableCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </Col>
                        <Col xs={12} sm={6} md={3}>
                            <button
                                className="btn btn-secondary w-100"
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setSelectedCategory('');
                                }}
                            >
                                Limpiar Filtros
                            </button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* Global Ratio & Efficiency */}
            <Row className="mb-4 g-3">
                <Col xs={12} md={4}>
                    <Card className="custom-card text-center text-white bg-primary h-100">
                        <Card.Body className="d-flex flex-column justify-content-center">
                            <h3>Ratio Global de Atención</h3>
                            <div className="display-4 fw-bold">{consumptionRatio.toFixed(1)}%</div>
                            <small>Total Atendido / Total Solicitado</small>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={12} md={4}>
                    <Card className="custom-card text-center text-dark bg-info bg-opacity-10 h-100 border-info">
                        <Card.Body className="d-flex flex-column justify-content-center">
                            <h5 className="text-info">⏱️ Tiempo Promedio de Atención</h5>
                            <div className="display-4 fw-bold my-2">{avgFulfillmentTime.toFixed(1)} <span className="fs-5">días</span></div>
                            <small className="text-muted">Desde solicitud hasta atención</small>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={12} md={4}>
                    <Card className="custom-card text-center text-dark bg-danger bg-opacity-10 h-100 border-danger">
                        <Card.Body className="d-flex flex-column justify-content-center">
                            <h5 className="text-danger">⏳ Pendientes y Retrasos</h5>
                            <Row>
                                <Col>
                                    <div className="h2 fw-bold">{pendingMetrics.total}</div>
                                    <small className="text-muted">Items Pendientes</small>
                                </Col>
                                <Col>
                                    <div className="h2 fw-bold">{pendingMetrics.oldRequests}</div>
                                    <small className="text-danger">Retrasados (+7 días)</small>
                                </Col>
                            </Row>
                            <div className="mt-2">
                                <Badge bg="secondary">Antigüedad Promedio: {pendingMetrics.avgDays.toFixed(1)} días</Badge>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4 g-3">
                {/* Top Consumed Chart */}
                <Col xs={12} md={6}>
                    <Card className="custom-card h-100">
                        <Card.Header>Top 10 Materiales Más Consumidos</Card.Header>
                        <Card.Body style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topConsumed} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#8884d8" name="Cantidad" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>

                {/* Specialty Pie Chart */}
                <Col xs={12} md={6}>
                    <Card className="custom-card h-100">
                        <Card.Header>Consumo por Especialidad</Card.Header>
                        <Card.Body style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={specialtyStats}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {specialtyStats.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4">
                {/* Requester Bar Chart */}
                <Col xs={12} className="mb-4">
                    <Card className="custom-card h-100">
                        <Card.Header>Consumo por Solicitante (Top 10)</Card.Header>
                        <Card.Body style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={requesterStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="value" fill="#ffc658" name="Cantidad Solicitada" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4">
                {/* Stock vs Consumed Scatter/Bar */}
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header>Consumo Acumulado vs Stock Máximo (Items Críticos)</Card.Header>
                        <Card.Body style={{ height: '350px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stockVsConsumed}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="consumed" fill="#82ca9d" name="Consumido Total" />
                                    <Bar dataKey="stockMax" fill="#ff7300" name="Stock Máximo" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Trends Section */}
            <Row className="mb-4">
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header>📈 Tendencia de Consumo (Atendido en el Tiempo)</Card.Header>
                        <Card.Body style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={consumptionTrend} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="total" stroke="#8884d8" name="Cantidad Atendida" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Predictive Analysis Table */}
            <Row className="mb-4">
                <Col xs={12}>
                    <Card className="custom-card">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <span>🔮 Predicción de Necesidades (Basado en consumo de 30 días)</span>
                        </Card.Header>
                        {/* ... Table Content ... */}
                        <div className="table-responsive">
                            <Table hover>
                                <thead>
                                    <tr>
                                        <th>Material</th>
                                        <th className="text-center">Consumo Diario Promedio</th>
                                        <th className="text-center">Proyección 15 Días</th>
                                        <th className="text-center">Proyección 30 Días</th>
                                        <th className="text-center">Acción Sugerida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {predictions.map((p, idx) => (
                                        <tr key={idx}>
                                            <td className="fw-bold">{p.material}</td>
                                            <td className="text-center">{p.avgDaily}</td>
                                            <td className="text-center fw-bold text-primary">{p.next15Days}</td>
                                            <td className="text-center fw-bold text-success">{p.next30Days}</td>
                                            <td className="text-center">
                                                {parseFloat(p.next15Days) > 10 ?
                                                    <Badge bg="warning" text="dark">Verificar Stock</Badge> :
                                                    <Badge bg="secondary">Monitorizar</Badge>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                    {predictions.length === 0 && <tr><td colSpan={5} className="text-center">No hay datos suficientes para predicciones.</td></tr>}
                                </tbody>
                            </Table>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Inventory Health Section */}
            <h3 className="mb-3 text-muted text-center text-md-start">Salud del Inventario</h3>
            <Row className="mb-5 g-3">
                {/* Stockout Risk */}
                <Col xs={12} md={4}>
                    <Card className="custom-card h-100 border-warning">
                        <Card.Header className="bg-warning text-dark fw-bold">⚠️ Riesgo de Quiebre (Stock Bajo)</Card.Header>
                        <Card.Body>
                            {stockoutRisk.length > 0 ? (
                                <ul className="list-group list-group-flush">
                                    {stockoutRisk.map((item, idx) => (
                                        <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                                            <span>{item.material}</span>
                                            <Badge bg="danger" pill>{item.stock} / {item.max}</Badge>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-muted text-center my-3">No hay riesgos detectados.</p>}
                        </Card.Body>
                    </Card>
                </Col>

                {/* Dead Stock */}
                <Col xs={12} md={4}>
                    <Card className="custom-card h-100 border-secondary">
                        <Card.Header className="bg-secondary text-white fw-bold">🕸️ Inventario Inmovilizado (+60 días)</Card.Header>
                        <Card.Body>
                            {slowMoving.length > 0 ? (
                                <ul className="list-group list-group-flush">
                                    {slowMoving.map((item, idx) => (
                                        <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                                            <span>{item.material}</span>
                                            <small className="text-muted">Stock: {item.stock}</small>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-muted text-center my-3">Todo el inventario tiene movimiento.</p>}
                        </Card.Body>
                    </Card>
                </Col>

                {/* Excess Stock */}
                <Col xs={12} md={4}>
                    <Card className="custom-card h-100 border-primary">
                        <Card.Header className="bg-primary text-white fw-bold">📦 Exceso de Stock ({'>'} Máx)</Card.Header>
                        <Card.Body>
                            {excessInventory.length > 0 ? (
                                <ul className="list-group list-group-flush">
                                    {excessInventory.map((item, idx) => (
                                        <li key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                                            <span>{item.material}</span>
                                            <Badge bg="info" pill>+{item.excess}</Badge>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-muted text-center my-3">Niveles de stock óptimos.</p>}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default EstadisticasMateriales;
