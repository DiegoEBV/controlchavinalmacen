import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { FaHardHat, FaEnvelope, FaLock, FaUserCircle } from 'react-icons/fa';
import './Login.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            navigate('/');
        } catch (error: any) {
            setError(error.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-form-side">
                <div className="login-form-wrapper fade-in">
                    <div className="login-logo">
                        <FaHardHat size={28} />
                        <span>Control de Inventario</span>
                    </div>

                    <div className="login-header">
                        <h1>¡Hola de nuevo!</h1>
                        <p>Gestiona tu inventario en obra con eficiencia y control</p>
                    </div>

                    {error && (
                        <div className="alert alert-danger" style={{
                            padding: '12px',
                            borderRadius: '12px',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            border: '1px solid #FEE2E2',
                            marginBottom: '20px',
                            fontSize: '14px'
                        }}>
                            {error}
                        </div>
                    )}

                    <form className="login-form" onSubmit={handleLogin}>
                        <div className="form-group">
                            <label htmlFor="email">Correo Electrónico</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="email"
                                    id="email"
                                    className="form-control"
                                    placeholder="ejemplo@correo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="password"
                                    id="password"
                                    className="form-control"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-options">
                            <label className="remember-me">
                                <input type="checkbox" /> Recordarme
                            </label>
                            {/* Forgot password removed as requested */}
                        </div>

                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? 'Cargando...' : 'Iniciar Sesión'}
                        </button>
                    </form>

                    {/* Registration footer removed as requested */}
                </div>
            </div>

            <div className="login-visual-side">
                <div className="decoration-circle circle-1"></div>
                <div className="decoration-circle circle-2"></div>

                <div className="visual-content">
                    <div className="mock-dashboard-card fade-in">
                        <div className="card-header">
                            <div className="card-user">
                                <FaUserCircle size={40} style={{ opacity: 0.5 }} />
                                <div className="user-info">
                                    <p className="name" style={{ margin: 0 }}>Residente de Obra</p>
                                    <p className="role" style={{ margin: 0 }}>Control de Inventario</p>
                                </div>
                            </div>
                        </div>

                        <div className="card-stat">
                            <p className="stat-label">Progreso General</p>
                            <p className="stat-value">68.4%</p>
                        </div>

                        <div className="progress-tracks">
                            <div className="track-item">
                                <div className="track-info">
                                    <span>Suministros</span>
                                    <span>80%</span>
                                </div>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: '80%' }}></div>
                                </div>
                            </div>
                            <div className="track-item">
                                <div className="track-info">
                                    <span>Movimientos</span>
                                    <span>45%</span>
                                </div>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: '45%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h2 className="visual-title">Optimiza tu gestión</h2>
                    <p className="visual-description">
                        Lleva el control total de tus insumos, equipos y movimientos en tiempo real desde cualquier lugar.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
