
import { supabase } from '../config/supabaseClient';
import { Equipo, MovimientoEquipo } from '../types';

export const getEquipos = async (obraId: string) => {
    try {
        const { data, error } = await supabase
            .from('equipos')
            .select('*')
            .eq('obra_id', obraId)
            .order('nombre', { ascending: true });

        if (error) throw error;
        return { data: data as Equipo[], error: null };
    } catch (error: any) {
        console.error('Error fetching equipos:', error);
        return { data: null, error: error.message };
    }
};

export const createEquipo = async (equipo: Omit<Equipo, 'id' | 'created_at'>) => {
    try {
        const { data, error } = await supabase
            .from('equipos')
            .insert([equipo])
            .select()
            .single();

        if (error) throw error;
        return { data: data as Equipo, error: null };
    } catch (error: any) {
        return { data: null, error: error.message };
    }
};

export const updateEquipo = async (id: string, updates: Partial<Equipo>) => {
    try {
        const { data, error } = await supabase
            .from('equipos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { data: data as Equipo, error: null };
    } catch (error: any) {
        return { data: null, error: error.message };
    }
};

export const deleteEquipo = async (id: string) => {
    try {
        const { error } = await supabase
            .from('equipos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { error: null };
    } catch (error: any) {
        return { error: error.message };
    }
};

export const getMovimientosPendientes = async (obraId: string) => {
    try {
        // Obtenemos movimientos donde fecha_retorno_real es null
        // y filtramos por obra a través de la relación con equipo
        const { data, error } = await supabase
            .from('movimientos_equipos')
            .select(`
                *,
                equipo:equipos!inner(*),
                solicitante:solicitantes(*),
                encargado:encargado_id(*)
            `)
            .is('fecha_retorno_real', null)
            .eq('equipo.obra_id', obraId)
            .order('fecha_salida', { ascending: false });

        if (error) throw error;
        return { data: data as any[], error: null };
    } catch (error: any) {
        console.error('Error fetching movimientos pendientes:', error);
        return { data: null, error: error.message };
    }
};

export const registrarSalida = async (movimiento: Omit<MovimientoEquipo, 'id' | 'created_at' | 'fecha_retorno_real' | 'estado_retorno' | 'evidencia_url'>) => {
    try {
        const { data, error } = await supabase
            .from('movimientos_equipos')
            .insert([movimiento])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error: any) {
        return { data: null, error: error.message };
    }
};

export const registrarRetorno = async (movimientoId: string, datosRetorno: { fecha_retorno_real: string; estado_retorno: string; evidencia_url?: string }) => {
    try {
        const { data, error } = await supabase
            .from('movimientos_equipos')
            .update(datosRetorno)
            .eq('id', movimientoId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error: any) {
        return { data: null, error: error.message };
    }
};

export const getProductionUsers = async () => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, nombre')
            .eq('role', 'produccion')
            .order('nombre');

        if (error) throw error;
        return { data, error: null };
    } catch (error: any) {
        console.error('Error fetching production users:', error);
        return { data: [], error: error.message };
    }
};
