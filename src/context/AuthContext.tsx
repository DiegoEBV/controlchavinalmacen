import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient'; // Asegúrese de que esta ruta sea correcta según la estructura del proyecto
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types/auth';
import { Obra } from '../types';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signIn: (email: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    isAdmin: boolean;
    hasRole: (roles: UserRole[]) => boolean;
    selectObra: (obra: Obra | null) => void;
    selectedObra: Obra | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [selectedObra, setSelectedObra] = useState<Obra | null>(() => {
        try {
            const saved = localStorage.getItem('selectedObra');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null; // Safari modo privado bloquea localStorage
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Obtener sesión inicial
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Escuchar cambios de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
            } else {
                setProfile(data as UserProfile);
            }
        } catch (error) {
            console.error('Unexpected error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectObra = (obra: Obra | null) => {
        setSelectedObra(obra);
        try {
            if (obra) {
                localStorage.setItem('selectedObra', JSON.stringify(obra));
            } else {
                localStorage.removeItem('selectedObra');
            }
        } catch {
            // Safari modo privado: ignorar error de localStorage
        }
    };

    const signIn = async (email: string) => {
        console.log("Simulating sign in for:", email);
        // Inicio de sesión simple con enlace mágico por ahora, o contraseña si se prefiere
        // Para este ejemplo asumamos que el inicio de sesión con contraseña se maneja directamente en el componente Login
        // exponiendo un ayudante genérico si es necesario, pero usualmente llamamos a supabase.auth.signInWithPassword directamente en el componente
        // Así que tal vez no necesitemos exponer signIn aquí a menos que queramos envolverlo.
        // Mantengámoslo simple y solo expongamos el estado.
        return { error: null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setGenericStateToNull();
    };

    const setGenericStateToNull = () => {
        setSession(null);
        setUser(null);
        setProfile(null);
        selectObra(null);
    };

    const isAdmin = profile?.role === 'admin';

    const hasRole = (roles: UserRole[]) => {
        if (!profile) return false;
        return roles.includes(profile.role) || profile.role === 'admin'; // ¿El administrador tiene acceso a todo usualmente? ¿O específico?
        // Asumamos que el Admin es superusuario, pero si no, la lógica puede ajustarse.
        // Por ahora: verificación específica.
    };

    const value = {
        session,
        user,
        profile,
        loading,
        signIn,
        signOut,
        isAdmin,
        hasRole,
        selectObra,
        selectedObra
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
