import React, { useState, useEffect } from 'react';
import { Table, Card, Form } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { getInventario, getInventarioById } from '../services/almacenService';
import { Inventario } from '../types';
import { useAuth } from '../context/AuthContext';

const StockAlmacen: React.FC = () => {
    const { selectedObra } = useAuth();
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadStock();
    }, []);

    // --- Realtime Subscription ---
    useEffect(() => {
        const channel = supabase
            .channel('stock-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventario_obra' },
                async (payload) => {
                    const { eventType, new: newRecord } = payload;

                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        const updatedItem = await getInventarioById(newRecord.id);
                        if (updatedItem) {
                            setInventario(prev => {
                                const exists = prev.find(i => i.id === updatedItem.id);
                                if (exists) {
                                    return prev.map(i => i.id === updatedItem.id ? updatedItem : i);
                                } else {
                                    return [...prev, updatedItem];
                                }
                            });
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []); // Empty dependency array

    useEffect(() => {
        if (selectedObra) {
            loadStock();
        } else {
            setInventario([]);
        }
    }, [selectedObra]);

    const loadStock = async () => {
        if (!selectedObra) return;
        const data = await getInventario(selectedObra.id);
        setInventario(data || []);
    };

    const filteredStock = inventario.filter(i =>
        i.material?.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.material?.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Stock Actual en Obra</h2>
            </div>

            <Card className="custom-card">
                <Card.Body>
                    <div className="row">
                        <div className="col-12 col-md-4">
                            <Form.Control
                                placeholder="Buscar material..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </Card.Body>
            </Card>



            <Card className="custom-card p-0 overflow-hidden">
                <Table hover responsive className="table-borderless-custom mb-0">
                    <thead>
                        <tr>
                            <th>Frente</th>
                            <th>Categoría</th>
                            <th>Material</th>
                            <th>Unidad</th>
                            <th>Stock Actual</th>
                            <th>Último Ingreso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStock.map(item => (
                            <tr key={item.id}>
                                <td>{item.material?.frente?.nombre_frente || '-'}</td>
                                <td>{item.material?.categoria}</td>
                                <td>{item.material?.descripcion}</td>
                                <td>{item.material?.unidad}</td>
                                <td>
                                    <strong className={item.cantidad_actual === 0 ? 'text-danger' : 'text-success'}>
                                        {Number(item.cantidad_actual).toFixed(2)}
                                    </strong>
                                </td>
                                <td>{item.ultimo_ingreso || '-'}</td>
                            </tr>
                        ))}
                        {filteredStock.length === 0 && <tr><td colSpan={6} className="text-center">No hay stock registrado</td></tr>}
                    </tbody>
                </Table>
            </Card>
        </div>
    );
};

export default StockAlmacen;
