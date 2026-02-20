import { supabase } from '../config/supabaseClient';
import { Tercero } from '../types';

export const getTerceros = async (obraId: string) => {
    const { data, error } = await supabase
        .from('terceros')
        .select('*')
        .eq('obra_id', obraId)
        .order('nombre_completo');

    if (error) throw error;
    return data as Tercero[];
};

export const createTercero = async (tercero: Omit<Tercero, 'id' | 'created_at'>) => {
    // Sanitize empty strings to null
    const sanitizedTercero = {
        ...tercero,
        ruc: tercero.ruc === '' ? null : tercero.ruc,
        dni: tercero.dni === '' ? null : tercero.dni,
        telefono: tercero.telefono === '' ? null : tercero.telefono,
        email: tercero.email === '' ? null : tercero.email,
        direccion: tercero.direccion === '' ? null : tercero.direccion,
    };

    const { data, error } = await supabase
        .from('terceros')
        .insert([sanitizedTercero])
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ya existe un tercero registrado con este RUC o DNI en esta obra.');
        }
        throw error;
    }
    return data as Tercero;
};

export const updateTercero = async (id: string, updates: Partial<Tercero>) => {
    // Sanitize empty strings to null
    const sanitizedUpdates = {
        ...updates,
        ...(updates.ruc !== undefined && { ruc: updates.ruc === '' ? null : updates.ruc }),
        ...(updates.dni !== undefined && { dni: updates.dni === '' ? null : updates.dni }),
        ...(updates.telefono !== undefined && { telefono: updates.telefono === '' ? null : updates.telefono }),
        ...(updates.email !== undefined && { email: updates.email === '' ? null : updates.email }),
        ...(updates.direccion !== undefined && { direccion: updates.direccion === '' ? null : updates.direccion }),
    };

    const { data, error } = await supabase
        .from('terceros')
        .update(sanitizedUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ya existe un tercero registrado con este RUC o DNI en esta obra.');
        }
        throw error;
    }
    return data as Tercero;
};

export const deleteTercero = async (id: string) => {
    const { error } = await supabase
        .from('terceros')
        .delete()
        .eq('id', id);

    if (error) throw error;
};
