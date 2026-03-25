import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabaseClient';
import { Obra } from '../types';
import { FaBuilding, FaMapMarkerAlt, FaSignOutAlt, FaHardHat } from 'react-icons/fa';
import './ObraSelector.css';

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
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();

            let query = supabase.from('obras').select('*');

            if (profile?.role !== 'admin') {
                const { data: assignments } = await supabase
                    .from('usuario_obras')
                    .select('obra_id')
                    .eq('user_id', user?.id);

                const obraIds = assignments?.map(a => a.obra_id) || [];

                if (obraIds.length > 0) {
                    query = query.in('id', obraIds);
                } else {
                    setObras([]);
                    setLoading(false);
                    return;
                }
            }

            const { data, error } = await query.order('nombre_obra');

            if (error) throw error;
            setObras(data || []);

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
        navigate('/');
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="selector-container">
                <div className="spinner-border text-success" role="status">
                    <span className="visually-hidden">Cargando...</span>
                </div>
            </div>
        );
    }

    const projectColors = [
        '#1B9C85', // Default Green
        '#3B82F6', // Blue
        '#F59E0B', // Amber
        '#6366F1', // Indigo
        '#06B6D4', // Cyan
        '#8B5CF6', // Violet
        '#EC4899', // Pink
    ];

    return (
        <div className="selector-container">
            <div className="selector-bg-circle circle-top"></div>
            <div className="selector-bg-circle circle-bottom"></div>

            <div className="logout-container">
                <button onClick={handleLogout} className="logout-btn">
                    <FaSignOutAlt /> Cerrar Sesión
                </button>
            </div>

            <div className="selector-header animate-pop" style={{ animationDelay: '0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', color: 'var(--primary-green)', marginBottom: '20px' }}>
                    <FaHardHat size={32} />
                    <span style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'Outfit' }}>Control Obras</span>
                </div>
                <h1>Selecciona un Proyecto</h1>
                <p>Bienvenido de nuevo. Elige la obra en la que trabajarás hoy.</p>
            </div>

            <div className="projects-grid">
                {obras.length > 0 ? (
                    obras.map((obra, index) => {
                        const projectColor = projectColors[index % projectColors.length];
                        return (
                            <div 
                                key={obra.id} 
                                className="project-card animate-pop" 
                                style={{ 
                                    animationDelay: `${0.2 + (index * 0.1)}s`,
                                    '--hover-color': projectColor 
                                } as React.CSSProperties}
                                onClick={() => handleSelect(obra)}
                            >
                                <div className="project-icon-wrapper" style={{ 
                                    backgroundColor: `${projectColor}15`, 
                                    color: projectColor 
                                }}>
                                    <FaBuilding />
                                </div>
                                <h3 className="project-name">{obra.nombre_obra}</h3>
                                <div className="project-location">
                                    <FaMapMarkerAlt />
                                    <span>{obra.ubicacion || 'Sin ubicación'}</span>
                                </div>
                                <div className="access-btn" style={{ backgroundColor: projectColor }}>
                                    Acceder al Proyecto
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="project-card animate-pop" style={{ gridColumn: '1 / -1', maxWidth: '100%', cursor: 'default' }}>
                        <div className="project-icon-wrapper" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                           ⚠️
                        </div>
                        <h3 className="project-name">No tienes proyectos asignados</h3>
                        <p className="text-muted mb-4">Contacta al administrador para que te asigne a una obra.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObraSelector;
