
import { Container, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
    const navigate = useNavigate();

    return (
        <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '80vh' }}>
            <Card className="text-center shadow-sm p-4" style={{ maxWidth: '500px' }}>
                <Card.Body>
                    <h1 className="text-danger mb-3">⛔</h1>
                    <Card.Title className="mb-3">Acceso No Autorizado</Card.Title>
                    <Card.Text>
                        No tienes permisos para acceder a esta página.
                        Si crees que esto es un error, contacta al administrador.
                    </Card.Text>
                    <Button variant="primary" onClick={() => navigate(-1)}>
                        Regresar
                    </Button>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default Unauthorized;
