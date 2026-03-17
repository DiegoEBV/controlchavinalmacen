import { supabase } from '../config/supabaseClient';
import { SolicitudCompra, OrdenCompra } from '../types';

// --- Solicitudes de Compra (SC) ---

export const getSolicitudesCompra = async (obraId?: string) => {
    let query = supabase
        .from('solicitudes_compra')
        .select(`
            *,
            requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante, bloque, frente:frentes(nombre_frente)),
            detalles:detalles_sc(*, material:materiales(*), equipo:equipos(*), epp:epps_c(*))
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

export const getSolicitudCompraById = async (id: string) => {
    const { data, error } = await supabase
        .from('solicitudes_compra')
        .select(`
             *,
             requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante, frente:frentes(*)),
             detalles:detalles_sc(*, material:materiales(*), equipo:equipos(*), epp:epps_c(*))
         `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error getting SC by id:', error);
        return null;
    }
    return data as SolicitudCompra;
};

export const createSolicitudCompra = async (
    scData: Omit<SolicitudCompra, 'id' | 'created_at' | 'detalles' | 'requerimiento'>,
    items: any[]
) => {
    // 1. Crear Cabecera
    const { data: sc, error: scError } = await supabase
        .from('solicitudes_compra')
        .insert([scData])
        .select()
        .single();

    if (scError) throw scError;

    // 2. Crear Detalles
    const detalles = items.map(item => ({
        sc_id: sc.id,
        detalle_requerimiento_id: item.detalle_requerimiento_id, // Asegurar que pasamos el ID del requerimiento
        material_id: item.material_id,
        equipo_id: item.equipo_id,
        epp_id: item.epp_id,
        cantidad: item.cantidad,
        unidad: item.unidad,
        estado: 'Pendiente', // Ahora inicia Pendiente hasta que entre por almacén
        comentario: item.comentario || '',
        enviar_a_oc: item.enviar_a_oc !== false, // Por defecto true
        procesado_directo: item.enviar_a_oc === false
    }));

    const { error: detError } = await supabase
        .from('detalles_sc')
        .insert(detalles);

    if (detError) throw detError;

    // 3. Procesar Automatización Híbrida (Skip OC)
    try {
        const { error: rpcError } = await supabase.rpc('procesar_sc_hibrida', { p_sc_id: sc.id });
        if (rpcError) {
            console.error('Error in procesar_sc_hibrida RPC:', rpcError);
            // No lanzamos error fatal para que el usuario sepa que la SC se creó
            alert("La SC se creó, pero hubo un error procesando la Entrega Directa. Por favor verifique el estado del requerimiento.");
        }
    } catch (e) {
        console.error('Exception calling procesar_sc_hibrida:', e);
    }

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
                requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante, frente:frentes(nombre_frente))
            ),
            detalles:detalles_oc(*, detalle_sc:detalles_sc(*, material:materiales(*), equipo:equipos(*), epp:epps_c(*)))
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

    // El inner join puede duplicar la cabecera si hay múltiples detalles. 
    // Supabase JS 'select' con relaciones anidadas suele manejar esto, pero nos aseguramos de que los datos sean únicos por ID.
    const uniqueOCs = Array.from(new Map(data.map(item => [item.id, item])).values());
    
    return uniqueOCs as OrdenCompra[];
};

export const createOrdenCompra = async (
    ocData: Omit<OrdenCompra, 'id' | 'created_at' | 'detalles'>,
    items: any[]
) => {
    // 1. Crear Cabecera
    const { data: oc, error: ocError } = await supabase
        .from('ordenes_compra')
        .insert([{
            ...ocData,
            n_factura: ocData.n_factura || null,
            fecha_vencimiento: ocData.fecha_vencimiento || null
        }])
        .select()
        .single();

    if (ocError) throw ocError;

    // 2. Crear Detalles
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

    // 3. Actualizar estado del ítem de SC
    const idsDetallesSC = items.map(item => item.detalle_sc_id);
    const { error: scDetError } = await supabase
        .from('detalles_sc')
        .update({ estado: 'En Orden' })
        .in('id', idsDetallesSC);

    if (scDetError) {
        console.error('Error updating detalles_sc status:', scDetError);
    }

    return oc;
};

export const updateOrdenCompra = async (
    ocId: string,
    ocData: any,
    items: any[]
) => {
    const { error } = await supabase.rpc('update_orden_compra', {
        p_oc_id: ocId,
        p_oc_data: {
            ...ocData,
            n_factura: ocData.n_factura || null,
            fecha_vencimiento: ocData.fecha_vencimiento || null
        },
        p_items: items.map(item => ({
            detalle_sc_id: item.detalle_sc_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario || 0
        }))
    });

    if (error) throw error;
};

export const getOrdenCompraById = async (id: string) => {
    const { data, error } = await supabase
        .from('ordenes_compra')
        .select(`
            *,
            sc:solicitudes_compra(
                *,
                requerimiento:requerimientos(id, obra_id, item_correlativo, solicitante, frente:frentes(nombre_frente))
            ),
            detalles:detalles_oc(*, detalle_sc:detalles_sc(*, material:materiales(*), equipo:equipos(*), epp:epps_c(*)))
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error getting OC by id:', error);
        return null;
    }
    return data as OrdenCompra;
};

export const getOrdenesCompraExport = async (obraId: string, fechaInicial: string, fechaFinal: string) => {
    let query = supabase
        .from('ordenes_compra')
        .select(`
            *,
            sc:solicitudes_compra!inner(
                *,
                requerimiento:requerimientos!inner(id, obra_id, item_correlativo, solicitante, frente:frentes(nombre_frente))
            ),
            detalles:detalles_oc(*, detalle_sc:detalles_sc(*, material:materiales(*), equipo:equipos(*), epp:epps_c(*)))
        `)
        .eq('sc.requerimiento.obra_id', obraId)
        .gte('fecha_oc', fechaInicial)
        .lte('fecha_oc', fechaFinal)
        .order('fecha_oc', { ascending: true }); // Ordenar cronológicamente

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching OCs for export:', error);
        throw error;
    }

    const uniqueOCs = Array.from(new Map(data.map(item => [item.id, item])).values());
    return uniqueOCs as OrdenCompra[];
};
