import React, { useState } from 'react';
import { Nav, Navbar, Container } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
    const location = useLocation();
    const [expanded, setExpanded] = useState(false);

    const isActive = (path: string) => location.pathname.includes(path);

    // Close nav when a link is clicked (mobile UX)
    const closeNav = () => setExpanded(false);

    return (
        <Navbar
            expand="lg"
            className="sidebar p-0"
            variant="dark"
            expanded={expanded}
            onToggle={(expanded) => setExpanded(expanded)}
        >
            <Container fluid className="d-flex flex-lg-column align-items-lg-start h-100 p-0">
                <div className="d-flex justify-content-between w-100 align-items-center px-4 py-3 py-lg-4 px-lg-0">
                    <Navbar.Brand as={Link} to="/" className="sidebar-brand m-0" onClick={closeNav}>
                        <span role="img" aria-label="logo">🏗️</span> Control Obras
                    </Navbar.Brand>
                    <Navbar.Toggle aria-controls="sidebar-nav" className="border-0 text-white" />
                </div>

                <Navbar.Collapse id="sidebar-nav" className="w-100 px-3 px-lg-0">
                    <Nav className="flex-column w-100 px-2 px-lg-4 pb-4">
                        <div className="nav-section-title">Principal</div>

                        <Nav.Link as={Link} to="/requerimientos" className={`nav-link ${isActive('/requerimientos') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📋</span> Requerimientos
                        </Nav.Link>

                        <Nav.Link as={Link} to="/solicitudes" className={`nav-link ${isActive('/solicitudes') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📑</span> Solicitudes Compra
                        </Nav.Link>

                        <Nav.Link as={Link} to="/ordenes" className={`nav-link ${isActive('/ordenes') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">🚛</span> Ordenes Compra
                        </Nav.Link>

                        <Nav.Link as={Link} to="/materiales" className={`nav-link ${isActive('/materiales') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">🧱</span> Materiales
                        </Nav.Link>

                        <div className="nav-section-title">Almacén</div>

                        <Nav.Link as={Link} to="/almacen/entradas" className={`nav-link ${isActive('/almacen/entradas') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📥</span> Registrar Entradas
                        </Nav.Link>

                        <Nav.Link as={Link} to="/almacen/salidas" className={`nav-link ${isActive('/almacen/salidas') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📤</span> Registrar Salidas
                        </Nav.Link>

                        <Nav.Link as={Link} to="/almacen/stock" className={`nav-link ${isActive('/almacen/stock') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📊</span> Stock Actual
                        </Nav.Link>

                        <div className="nav-section-title">Reportes</div>

                        <Nav.Link as={Link} to="/reportes/materiales" className={`nav-link ${isActive('/reportes/materiales') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📈</span> Reporte Materiales
                        </Nav.Link>

                        <Nav.Link as={Link} to="/reportes/estadisticas" className={`nav-link ${isActive('/reportes/estadisticas') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">📊</span> Estadísticas
                        </Nav.Link>

                        <div className="nav-section-title">Configuración</div>

                        <Nav.Link as={Link} to="/solicitantes" className={`nav-link ${isActive('/solicitantes') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">👥</span> Solicitantes
                        </Nav.Link>

                        <Nav.Link as={Link} to="/categorias" className={`nav-link ${isActive('/categorias') ? 'active' : ''}`} onClick={closeNav}>
                            <span className="me-2">🏷️</span> Categorías
                        </Nav.Link>

                        <div className="mt-4 mb-2 d-lg-block px-3" style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                            Logged in as User
                        </div>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
};

export default Navigation;
