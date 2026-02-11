import { supabase } from '../config/supabaseClient';
import { Requerimiento, DetalleRequerimiento } from '../types';

export const getRequerimientos = async (obraId?: string) => {
    try {
        let query = supabase
            .from('requerimientos')
            .select(`
                *,
                detalles:detalles_requerimiento(*),
                frente:frentes(*)
            `)
            .order('created_at', { ascending: false });

        if (obraId) {
            query = query.eq('obra_id', obraId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return { data: data as Requerimiento[], error: null };
    } catch (error: any) {
        console.error('Error fetching requerimientos:', error);
        return { data: null, error: error.message };
    }
};

export const getRequerimientoById = async (id: string) => {
    try {
        const { data, error } = await supabase
            .from('requerimientos')
            .select(`
                 *,
                 detalles:detalles_requerimiento(*),
                 frente:frentes(*)
             `)
            .eq('id', id)
            .single();

        if (error) throw error;
        return { data: data as Requerimiento, error: null };
    } catch (error: any) {
        console.error('Error fetching requerimiento by id:', error);
        return { data: null, error: error.message };
    }
};

export const createRequerimiento = async (
    requerimiento: Omit<Requerimiento, 'id' | 'created_at' | 'item_correlativo' | 'detalles'>,
    detalles: Omit<DetalleRequerimiento, 'id' | 'requerimiento_id' | 'created_at' | 'cantidad_atendida' | 'estado'>[]
) => {
    try {
        // 1. Crear Cabecera
        const { data: reqData, error: reqError } = await supabase
            .from('requerimientos')
            .insert([requerimiento])
            .select()
            .single();

        if (reqError) throw reqError;

        if (!reqData) throw new Error("No data returned from create requerimiento");

        // 2. Preparar Detalles
        const detallesConId = detalles.map(d => ({
            ...d,
            requerimiento_id: reqData.id,
            cantidad_atendida: 0,
            estado: 'Pendiente'
        }));

        const { error: detError } = await supabase
            .from('detalles_requerimiento')
            .insert(detallesConId);

        if (detError) {
            console.error("Error inserting details", detError);
            // Revertir cabecera si es posible o limpieza manual
            await supabase.from('requerimientos').delete().eq('id', reqData.id);
            throw detError;
        }

        return { data: reqData, error: null };
    } catch (error: any) {
        console.error('Error creating requerimiento:', error);
        return { data: null, error: error.message };
    }
};

export const updateDetalleLogistica = async (
    detalleId: string,
    updates: Partial<DetalleRequerimiento>
) => {
    try {
        // Calcular automáticamente el estado lógico
        if (updates.cantidad_atendida !== undefined && !updates.estado) {
            const { data: currentItem, error: fetchError } = await supabase
                .from('detalles_requerimiento')
                .select('cantidad_solicitada')
                .eq('id', detalleId)
                .single();

            if (fetchError) throw fetchError;

            const solicitada = Number(currentItem.cantidad_solicitada);
            const atendida = Number(updates.cantidad_atendida);

            if (atendida <= 0) updates.estado = 'Pendiente';
            else if (atendida < solicitada) updates.estado = 'Parcial';
            else updates.estado = 'Atendido';
        }

        const { data, error } = await supabase
            .from('detalles_requerimiento')
            .update(updates)
            .eq('id', detalleId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error: any) {
        return { data: null, error: error.message };
    }
};

export const getObras = async () => {
    const { data } = await supabase.from('obras').select('*').order('nombre_obra', { ascending: true });
    return data || [];
};

export const getUserAssignedObras = async (userId: string) => {
    // 1. Obtener IDs de la tabla de unión
    const { data: relations, error: relError } = await supabase
        .from('usuario_obras')
        .select('obra_id')
        .eq('user_id', userId);

    if (relError) {
        console.error('Error fetching user obras:', relError);
        return [];
    }

    if (!relations || relations.length === 0) return [];

    const obraIds = relations.map(r => r.obra_id);

    // 2. Obtener detalles de la Obra
    const { data, error } = await supabase
        .from('obras')
        .select('*')
        .in('id', obraIds)
        .order('nombre_obra', { ascending: true });

    if (error) {
        console.error('Error fetching obras details:', error);
        return [];
    }

    return data || [];
};

// CRUD de Materiales
export const getMateriales = async () => {
    const { data, error } = await supabase
        .from('materiales')
        .select('*')
        .order('categoria', { ascending: true })
        .order('descripcion', { ascending: true });

    if (error) {
        console.error('Error fetching materiales:', error);
        return [];
    }
    return data;
};

export const updateMaterial = async (id: string, updates: any) => {
    const { data, error } = await supabase
        .from('materiales')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const createMaterial = async (material: any) => {
    const { data, error } = await supabase
        .from('materiales')
        .insert([material])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteMaterial = async (id: string) => {
    const { error } = await supabase
        .from('materiales')
        .delete()
        .eq('id', id);
    if (error) throw error;
};
// CRUD de Solicitantes
export const getSolicitantes = async () => {
    const { data, error } = await supabase
        .from('solicitantes')
        .select('*')
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error fetching solicitantes:', error);
        return [];
    }
    return data;
};

export const createSolicitante = async (item: any) => {
    const { data, error } = await supabase
        .from('solicitantes')
        .insert([item])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteSolicitante = async (id: string) => {
    const { error } = await supabase
        .from('solicitantes')
        .delete()
        .eq('id', id);
    if (error) throw error;
};

// CRUD de Categorías
export const getCategorias = async () => {
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nombre', { ascending: true });

    if (error) {
        console.error('Error fetching categorias:', error);
        return [];
    }
    return data;
};

export const createCategoria = async (item: any) => {
    const { data, error } = await supabase
        .from('categorias')
        .insert([item])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteCategoria = async (id: string) => {
    const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', id);
    if (error) throw error;
};
