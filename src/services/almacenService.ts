import { supabase } from '../config/supabaseClient';
import { Inventario, MovimientoAlmacen } from '../types';

export const getInventario = async (obraId: string, page: number = 1, pageSize: number = 15, searchTerm: string = '') => {
    let query = supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(*),
            equipo:equipos(*),
            epp:epps_c(*)
        `, { count: 'exact' });

    if (obraId) {
        query = query.eq('obra_id', obraId);
    }

    // Filtro polimórfico corregido (solo si hay searchTerm)
    // Supabase no soporta .or transversal entre tablas relacionadas fácilmente con .ilike
    // Pero podemos intentar un filtro básico por descripción si se puede o hacerlo post-fetch
    // Para simplificar y ser eficientes, primero filtramos por obra e id

    // Aplicar paginación
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
        .order('id', { ascending: true })
        .range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching inventario:', error);
        return { data: [], count: 0 };
    }

    // Filtrado manual por searchTerm puesto que es polimórfico y complejo para el servidor en una sola query
    let filteredData = data as Inventario[];
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredData = filteredData.filter(item => {
            const matDesc = item.material?.descripcion?.toLowerCase() || '';
            const eqNombre = item.equipo?.nombre?.toLowerCase() || '';
            const eppDesc = item.epp?.descripcion?.toLowerCase() || '';
            const eqCode = item.equipo?.codigo?.toLowerCase() || '';
            const eppCode = item.epp?.codigo?.toLowerCase() || '';

            return matDesc.includes(term) || eqNombre.includes(term) || eppDesc.includes(term) || eqCode.includes(term) || eppCode.includes(term);
        });
    }

    return { data: filteredData, count: count || 0 };
};

export const getAllInventario = async (obraId: string) => {
    let allItems: Inventario[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('inventario_obra')
            .select(`
                *,
                material:materiales(*),
                equipo:equipos(*),
                epp:epps_c(*)
            `)
            .eq('obra_id', obraId)
            .order('id', { ascending: true })
            .range(from, from + step - 1);

        if (error) {
            console.error('Error fetching all inventario:', error);
            throw error;
        }

        if (!data || data.length === 0) break;

        allItems = allItems.concat(data as Inventario[]);
        if (data.length < step) break;
        from += step;
    }
    return allItems;
};

export const getInventarioById = async (id: string) => {
    const { data, error } = await supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(*)
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

export const registrarEntradaCajaChica = async (
    reqId: string,
    detReqId: string,
    materialId: string | null,
    equipoId: string | null,
    eppId: string | null,
    cantidad: number,
    factura: string,
    usuario: string,
    obraId: string,
    frenteId: string | null
) => {
    const { data, error } = await supabase.rpc('registrar_entrada_caja_chica', {
        p_requerimiento_id: reqId,
        p_detalle_req_id: detReqId,
        p_material_id: materialId || null,
        p_equipo_id: equipoId || null,
        p_epp_id: eppId || null,
        p_cantidad: cantidad,
        p_factura: factura,
        p_usuario: usuario,
        p_obra_id: obraId,
        p_frente_id: frenteId || null
    });

    if (error) throw error;
    return data;
};

export const registrarEntradaMasiva = async (
    items: any[],
    docRef: string,
    obraId: string,
    usuario?: string
) => {
    const { data, error } = await supabase.rpc('registrar_entrada_masiva_v2', {
        p_items: items,
        p_doc_ref: docRef,
        p_obra_id: obraId,
        p_solicitante: usuario || null
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

export const getMovimientos = async (obraId: string, page: number = 1, pageSize: number = 20, searchTerm: string = '', tipo?: 'ENTRADA' | 'SALIDA') => {
    let query = supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, marca, codigo),
            epp:epps_c(descripcion, codigo, unidad),
            requerimiento:requerimientos(item_correlativo),
            tercero:terceros(nombre_completo),
            encargado:profiles(nombre),
            bloque:bloques(nombre_bloque)
        `, { count: 'exact' })
        .eq('obra_id', obraId);

    if (tipo) {
        query = query.eq('tipo', tipo);
    }

    // Paginación
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
        .order('created_at', { ascending: false })
        .range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching movimientos:', error);
        return { data: [], count: 0 };
    }

    let filteredData = data || [];
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredData = filteredData.filter(h => {
            const mov = h as any;
            const desc = (mov.material?.descripcion || mov.equipo?.nombre || mov.epp?.descripcion || '').toLowerCase();
            const doc = (h.documento_referencia || '').toLowerCase();
            const req = mov.requerimiento ? String(mov.requerimiento.item_correlativo).toLowerCase() : '';
            const vale = (h.numero_vale || '').toLowerCase();
            const sol = (h.solicitante || '').toLowerCase();

            return desc.includes(term) || doc.includes(term) || req.includes(term) || vale.includes(term) || sol.includes(term);
        });
    }

    return { data: filteredData, count: count || 0 };
};

export const getAllMovimientos = async (obraId: string, tipo?: 'ENTRADA' | 'SALIDA') => {
    let allMoves: any[] = [];
    let from = 0;
    const step = 1000;

    while (true) {
        let query = supabase
            .from('movimientos_almacen')
            .select(`
                *,
                material:materiales(descripcion, categoria, unidad),
                equipo:equipos(nombre, marca, codigo),
                epp:epps_c(descripcion, codigo, unidad),
                requerimiento:requerimientos(item_correlativo),
                tercero:terceros(nombre_completo),
                encargado:profiles(nombre),
                bloque:bloques(nombre_bloque)
            `)
            .eq('obra_id', obraId)
            .order('created_at', { ascending: false })
            .range(from, from + step - 1);

        if (tipo) {
            query = query.eq('tipo', tipo);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error in getAllMovimientos:', error);
            break;
        }

        if (!data || data.length === 0) break;

        allMoves = [...allMoves, ...data];
        if (data.length < step) break;
        from += step;
    }

    return allMoves as MovimientoAlmacen[];
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
