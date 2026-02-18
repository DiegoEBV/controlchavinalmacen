import { supabase } from '../config/supabaseClient';
import { Frente, Bloque } from '../types';

export const getFrentes = async (obraId: string) => {
    const { data, error } = await supabase
        .from('frentes')
        .select('*')
        .eq('obra_id', obraId)
        .order('nombre_frente');

    if (error) {
        console.error('Error fetching frentes:', error);
        return [];
    }
    return data as Frente[];
};

export const createFrente = async (frente: Partial<Frente>) => {
    const { data, error } = await supabase
        .from('frentes')
        .insert([frente])
        .select()
        .single();

    if (error) throw error;
    return data as Frente;
};

export const updateFrente = async (id: string, updates: Partial<Frente>) => {
    const { data, error } = await supabase
        .from('frentes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as Frente;
};

export const deleteFrente = async (id: string) => {
    const { error } = await supabase
        .from('frentes')
        .delete()
        .eq('id', id);

    if (error) throw error;
};

// --- Bloques ---

export const getBloques = async (frenteId: string) => {
    const { data, error } = await supabase
        .from('bloques')
        .select('*')
        .eq('frente_id', frenteId)
        .order('nombre_bloque');

    if (error) {
        console.error('Error fetching bloques:', error);
        return [];
    }
    return data as Bloque[];
};

export const createBloque = async (bloque: Partial<Bloque>) => {
    const { data, error } = await supabase
        .from('bloques')
        .insert([bloque])
        .select()
        .single();

    if (error) throw error;
    return data as Bloque;
};

export const createBloquesBatch = async (bloques: Partial<Bloque>[]) => {
    const { data, error } = await supabase
        .from('bloques')
        .insert(bloques)
        .select();

    if (error) throw error;
    return data as Bloque[];
};

export const deleteBloque = async (id: string) => {
    const { error } = await supabase
        .from('bloques')
        .delete()
        .eq('id', id);

    if (error) throw error;
};
