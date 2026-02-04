import React from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
    const location = useLocation();

    const isActive = (path: string) => location.pathname.includes(path);

    return (
        <div className="sidebar">
            <Link to="/" className="sidebar-brand">
                <span role="img" aria-label="logo">🏗️</span> Control Obras
            </Link>

            <Nav className="flex-column w-100">
                <div className="nav-section-title">Principal</div>

                <Nav.Link as={Link} to="/requerimientos" className={`nav-link ${isActive('/requerimientos') ? 'active' : ''}`}>
                    <span className="me-2">📋</span> Requerimientos
                </Nav.Link>

                <Nav.Link as={Link} to="/materiales" className={`nav-link ${isActive('/materiales') ? 'active' : ''}`}>
                    <span className="me-2">🧱</span> Materiales
                </Nav.Link>

                <div className="nav-section-title">Almacén</div>

                <Nav.Link as={Link} to="/almacen/entradas" className={`nav-link ${isActive('/almacen/entradas') ? 'active' : ''}`}>
                    <span className="me-2">📥</span> Registrar Entradas
                </Nav.Link>

                <Nav.Link as={Link} to="/almacen/salidas" className={`nav-link ${isActive('/almacen/salidas') ? 'active' : ''}`}>
                    <span className="me-2">📤</span> Registrar Salidas
                </Nav.Link>

                <Nav.Link as={Link} to="/almacen/stock" className={`nav-link ${isActive('/almacen/stock') ? 'active' : ''}`}>
                    <span className="me-2">📊</span> Stock Actual
                </Nav.Link>

                <div className="nav-section-title">Configuración</div>

                <Nav.Link as={Link} to="/solicitantes" className={`nav-link ${isActive('/solicitantes') ? 'active' : ''}`}>
                    <span className="me-2">👥</span> Solicitantes
                </Nav.Link>

                <Nav.Link as={Link} to="/categorias" className={`nav-link ${isActive('/categorias') ? 'active' : ''}`}>
                    <span className="me-2">🏷️</span> Categorías
                </Nav.Link>
            </Nav>

            <div className="mt-auto">
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    Logged in as User
                </div>
            </div>
        </div>
    );
};

export default Navigation;
