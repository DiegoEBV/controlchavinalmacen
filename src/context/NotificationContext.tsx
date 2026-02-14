import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { useAuth } from './AuthContext';
import NotificationOverlay from '../components/NotificationOverlay';

interface NotificationContextType {
    lastNotification: any;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;

        console.log("Setting up notification subscription for user:", user.id);

        // 1. Obtener TODAS las notificaciones no leídas existentes
        const fetchUnread = async () => {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('read', false)
                .order('created_at', { ascending: false });

            if (data && data.length > 0) {
                setNotifications(data);
            }
        };
        fetchUnread();

        // 2. Suscribirse a nuevas notificaciones
        const channel = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('New notification received:', payload);
                    const newNotification = payload.new;
                    setNotifications(prev => [newNotification, ...prev]);

                    // System Notification Logic
                    if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
                        const title = 'Control Obras';
                        const body = newNotification.message || newNotification.content || 'Nueva notificación recibida';
                        const icon = '/icono.png';

                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.ready.then(registration => {
                                const options = {
                                    body,
                                    icon,
                                    badge: icon,
                                    vibrate: [200, 100, 200],
                                    tag: 'control-obras-notification'
                                };
                                registration.showNotification(title, options as any); // Cast to any to avoid strict type checks on vibrate
                            });
                        } else {
                            new Notification(title, { body, icon });
                        }
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Notification channel subscribed');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const handleDismiss = async () => {
        if (notifications.length === 0) return;

        const idsToDismiss = notifications.map(n => n.id);

        setNotifications([]); // Limpiar UI inmediatamente

        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', idsToDismiss);

        if (error) console.error("Error marking notifications as read:", error);
    };

    return (
        <NotificationContext.Provider value={{ lastNotification: notifications[0] }}>
            {children}
            {notifications.length > 0 && (
                <NotificationOverlay
                    show={notifications.length > 0}
                    notifications={notifications}
                    onDismiss={handleDismiss}
                />
            )}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
