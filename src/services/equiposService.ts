import { supabase } from '../config/supabaseClient';
import { Equipo } from '../types';


export const getEquipos = async (obraId: string, page: number = 1, pageSize: number = 15, searchTerm: string = '') => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('equipos')
        .select('*', { count: 'exact' })
        .eq('obra_id', obraId)
        .order('nombre')
        .range(from, to);

    if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,codigo.ilike.%${searchTerm}%,marca.ilike.%${searchTerm}%`);
    }

    try {
        const { data, count, error } = await query;
        if (error) throw error;
        return { data: data as Equipo[], count: count || 0 };
    } catch (error) {
        console.error('Error fetching equipos:', error);
        return { data: [], count: 0 };
    }
};

export const createEquipo = async (equipo: Partial<Equipo>) => {
    const { data, error } = await supabase
        .from('equipos')
        .insert([equipo])
        .select()
        .single();

    if (error) {
        console.error('Error creating equipo:', error);
        throw error;
    }
    return data;
};

export const updateEquipo = async (id: string, updates: Partial<Equipo>) => {
    const { data, error } = await supabase
        .from('equipos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating equipo:', error);
        throw error;
    }
    return data;
};

export const deleteEquipo = async (id: string) => {
    const { error } = await supabase
        .from('equipos')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting equipo:', error);
        throw error;
    }
};
