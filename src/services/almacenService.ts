import { supabase } from '../config/supabaseClient';
import { Inventario } from '../types';

export const getInventario = async (obraId?: string) => {
    let query = supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(*, frente:frentes(nombre_frente)),
            equipo:equipos(*),
            epp:epps_c(*)
        `)
        .order('id', { ascending: true });

    if (obraId) {
        query = query.eq('obra_id', obraId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching inventario:', error);
        return [];
    }
    return data as Inventario[];
};

export const getInventarioById = async (id: string) => {
    const { data, error } = await supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(*, frente:frentes(nombre_frente))
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching inventario by id:', error);
        return null;
    }
    return data as Inventario;
};

export const registrarEntrada = async (
    materialId: string | null,
    cantidad: number,
    reqId: string,
    detReqId: string,
    docRef: string,
    obraId: string,
    extra?: { equipoId?: string; eppId?: string }
) => {
    const { error } = await supabase.rpc('registrar_entrada_almacen', {
        p_material_id: materialId || null,
        p_equipo_id: extra?.equipoId || null,
        p_epp_id: extra?.eppId || null,
        p_cantidad: cantidad,
        p_req_id: reqId,
        p_det_req_id: detReqId,
        p_doc_ref: docRef,
        p_obra_id: obraId
    });

    if (error) throw error;
};

export const registrarEntradaMasiva = async (
    items: any[],
    docRef: string,
    obraId: string
) => {
    const { data, error } = await supabase.rpc('registrar_entrada_masiva_v2', {
        p_items: items,
        p_doc_ref: docRef,
        p_obra_id: obraId
    });

    if (error) throw error;
    return data;
};

export const registrarSalida = async (
    tipoItem: 'MATERIAL' | 'EQUIPO' | 'EPP',
    itemId: string,
    cantidad: number,
    destino: string,
    solicitante: string,
    obraId: string,
    extraData: {
        terceroId?: string | null,
        encargadoId?: string | null,
        bloqueId?: string | null,
        numeroVale?: string
    }
) => {
    // Mapear el ID al campo correcto según el tipo
    const params = {
        p_material_id: tipoItem === 'MATERIAL' ? itemId : null,
        p_equipo_id: tipoItem === 'EQUIPO' ? itemId : null,
        p_epp_id: tipoItem === 'EPP' ? itemId : null,
        p_cantidad: cantidad,
        p_destino: destino,
        p_solicitante: solicitante,
        p_obra_id: obraId,
        p_tercero_id: extraData.terceroId || null,
        p_encargado_id: extraData.encargadoId || null,
        p_bloque_id: extraData.bloqueId || null,
        p_numero_vale: extraData.numeroVale || null
    };

    const { error } = await supabase.rpc('registrar_salida_almacen', params);

    if (error) throw error;
};

export const getMovimientos = async (obraId?: string) => {
    let query = supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, marca, codigo),
            epp:epps_c(descripcion, codigo, unidad),
            requerimiento:requerimientos(item_correlativo)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

    if (obraId) {
        // Movimientos no tiene obra_id directo en el esquema actual, se necesita verificar la migración
        // En la migración agregamos obra_id a movimientos_almacen
        query = query.eq('obra_id', obraId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching movimientos:', error);
        return [];
    }
    return data;
};

export const getMovimientoById = async (id: string) => {
    const { data, error } = await supabase
        .from('movimientos_almacen')
        .select(`
             *,
             material:materiales(descripcion, categoria, unidad),
             requerimiento:requerimientos(item_correlativo)
         `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching movimiento by id:', error);
        return null;
    }
    return data;
};
