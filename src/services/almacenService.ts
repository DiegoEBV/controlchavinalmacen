import { supabase } from '../config/supabaseClient';
import { Inventario } from '../types';

export const getInventario = async () => {
    const { data, error } = await supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(*)
        `)
        .order('id', { ascending: true });

    if (error) {
        console.error('Error fetching inventario:', error);
        return [];
    }
    return data as Inventario[];
};

export const registrarEntrada = async (
    materialId: string,
    cantidad: number,
    reqId: string,
    detReqId: string,
    docRef: string
) => {
    const { error } = await supabase.rpc('registrar_entrada_almacen', {
        p_material_id: materialId,
        p_cantidad: cantidad,
        p_req_id: reqId,
        p_det_req_id: detReqId,
        p_doc_ref: docRef
    });

    if (error) throw error;
};

export const registrarSalida = async (
    materialId: string,
    cantidad: number,
    destino: string
) => {
    const { error } = await supabase.rpc('registrar_salida_almacen', {
        p_material_id: materialId,
        p_cantidad: cantidad,
        p_destino: destino
    });

    if (error) throw error;
};

export const getMovimientos = async () => {
    const { data, error } = await supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            requerimiento:requerimientos(item_correlativo)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching movimientos:', error);
        return [];
    }
    return data;
};
