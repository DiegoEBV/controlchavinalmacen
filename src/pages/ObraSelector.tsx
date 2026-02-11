import { useEffect, useState } from 'react';
import { Container, Card, Row, Col, Button, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabaseClient';
import { Obra } from '../types';

const ObraSelector = () => {
    const { user, selectObra } = useAuth();
    const navigate = useNavigate();
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchObras();
        }
    }, [user]);

    const fetchObras = async () => {
        try {
            // Verificar si es administrador
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

            let query = supabase.from('obras').select('*');

            // Si no es admin, filtrar por asignación
            if (profile?.role !== 'admin') {
                const { data: assignments } = await supabase
                    .from('usuario_obras')
                    .select('obra_id')
                    .eq('user_id', user?.id);

                const obraIds = assignments?.map(a => a.obra_id) || [];

                if (obraIds.length > 0) {
                    query = query.in('id', obraIds);
                } else {
                    // Sin asignaciones
                    setObras([]);
                    setLoading(false);
                    return;
                }
            }

            const { data, error } = await query.order('nombre_obra');

            if (error) throw error;
            setObras(data || []);

            // Auto-seleccionar si solo hay uno
            if (data && data.length === 1) {
                handleSelect(data[0]);
            }

        } catch (error) {
            console.error('Error fetching obras:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (obra: Obra) => {
        selectObra(obra);
        navigate('/'); // Redirigirá al panel a través de RoleBasedRedirect
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100">
                <Spinner animation="border" variant="primary" />
            </div>
        );
    }

    return (
        <Container className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light">
            <h2 className="mb-4 text-primary fw-bold">Selecciona un Proyecto</h2>
            <Row className="g-4 justify-content-center w-100" style={{ maxWidth: '800px' }}>
                {obras.length > 0 ? (
                    obras.map(obra => (
                        <Col key={obra.id} xs={12} md={6}>
                            <Card
                                className="h-100 shadow-sm border-0 cursor-pointer hover-card"
                                onClick={() => handleSelect(obra)}
                                style={{ transition: 'transform 0.2s', cursor: 'pointer' }}
                                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <Card.Body className="text-center p-4">
                                    <div className="mb-3 display-4">🏗️</div>
                                    <Card.Title className="fw-bold mb-2">{obra.nombre_obra}</Card.Title>
                                    <Card.Text className="text-muted small">
                                        {obra.ubicacion || 'Sin ubicación'}
                                    </Card.Text>
                                    <Button variant="outline-primary" className="mt-3 px-4">
                                        Acceder
                                    </Button>
                                </Card.Body>
                            </Card>
                        </Col>
                    ))
                ) : (
                    <Col xs={12} className="text-center">
                        <Card className="p-5 border-0 shadow-sm">
                            <Card.Body>
                                <h4>No tienes proyectos asignados</h4>
                                <p className="text-muted">Contacta al administrador para que te asigne a una obra.</p>
                                <Button variant="secondary" onClick={() => { supabase.auth.signOut(); navigate('/login'); }}>
                                    Cerrar Sesión
                                </Button>
                            </Card.Body>
                        </Card>
                    </Col>
                )}
            </Row>
        </Container>
    );
};

export default ObraSelector;
