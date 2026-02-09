import { supabase } from '../config/supabaseClient';
import { SolicitudCompra, OrdenCompra } from '../types';

// --- Solicitudes de Compra (SC) ---

export const getSolicitudesCompra = async (obraId?: string) => {
    let query = supabase
        .from('solicitudes_compra')
        .select(`
            *,
            requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante),
            detalles:detalles_sc(*, material:materiales(*))
        `)
        .order('created_at', { ascending: false });

    if (obraId) {
        query = query.eq('requerimiento.obra_id', obraId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error getting SC:', error);
        return [];
    }
    return data as SolicitudCompra[];
};

export const createSolicitudCompra = async (
    scData: Omit<SolicitudCompra, 'id' | 'created_at' | 'detalles' | 'requerimiento'>,
    items: any[]
) => {
    // 1. Create Header
    const { data: sc, error: scError } = await supabase
        .from('solicitudes_compra')
        .insert([scData])
        .select()
        .single();

    if (scError) throw scError;

    // 2. Create Details
    const detalles = items.map(item => ({
        sc_id: sc.id,
        material_id: item.material_id, // Must ensure mapped correctly from UI
        cantidad: item.cantidad,
        unidad: item.unidad,
        estado: 'Pendiente',
        comentario: item.comentario || ''
    }));

    const { error: detError } = await supabase
        .from('detalles_sc')
        .insert(detalles);

    if (detError) throw detError; // Consider rollback logic here in prod

    return sc;
};

// --- Ordenes de Compra (OC) ---

export const getOrdenesCompra = async (obraId?: string) => {
    let query = supabase
        .from('ordenes_compra')
        .select(`
            *,
            sc:solicitudes_compra!inner(
                *,
                requerimiento:requerimientos!inner(id, obra_id)
            ),
            detalles:detalles_oc(*, detalle_sc:detalles_sc(*, material:materiales(*)))
        `)
        .order('created_at', { ascending: false });

    if (obraId) {
        query = query.eq('sc.requerimiento.obra_id', obraId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error getting OC:', error);
        return [];
    }
    return data as OrdenCompra[];
};

export const createOrdenCompra = async (
    ocData: Omit<OrdenCompra, 'id' | 'created_at' | 'detalles'>,
    items: any[]
) => {
    // 1. Create Header
    const { data: oc, error: ocError } = await supabase
        .from('ordenes_compra')
        .insert([ocData])
        .select()
        .single();

    if (ocError) throw ocError;

    // 2. Create Details
    const detalles = items.map(item => ({
        oc_id: oc.id,
        detalle_sc_id: item.detalle_sc_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario || 0
    }));

    const { error: detError } = await supabase
        .from('detalles_oc')
        .insert(detalles);

    if (detError) throw detError;

    // 3. Update SC Item Status (Optional: Mark as 'En Orden' if fully ordered)
    // This logic can be complex depending on partial orders. For now, simple insert.

    return oc;
};
