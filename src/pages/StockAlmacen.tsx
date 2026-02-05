import React, { useState, useEffect } from 'react';
import { Table, Card, Form } from 'react-bootstrap';
import { getInventario } from '../services/almacenService';
import { Inventario } from '../types';

const StockAlmacen: React.FC = () => {
    const [inventario, setInventario] = useState<Inventario[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadStock();
    }, []);

    const loadStock = async () => {
        const data = await getInventario();
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
                                <td>{item.material?.categoria}</td>
                                <td>{item.material?.descripcion}</td>
                                <td>{item.material?.unidad}</td>
                                <td>
                                    <strong className={item.cantidad_actual === 0 ? 'text-danger' : 'text-success'}>
                                        {item.cantidad_actual}
                                    </strong>
                                </td>
                                <td>{item.ultimo_ingreso || '-'}</td>
                            </tr>
                        ))}
                        {filteredStock.length === 0 && <tr><td colSpan={5} className="text-center">No hay stock registrado</td></tr>}
                    </tbody>
                </Table>
            </Card>
        </div>
    );
};

export default StockAlmacen;
