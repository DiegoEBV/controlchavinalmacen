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
        // Buffer: Map<ID, Event> to deduplicate updates to the same record
        const buffer = new Map<string, RealtimeEvent>();

        let intervalId: NodeJS.Timeout;

        const processBuffer = () => {
            if (buffer.size === 0) return;

            const upserts = new Set<string>();
            const deletes = new Set<string>();

            buffer.forEach((payload, id) => {
                if (payload.eventType === 'DELETE') {
                    deletes.add(id);
                    // If it was previously marked for upsert in this batch, remove it since it's now deleted
                    upserts.delete(id);
                } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    upserts.add(id);
                    // If it was previously marked for delete (unlikely in same batch but possible), 
                    // remove from deletes since it's back
                    deletes.delete(id);
                }
            });

            if (upserts.size > 0 || deletes.size > 0) {
                onUpdates({ upserts, deletes });
            }

            buffer.clear();
        };

        // Start processing loop
        intervalId = setInterval(processBuffer, throttleMs);

        const channel = supabase
            .channel(`realtime:${table}`)
            .on(
                'postgres_changes',
                { event, schema, table, filter },
                (payload) => {
                    // Extract ID safely
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
    }, [table, schema, filter, event, throttleMs]); // Re-subscribe if options change
};
