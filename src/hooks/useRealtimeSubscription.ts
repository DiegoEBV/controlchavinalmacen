import { useEffect } from 'react';
import { supabase } from '../config/supabaseClient';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type RealtimeEvent = RealtimePostgresChangesPayload<{
    [key: string]: any;
}>;

interface UseRealtimeSubscriptionOptions {
    table: string;
    schema?: string;
    filter?: string;
    event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
    throttleMs?: number;
}

export const useRealtimeSubscription = (
    onUpdates: (payloads: { upserts: Set<string>; deletes: Set<string> }) => void,
    options: UseRealtimeSubscriptionOptions
) => {
    const { table, schema = 'public', filter, event = '*', throttleMs = 1000 } = options;

    useEffect(() => {
        // Bufer: Map<ID, Event> para deduplicar actualizaciones al mismo registro
        const buffer = new Map<string, RealtimeEvent>();

        let intervalId: NodeJS.Timeout;

        const processBuffer = () => {
            if (buffer.size === 0) return;

            const upserts = new Set<string>();
            const deletes = new Set<string>();

            buffer.forEach((payload, id) => {
                if (payload.eventType === 'DELETE') {
                    deletes.add(id);
                    // Si se marcó previamente para upsert en este lote, eliminarlo ya que ahora está eliminado
                    upserts.delete(id);
                } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    upserts.add(id);
                    // Si se marcó previamente para eliminar (poco probable en el mismo lote pero posible), 
                    // eliminar de eliminados ya que está de vuelta
                    deletes.delete(id);
                }
            });

            if (upserts.size > 0 || deletes.size > 0) {
                onUpdates({ upserts, deletes });
            }

            buffer.clear();
        };

        // Iniciar ciclo de procesamiento
        intervalId = setInterval(processBuffer, throttleMs);

        const channel = supabase
            .channel(`realtime:${table}`)
            .on(
                'postgres_changes',
                { event, schema, table, filter },
                (payload) => {
                    // Extraer ID de forma segura
                    const id = (payload.new as any)?.id || (payload.old as any)?.id;

                    if (id) {
                        buffer.set(id, payload as RealtimeEvent);
                    }
                }
            )
            .subscribe();

        return () => {
            clearInterval(intervalId);
            supabase.removeChannel(channel);
        };
    }, [table, schema, filter, event, throttleMs]); // Re-suscribirse si las opciones cambian
};
