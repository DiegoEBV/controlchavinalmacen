import { supabase } from '../config/supabaseClient';
import { EppC } from '../types';

export const getEpps = async (includeArchived: boolean = false): Promise<EppC[]> => {
    let query = supabase
        .from('epps_c')
        .select('*')
        .order('descripcion');

    if (!includeArchived) {
        query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

export const createEpp = async (epp: Omit<EppC, 'id' | 'created_at'>): Promise<EppC> => {
    const { data, error } = await supabase
        .from('epps_c')
        .insert([epp])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const updateEpp = async (id: string, updates: Partial<EppC>): Promise<EppC> => {
    const { data, error } = await supabase
        .from('epps_c')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const toggleEppStatus = async (id: string, currentStatus: boolean): Promise<void> => {
    const { error } = await supabase
        .from('epps_c')
        .update({ activo: !currentStatus })
        .eq('id', id);

    if (error) throw error;
};


export const getNextEppCode = async (tipo: 'Personal' | 'Colectivo'): Promise<string> => {
    const prefix = tipo === 'Personal' ? 'EPP-' : 'EPC-';

    // Fetch the max code for the given prefix
    // We can't easily use SQL functions here without RPC, so we'll fetch all codes (or just the latest if we could sort by substring)
    // A better approach for the frontend preview is to just get the count or similar, but the most accurate is to Query.

    // Let's rely on a reliable simplistic approach: Get the last created item of that type.
    const { data, error } = await supabase
        .from('epps_c')
        .select('codigo')
        .eq('tipo', tipo)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Error fetching next code:", error);
        return prefix + '????';
    }

    if (data && data.length > 0 && data[0].codigo) {
        const lastCode = data[0].codigo;
        const numberPart = parseInt(lastCode.split('-')[1]);
        if (!isNaN(numberPart)) {
            return prefix + String(numberPart + 1).padStart(4, '0');
        }
    }

    return prefix + '0001';
};

export const createEppsBatch = async (epps: Omit<EppC, 'id' | 'created_at'>[]): Promise<EppC[]> => {
    const { data, error } = await supabase
        .from('epps_c')
        .insert(epps)
        .select();

    if (error) throw error;
    return data || [];
};
