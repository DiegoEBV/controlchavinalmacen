import React, { useState } from 'react';
import { Nav, Navbar, Container, Button } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';


const Navigation: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(Notification.permission);
    const { user, profile, signOut, hasRole } = useAuth();

    const isActive = (path: string) => location.pathname.includes(path);

    // Cerrar navegación al hacer clic en un enlace (UX móvil)
    const closeNav = () => setExpanded(false);

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    if (!user) return null; // No mostrar navegación si no ha iniciado sesión (o manejar de otra manera)

    const canViewRequerimientos = hasRole(['produccion', 'coordinador', 'admin']);
    const canViewSolicitudes = hasRole(['coordinador', 'admin']); // SC
    const canViewOrdenes = hasRole(['logistica', 'admin']); // OC
    const canViewMateriales = hasRole(['coordinador', 'logistica', 'admin']);
    const canViewAlmacen = hasRole(['almacenero', 'produccion', 'coordinador', 'logistica', 'admin']); // Visualización de stock
    const canEditAlmacen = hasRole(['almacenero', 'admin']); // Entradas/Salidas
    const canViewReportes = hasRole(['produccion', 'coordinador', 'logistica', 'almacenero', 'admin']);

    // Permisos de configuración
    const canViewSolicitantes = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewCategorias = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewUsuarios = hasRole(['admin']);
    const showConfigSection = canViewSolicitantes || canViewCategorias || canViewUsuarios;

    const requestNotificationPermission = async () => {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
            new Notification('Notificaciones Activas', {
                body: 'Ahora recibirás alertas de material',
                icon: '/icono.png'
            });
        }
    };

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
                        <span role="img" aria-label="logo">🏗️</span> Control Almacen
                    </Navbar.Brand>
                    <Navbar.Toggle aria-controls="sidebar-nav" className="border-0 text-white" />
                </div>

                <Navbar.Collapse id="sidebar-nav" className="w-100 px-3 px-lg-0 sidebar-scroll d-lg-flex flex-lg-column">
                    {/* Notification Button */}
                    {notificationPermission === 'default' && (
                        <div className="px-2 px-lg-4 mt-3 mb-2 w-100">
                            <Button variant="outline-light" size="sm" className="w-100 d-flex align-items-center justify-content-center gap-2" onClick={requestNotificationPermission} style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                <FaBell /> Activar Notificaciones
                            </Button>
                        </div>
                    )}
                    {notificationPermission === 'denied' && (
                        <div className="px-2 px-lg-4 mt-3 mb-2 w-100">
                            <Button variant="outline-danger" size="sm" className="w-100 d-flex align-items-center justify-content-center gap-2" disabled>
                                <FaBell /> Notificaciones Bloqueadas
                            </Button>
                        </div>
                    )}

                    <Nav className="flex-column w-100 px-2 px-lg-4 pb-4 flex-grow-1">
                        <div className="nav-section-title">Principal</div>

                        {canViewRequerimientos && (
                            <Nav.Link as={Link} to="/requerimientos" className={`nav-link ${isActive('/requerimientos') ? 'active' : ''}`} onClick={closeNav}>
                                <span className="me-2">📋</span> Requerimientos
                            </Nav.Link>
                        )}

                        {canViewSolicitudes && (
                            <Nav.Link as={Link} to="/solicitudes" className={`nav-link ${isActive('/solicitudes') ? 'active' : ''}`} onClick={closeNav}>
                                <span className="me-2">📑</span> Solicitudes Compra
                            </Nav.Link>
                        )}

                        {canViewOrdenes && (
                            <Nav.Link as={Link} to="/ordenes" className={`nav-link ${isActive('/ordenes') ? 'active' : ''}`} onClick={closeNav}>
                                <span className="me-2">🚛</span> Ordenes Compra
                            </Nav.Link>
                        )}

                        {canViewMateriales && (
                            <Nav.Link as={Link} to="/materiales" className={`nav-link ${isActive('/materiales') ? 'active' : ''}`} onClick={closeNav}>
                                <span className="me-2">🧱</span> Materiales
                            </Nav.Link>
                        )}

                        {(canViewAlmacen || canEditAlmacen) && <div className="nav-section-title">Almacén</div>}

                        {canEditAlmacen && (
                            <>
                                <Nav.Link as={Link} to="/almacen/entradas" className={`nav-link ${isActive('/almacen/entradas') ? 'active' : ''}`} onClick={closeNav}>
                                    <span className="me-2">📥</span> Registrar Entradas
                                </Nav.Link>

                                <Nav.Link as={Link} to="/almacen/salidas" className={`nav-link ${isActive('/almacen/salidas') ? 'active' : ''}`} onClick={closeNav}>
                                    <span className="me-2">📤</span> Registrar Salidas
                                </Nav.Link>
                            </>
                        )}

                        {canViewAlmacen && (
                            <Nav.Link as={Link} to="/almacen/stock" className={`nav-link ${isActive('/almacen/stock') ? 'active' : ''}`} onClick={closeNav}>
                                <span className="me-2">📊</span> Stock Actual
                            </Nav.Link>
                        )}

                        {canViewReportes && (
                            <>
                                <div className="nav-section-title">Reportes</div>

                                <Nav.Link as={Link} to="/reportes/materiales" className={`nav-link ${isActive('/reportes/materiales') ? 'active' : ''}`} onClick={closeNav}>
                                    <span className="me-2">📈</span> Reporte Materiales
                                </Nav.Link>

                                <Nav.Link as={Link} to="/reportes/estadisticas" className={`nav-link ${isActive('/reportes/estadisticas') ? 'active' : ''}`} onClick={closeNav}>
                                    <span className="me-2">📊</span> Estadísticas
                                </Nav.Link>
                            </>
                        )}

                        {showConfigSection && (
                            <>
                                <div className="nav-section-title">Configuración</div>

                                {canViewSolicitantes && (
                                    <Nav.Link as={Link} to="/solicitantes" className={`nav-link ${isActive('/solicitantes') ? 'active' : ''}`} onClick={closeNav}>
                                        <span className="me-2">👥</span> Solicitantes
                                    </Nav.Link>
                                )}

                                {canViewCategorias && (
                                    <Nav.Link as={Link} to="/categorias" className={`nav-link ${isActive('/categorias') ? 'active' : ''}`} onClick={closeNav}>
                                        <span className="me-2">🏷️</span> Categorías
                                    </Nav.Link>
                                )}

                                {canViewUsuarios && (
                                    <>
                                        <Nav.Link as={Link} to="/usuarios" className={`nav-link ${isActive('/usuarios') ? 'active' : ''}`} onClick={closeNav}>
                                            <span className="me-2">👤</span> Usuarios
                                        </Nav.Link>
                                        <Nav.Link as={Link} to="/obras" className={`nav-link ${isActive('/obras') ? 'active' : ''}`} onClick={closeNav}>
                                            <span className="me-2">🏗️</span> Obras
                                        </Nav.Link>
                                        <Nav.Link as={Link} to="/frentes" className={`nav-link ${isActive('/frentes') ? 'active' : ''}`} onClick={closeNav}>
                                            <span className="me-2">🚧</span> Frentes
                                        </Nav.Link>
                                    </>
                                )}
                            </>
                        )}

                        <div className="mt-auto pt-4 border-top border-secondary">
                            <div className="px-2 mb-3 text-white-50 small">
                                <div>{profile?.nombre || user.email}</div>
                                <div className="text-uppercase" style={{ fontSize: '0.7rem' }}>{profile?.role || 'Usuario'}</div>
                            </div>
                            <Button variant="outline-light" size="sm" className="w-100" onClick={handleLogout}>
                                Cerrar Sesión
                            </Button>
                        </div>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
};

export default Navigation;
