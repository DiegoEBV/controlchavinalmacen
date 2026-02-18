import { supabase } from '../config/supabaseClient';
import { Equipo } from '../types';

export const getEquipos = async (obraId: string) => {
    const { data, error } = await supabase
        .from('equipos')
        .select('*')
        .eq('obra_id', obraId)
        .order('nombre');

    if (error) {
        console.error('Error fetching equipos:', error);
        return [];
    }
    return data as Equipo[];
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
