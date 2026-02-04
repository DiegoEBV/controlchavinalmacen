import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import GestionRequerimientos from './pages/GestionRequerimientos';
import GestionMateriales from './pages/GestionMateriales';
import EntradasAlmacen from './pages/EntradasAlmacen';
import SalidasAlmacen from './pages/SalidasAlmacen';
import StockAlmacen from './pages/StockAlmacen';
import GestionSolicitantes from './pages/GestionSolicitantes';
import GestionCategorias from './pages/GestionCategorias';
import GestionSolicitudes from './pages/GestionSolicitudes';
import GestionOrdenes from './pages/GestionOrdenes';
import Layout from './components/Layout';
import { Outlet } from 'react-router-dom';

const LayoutWrapper = () => {
    return (
        <Layout>
            <Outlet />
        </Layout>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route element={<LayoutWrapper />}>
                    <Route path="/" element={<Navigate to="/requerimientos" />} />
                    <Route path="/requerimientos" element={<GestionRequerimientos />} />
                    <Route path="/materiales" element={<GestionMateriales />} />
                    <Route path="/almacen/entradas" element={<EntradasAlmacen />} />
                    <Route path="/almacen/salidas" element={<SalidasAlmacen />} />
                    <Route path="/almacen/stock" element={<StockAlmacen />} />
                    <Route path="/solicitudes" element={<GestionSolicitudes />} />
                    <Route path="/ordenes" element={<GestionOrdenes />} />
                    <Route path="/solicitantes" element={<GestionSolicitantes />} />
                    <Route path="/categorias" element={<GestionCategorias />} />
                </Route>
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
);
