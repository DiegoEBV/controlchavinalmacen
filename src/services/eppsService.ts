import { supabase } from '../config/supabaseClient';
import { EppC } from '../types';


export const getEpps = async (includeArchived: boolean = false, page: number = 1, pageSize: number = 15, searchTerm: string = '') => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('epps_c')
        .select('*', { count: 'exact' })
        .order('descripcion')
        .range(from, to);

    if (!includeArchived) {
        query = query.eq('activo', true);
    }

    if (searchTerm) {
        query = query.or(`descripcion.ilike.%${searchTerm}%,codigo.ilike.%${searchTerm}%`);
    }

    try {
        const { data, count, error } = await query;
        if (error) throw error;
        return { data: data as EppC[], count: count || 0 };
    } catch (error) {
        console.error('Error fetching EPPS:', error);
        return { data: [], count: 0 };
    }
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

    // Obtener el código máximo para el prefijo dado
    // No podemos usar fácilmente funciones SQL aquí sin RPC, así que obtendremos todos los códigos (o solo el último si pudiéramos ordenar por subcadena)
    // Un mejor enfoque para la vista previa del frontend es simplemente obtener el conteo o similar, pero lo más preciso es consultar.

    // Confiemos en un enfoque simplista confiable: Obtener el último elemento creado de ese tipo.
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
