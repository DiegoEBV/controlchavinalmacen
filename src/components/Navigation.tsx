import React, { useState, useEffect } from 'react';
import { Nav, Navbar, Container, Button, Collapse } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    FaBell, FaChevronDown, FaChevronRight, FaClipboardList, FaFileSignature, 
    FaFileExport, FaTools, FaTruck, FaSignInAlt, FaSignOutAlt, 
    FaRedo, FaHammer, FaBoxes, FaCalculator, FaChartLine, 
    FaChartBar, FaBuilding, FaRoad, FaUsers, FaReceipt, 
    FaHandshake, FaHardHat, FaTags, FaCubes, FaTruckPickup, FaUserShield 
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';


const Navigation: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(Notification.permission);
    const { user, profile, signOut, hasRole } = useAuth();
    const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
        principal: true,
        almacen: true,
        reportes: true,
        config: false
    });

    const toggleSection = (section: string) => {
        setOpenSections((prev: { [key: string]: boolean }) => ({ ...prev, [section]: !prev[section] }));
    };

    const isActive = (path: string) => location.pathname.includes(path);

    // Auto-expand sections that contain active links
    useEffect(() => {
        const sections = [
            { id: 'principal', paths: ['/requerimientos', '/pedidos-salida', '/solicitudes', '/servicios', '/ordenes'] },
            { id: 'almacen', paths: ['/almacen/entradas', '/almacen/salidas', '/almacen/devoluciones', '/movimiento-equipos', '/almacen/stock', '/almacen/cierre-valorizado'] },
            { id: 'reportes', paths: ['/reportes/materiales', '/reportes/estadisticas'] },
            { id: 'config', paths: ['/obras', '/frentes', '/usuarios', '/presupuesto', '/terceros', '/especialidades', '/categorias', '/materiales', '/equipos', '/epps'] }
        ];

        sections.forEach(section => {
            if (section.paths.some(path => location.pathname.includes(path))) {
                setOpenSections((prev: { [key: string]: boolean }) => ({ ...prev, [section.id]: true }));
            }
        });
    }, [location.pathname]);

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
    const canViewCierreValorizado = hasRole(['admin', 'almacenero', 'coordinador']);
    const canViewReportes = hasRole(['produccion', 'coordinador', 'logistica', 'almacenero', 'admin']);

    // Permisos de configuración
    const canViewSolicitantes = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewCategorias = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewUsuarios = hasRole(['admin']);
    const canViewEquipos = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewEpps = hasRole(['admin', 'coordinador', 'logistica']);
    const canViewEspecialidades = hasRole(['admin']);
    const canViewTerceros = hasRole(['admin', 'coordinador', 'logistica']);
    const showConfigSection = canViewSolicitantes || canViewCategorias || canViewUsuarios || canViewEquipos || canViewTerceros || canViewEpps || canViewEspecialidades;

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
                        <div 
                            className="nav-section-title d-flex align-items-center justify-content-between cursor-pointer"
                            onClick={() => toggleSection('principal')}
                            style={{ cursor: 'pointer' }}
                        >
                            <span>Principal</span>
                            {openSections.principal ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                        </div>

                        <Collapse in={openSections.principal}>
                            <div>
                                {canViewRequerimientos && (
                                    <>
                                        <Nav.Link as={Link} to="/requerimientos" className={`nav-link ${isActive('/requerimientos') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaClipboardList className="me-2" /> Requerimientos
                                        </Nav.Link>
                                        <Nav.Link as={Link} to="/pedidos-salida" className={`nav-link ${isActive('/pedidos-salida') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaFileSignature className="me-2" /> Pedidos Salida
                                        </Nav.Link>
                                    </>
                                )}

                                {canViewSolicitudes && (
                                    <>
                                        <Nav.Link as={Link} to="/solicitudes" className={`nav-link ${isActive('/solicitudes') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaFileExport className="me-2" /> Solicitudes Compra
                                        </Nav.Link>
                                        <Nav.Link as={Link} to="/servicios" className={`nav-link ${isActive('/servicios') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaTools className="me-2" /> Servicios
                                        </Nav.Link>
                                    </>
                                )}

                                {canViewOrdenes && (
                                    <Nav.Link as={Link} to="/ordenes" className={`nav-link ${isActive('/ordenes') ? 'active' : ''}`} onClick={closeNav}>
                                        <FaTruck className="me-2" /> Ordenes Compra
                                    </Nav.Link>
                                )}
                            </div>
                        </Collapse>


                        {(canViewAlmacen || canEditAlmacen) && (
                            <div 
                                className="nav-section-title d-flex align-items-center justify-content-between cursor-pointer"
                                onClick={() => toggleSection('almacen')}
                                style={{ cursor: 'pointer' }}
                            >
                                <span>Almacén</span>
                                {openSections.almacen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                            </div>
                        )}

                        <Collapse in={openSections.almacen}>
                            <div>
                                {canEditAlmacen && (
                                    <>
                                        <Nav.Link as={Link} to="/almacen/entradas" className={`nav-link ${isActive('/almacen/entradas') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaSignInAlt className="me-2" /> Registrar Entradas
                                        </Nav.Link>

                                        <Nav.Link as={Link} to="/almacen/salidas" className={`nav-link ${isActive('/almacen/salidas') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaSignOutAlt className="me-2" /> Registrar Salidas
                                        </Nav.Link>

                                        <Nav.Link as={Link} to="/almacen/devoluciones" className={`nav-link ${isActive('/almacen/devoluciones') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaRedo className="me-2" /> Registrar Devoluciones
                                        </Nav.Link>

                                        <Nav.Link as={Link} to="/movimiento-equipos" className={`nav-link ${isActive('/movimiento-equipos') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaHammer className="me-2" /> Equipos Menores
                                        </Nav.Link>
                                    </>
                                )}

                                {canViewAlmacen && (
                                    <>
                                        <Nav.Link as={Link} to="/almacen/stock" className={`nav-link ${isActive('/almacen/stock') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaBoxes className="me-2" /> Stock Actual
                                        </Nav.Link>
                                        {canViewCierreValorizado && (
                                            <Nav.Link as={Link} to="/almacen/cierre-valorizado" className={`nav-link ${isActive('/almacen/cierre-valorizado') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaCalculator className="me-2" /> Cierre Valorizado
                                            </Nav.Link>
                                        )}
                                    </>
                                )}
                            </div>
                        </Collapse>

                        {canViewReportes && (
                            <>
                                <div 
                                    className="nav-section-title d-flex align-items-center justify-content-between cursor-pointer"
                                    onClick={() => toggleSection('reportes')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span>Reportes</span>
                                    {openSections.reportes ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                                </div>

                                <Collapse in={openSections.reportes}>
                                    <div>
                                        <Nav.Link as={Link} to="/reportes/materiales" className={`nav-link ${isActive('/reportes/materiales') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaChartLine className="me-2" /> Reporte Materiales
                                        </Nav.Link>

                                        <Nav.Link as={Link} to="/reportes/estadisticas" className={`nav-link ${isActive('/reportes/estadisticas') ? 'active' : ''}`} onClick={closeNav}>
                                            <FaChartBar className="me-2" /> Estadísticas
                                        </Nav.Link>
                                    </div>
                                </Collapse>
                            </>
                        )}

                        {showConfigSection && (
                            <>
                                <div 
                                    className="nav-section-title d-flex align-items-center justify-content-between cursor-pointer"
                                    onClick={() => toggleSection('config')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span>Configuración</span>
                                    {openSections.config ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                                </div>

                                <Collapse in={openSections.config}>
                                    <div>
                                        {canViewUsuarios && (
                                            <>
                                                <Nav.Link as={Link} to="/obras" className={`nav-link ${isActive('/obras') ? 'active' : ''}`} onClick={closeNav}>
                                                    <FaBuilding className="me-2" /> Obras
                                                </Nav.Link>
                                                <Nav.Link as={Link} to="/frentes" className={`nav-link ${isActive('/frentes') ? 'active' : ''}`} onClick={closeNav}>
                                                    <FaRoad className="me-2" /> Frentes
                                                </Nav.Link>
                                                <Nav.Link as={Link} to="/usuarios" className={`nav-link ${isActive('/usuarios') ? 'active' : ''}`} onClick={closeNav}>
                                                    <FaUsers className="me-2" /> Usuarios
                                                </Nav.Link>
                                                <Nav.Link as={Link} to="/presupuesto" className={`nav-link ${isActive('/presupuesto') ? 'active' : ''}`} onClick={closeNav}>
                                                    <FaReceipt className="me-2" /> Lista Insumos
                                                </Nav.Link>
                                            </>
                                        )}

                                        {canViewTerceros && (
                                            <Nav.Link as={Link} to="/terceros" className={`nav-link ${isActive('/terceros') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaHandshake className="me-2" /> Terceros
                                            </Nav.Link>
                                        )}

                                        {canViewEspecialidades && (
                                            <Nav.Link as={Link} to="/especialidades" className={`nav-link ${isActive('/especialidades') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaHardHat className="me-2" /> Especialidades
                                            </Nav.Link>
                                        )}

                                        {canViewCategorias && (
                                            <Nav.Link as={Link} to="/categorias" className={`nav-link ${isActive('/categorias') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaTags className="me-2" /> Categorías
                                            </Nav.Link>
                                        )}

                                        {canViewMateriales && (
                                            <Nav.Link as={Link} to="/materiales" className={`nav-link ${isActive('/materiales') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaCubes className="me-2" /> Materiales
                                            </Nav.Link>
                                        )}

                                        {canViewEquipos && (
                                            <Nav.Link as={Link} to="/equipos" className={`nav-link ${isActive('/equipos') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaTruckPickup className="me-2" /> Equipos
                                            </Nav.Link>
                                        )}

                                        {canViewEpps && (
                                            <Nav.Link as={Link} to="/epps" className={`nav-link ${isActive('/epps') ? 'active' : ''}`} onClick={closeNav}>
                                                <FaUserShield className="me-2" /> EPPs-C
                                            </Nav.Link>
                                        )}
                                    </div>
                                </Collapse>
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
