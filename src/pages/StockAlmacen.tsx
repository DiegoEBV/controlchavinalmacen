import React, { useState, useEffect, useMemo } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario } from '../services/almacenService';
import { StockItem, Inventario } from '../types';
import { useAuth } from '../context/AuthContext';

const StockAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [filterCategory, setFilterCategory] = useState('Todos');

    useEffect(() => {
        if (selectedObra) {
            loadStock();
        } else {
            setStockItems([]);
        }
    }, [selectedObra]);

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
            // Fetch unified inventory
            const inventarioData = await getInventario(selectedObra.id);

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

    const filteredStock = useMemo(() => {
        return stockItems.filter(item => {
            const term = searchTerm.toLowerCase();
            let matchesSearch = false;
            let matchesCategory = true;
            let itemCategory = '';

            if (item.type === 'MATERIAL') {
                const mat = (item.data as Inventario).material;
                if (!mat) return false;
                matchesSearch =
                    mat.descripcion.toLowerCase().includes(term) ||
                    mat.categoria.toLowerCase().includes(term) ||
                    (mat.frente?.nombre_frente || '').toLowerCase().includes(term);
                itemCategory = mat.categoria;
            } else if (item.type === 'EQUIPO') {
                const eq = (item.data as any).equipo;
                if (!eq) return false;
                matchesSearch =
                    eq.nombre.toLowerCase().includes(term) ||
                    eq.marca.toLowerCase().includes(term) ||
                    eq.codigo.toLowerCase().includes(term) ||
                    'equipo'.includes(term);
                itemCategory = 'Equipos';
            } else if (item.type === 'EPP') {
                const epp = (item.data as any).epp;
                if (!epp) return false;
                matchesSearch =
                    epp.descripcion.toLowerCase().includes(term) ||
                    epp.tipo.toLowerCase().includes(term) ||
                    (epp.codigo || '').toLowerCase().includes(term) ||
                    'epp'.includes(term);
                itemCategory = 'EPPs';
            }

            if (filterCategory !== 'Todos') {
                if (filterCategory === 'Equipos') matchesCategory = (item.type === 'EQUIPO');
                else if (filterCategory === 'EPPs') matchesCategory = (item.type === 'EPP');
                else matchesCategory = (itemCategory === filterCategory);
            }

            return matchesSearch && matchesCategory;
        });
    }, [stockItems, searchTerm, filterCategory]);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Stock Actual en Obra</h2>
            </div>

            <Card className="custom-card">
                <Card.Body>
                    <div className="row g-3">
                        <div className="col-12 col-md-6">
                            <Form.Control
                                placeholder="Buscar (Material, Equipo, EPP)..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
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
                            <th>Último Ingreso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="text-center p-5">Cargando inventario...</td></tr>
                        ) : filteredStock.length === 0 ? (
                            <tr><td colSpan={7} className="text-center p-5 text-muted">No hay ítems en stock.</td></tr>
                        ) : (
                            filteredStock.map((item, index) => {
                                let typeLabel = '';
                                let col2 = '-'; // Frente or Marca
                                let description = '-';
                                let category = '-';
                                let unit = '-';
                                let stock = 0;
                                let lastIngress = item.data.ultimo_ingreso ? new Date(item.data.ultimo_ingreso).toLocaleDateString() : '-';

                                if (item.type === 'MATERIAL') {
                                    const d = item.data as Inventario;
                                    typeLabel = 'Material';
                                    col2 = d.material?.frente?.nombre_frente || '-';
                                    description = d.material?.descripcion || '';
                                    category = d.material?.categoria || '';
                                    unit = d.material?.unidad || '';
                                    stock = d.cantidad_actual;
                                } else if (item.type === 'EQUIPO') {
                                    const d = (item.data as any).equipo;
                                    typeLabel = 'Equipo';
                                    col2 = d.marca || '-';
                                    description = `${d.nombre} [${d.codigo}]`;
                                    category = 'Equipo';
                                    unit = 'UND';
                                    stock = item.data.cantidad_actual;
                                } else if (item.type === 'EPP') {
                                    const d = (item.data as any).epp;
                                    typeLabel = 'EPP';
                                    col2 = '-';
                                    description = `${d.descripcion} [${d.codigo || ''}]`;
                                    category = d.tipo;
                                    unit = d.unidad;
                                    stock = item.data.cantidad_actual;
                                }

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
                                        <td className="small text-muted">{lastIngress}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </Table>
            </Card>
        </div>
    );
};

export default StockAlmacen;
