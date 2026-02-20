import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker
const updateSW = registerSW({
    onNeedRefresh() {
        if (confirm('Nueva versión disponible. ¿Recargar?')) {
            updateSW(true);
        }
    },
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import GestionRequerimientos from './pages/GestionRequerimientos';
import GestionMateriales from './pages/GestionMateriales';
import GestionPresupuesto from './pages/GestionPresupuesto';
import EntradasAlmacen from './pages/EntradasAlmacen';
import SalidasAlmacen from './pages/SalidasAlmacen';
import StockAlmacen from './pages/StockAlmacen';
import GestionCategorias from './pages/GestionCategorias';
import GestionUsuarios from './pages/GestionUsuarios';
import GestionSolicitudes from './pages/GestionSolicitudes';
import GestionServicios from './pages/GestionServicios';
import GestionOrdenes from './pages/GestionOrdenes';
import ReporteMateriales from './pages/ReporteMateriales';
import EstadisticasMateriales from './pages/EstadisticasMateriales';
import GestionObras from './pages/GestionObras';
import GestionFrentes from './pages/GestionFrentes';
import GestionEquipos from './pages/GestionEquipos';
import GestionEPPs from './components/GestionEPPs';
import GestionEspecialidades from './pages/GestionEspecialidades';
import GestionTerceros from './pages/GestionTerceros';
import Layout from './components/Layout';
import Login from './pages/Login';
import ObraSelector from './pages/ObraSelector';
import Unauthorized from './pages/Unauthorized';
import ProtectedRoute from './components/ProtectedRoute';
import { Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

const LayoutWrapper = () => {
    const { selectedObra, loading } = useAuth();

    if (loading) return <div className="p-5 text-center">Cargando...</div>;

    if (!selectedObra) {
        return <Navigate to="/select-obra" replace />;
    }

    return (
        <Layout>
            <Outlet />
        </Layout>
    );
};

const RoleBasedRedirect = () => {
    const { profile, selectedObra } = useAuth();

    if (!profile) return <Navigate to="/login" />;

    if (!selectedObra) return <Navigate to="/select-obra" />;

    switch (profile.role) {
        case 'produccion':
        case 'coordinador':
        case 'admin':
            return <Navigate to="/requerimientos" />;
        case 'logistica':
            return <Navigate to="/ordenes" />;
        case 'almacenero':
            return <Navigate to="/almacen/stock" />; // o entradas
        default:
            return <Navigate to="/requerimientos" />; // Fallback
    }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <NotificationProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/unauthorized" element={<Unauthorized />} />
                        <Route element={<ProtectedRoute />}>
                            <Route path="/select-obra" element={<ObraSelector />} />
                            <Route element={<LayoutWrapper />}>
                                <Route path="/" element={<RoleBasedRedirect />} />

                                <Route element={<ProtectedRoute allowedRoles={['produccion', 'coordinador']} />}>
                                    <Route path="/requerimientos" element={<GestionRequerimientos />} />
                                    <Route path="/presupuesto" element={<GestionPresupuesto />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['coordinador']} />}>
                                    <Route path="/solicitudes" element={<GestionSolicitudes />} />
                                    <Route path="/servicios" element={<GestionServicios />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['logistica']} />}>
                                    <Route path="/ordenes" element={<GestionOrdenes />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['coordinador', 'logistica']} />}>
                                    <Route path="/materiales" element={<GestionMateriales />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['almacenero', 'admin']} />}>
                                    <Route path="/almacen/entradas" element={<EntradasAlmacen />} />
                                    <Route path="/almacen/salidas" element={<SalidasAlmacen />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['almacenero', 'produccion', 'coordinador', 'logistica']} />}>
                                    <Route path="/almacen/stock" element={<StockAlmacen />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['produccion', 'coordinador', 'logistica', 'almacenero']} />}>
                                    <Route path="/reportes/materiales" element={<ReporteMateriales />} />
                                    <Route path="/reportes/estadisticas" element={<EstadisticasMateriales />} />
                                </Route>

                                <Route element={<ProtectedRoute allowedRoles={['admin', 'coordinador', 'logistica']} />}>
                                    <Route path="/categorias" element={<GestionCategorias />} />
                                    <Route path="/equipos" element={<GestionEquipos />} />
                                    <Route path="/epps" element={<GestionEPPs />} />
                                    <Route path="/terceros" element={<GestionTerceros />} />
                                </Route>
                                <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                                    <Route path="/usuarios" element={<GestionUsuarios />} />
                                    <Route path="/obras" element={<GestionObras />} />
                                    <Route path="/frentes" element={<GestionFrentes />} />
                                    <Route path="/especialidades" element={<GestionEspecialidades />} />
                                </Route>
                            </Route>
                        </Route>
                    </Routes>
                </BrowserRouter>
            </NotificationProvider>
        </AuthProvider>
    </React.StrictMode>,
);
