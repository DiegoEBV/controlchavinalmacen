import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient'; // Ensure this path is correct based on project structure
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types/auth';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signIn: (email: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    isAdmin: boolean;
    hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for auth changes
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

    const signIn = async (email: string) => {
        // Simple magic link sign in for now, or password if preferred
        // For this example let's assume password login is handled in the Login component directly
        // exposing a generic helper if needed, but usually we call supabase.auth.signInWithPassword directly in the component
        // So we might not need to expose signIn here unless we want to wrap it.
        // Let's keep it simple and just expose state.
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
    };

    const isAdmin = profile?.role === 'admin';

    const hasRole = (roles: UserRole[]) => {
        if (!profile) return false;
        return roles.includes(profile.role) || profile.role === 'admin'; // Admin has access to everything usually? Or specific?
        // Let's assume Admin is superuser, but if not, logic can be adjusted.
        // For now: specific check.
    };

    const value = {
        session,
        user,
        profile,
        loading,
        signIn,
        signOut,
        isAdmin,
        hasRole
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
