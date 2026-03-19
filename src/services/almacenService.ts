import { supabase } from '../config/supabaseClient';
import { PedidoSalida } from '../types';

export const getInventario = async (obraId: string, page: number = 1, pageSize: number = 15, searchTerm: string = '') => {
    if (searchTerm) {
        // Find matching item IDs first to build a safe OR query
        const [mats, eqs, epps] = await Promise.all([
            supabase.from('materiales').select('id').ilike('descripcion', `%${searchTerm}%`),
            supabase.from('equipos').select('id').ilike('nombre', `%${searchTerm}%`),
            supabase.from('epps_c').select('id').ilike('descripcion', `%${searchTerm}%`)
        ]);

        const matIds = mats.data?.map(m => m.id).slice(0, 50) || [];
        const eqIds = eqs.data?.map(e => e.id).slice(0, 50) || [];
        const eppIds = epps.data?.map(e => e.id).slice(0, 50) || [];

        let orParts = [];
        if (matIds.length) orParts.push(`material_id.in.(${matIds.join(',')})`);
        if (eqIds.length) orParts.push(`equipo_id.in.(${eqIds.join(',')})`);
        if (eppIds.length) orParts.push(`epp_id.in.(${eppIds.join(',')})`);

        if (orParts.length === 0) {
            return { data: [], count: 0 }; // No items match the search text
        }

        const { data, error, count } = await supabase
            .from('inventario_obra')
            .select(`
                *,
                material:materiales(descripcion, categoria, unidad),
                equipo:equipos(nombre, codigo),
                epp:epps_c(descripcion, codigo, unidad)
            `, { count: 'exact' })
            .eq('obra_id', obraId)
            .or(orParts.join(','))
            .range((page - 1) * pageSize, page * pageSize - 1)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return { data: data || [], count: count || 0 };
    }

    const { data, error, count } = await supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, codigo),
            epp:epps_c(descripcion, codigo, unidad)
        `, { count: 'exact' })
        .eq('obra_id', obraId)
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], count: count || 0 };
};

export const getAllInventario = async (obraId: string) => {
    const { data, error } = await supabase
        .from('inventario_obra')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, codigo),
            epp:epps_c(descripcion, codigo, unidad)
        `)
        .eq('obra_id', obraId)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

export const getMovimientos = async (
    obraId: string,
    page: number = 1,
    pageSize: number = 15,
    searchTerm: string = '',
    tipo?: 'ENTRADA' | 'SALIDA'
) => {
    let query = supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, unidad),
            equipo:equipos(nombre, codigo, marca),
            epp:epps_c(descripcion, codigo, unidad),
            requerimiento:requerimientos(id, item_correlativo),
            tercero:terceros(nombre_completo),
            encargado:profiles!encargado_id(nombre),
            bloque:bloques(nombre_bloque)
        `, { count: 'exact' })
        .eq('obra_id', obraId);

    if (tipo) {
        query = query.eq('tipo', tipo);
    }

    if (searchTerm) {
        // Get matching item IDs for search first
        const [mats, eqs, epps] = await Promise.all([
            supabase.from('materiales').select('id').ilike('descripcion', `%${searchTerm}%`),
            supabase.from('equipos').select('id').ilike('nombre', `%${searchTerm}%`),
            supabase.from('epps_c').select('id').ilike('descripcion', `%${searchTerm}%`)
        ]);

        const matIds = mats.data?.map(m => m.id).slice(0, 50) || [];
        const eqIds = eqs.data?.map(e => e.id).slice(0, 50) || [];
        const eppIds = epps.data?.map(e => e.id).slice(0, 50) || [];

        let orParts = [];
        if (matIds.length) orParts.push(`material_id.in.(${matIds.join(',')})`);
        if (eqIds.length) orParts.push(`equipo_id.in.(${eqIds.join(',')})`);
        if (eppIds.length) orParts.push(`epp_id.in.(${eppIds.join(',')})`);

        // Always add base table columns that match
        orParts.push(`numero_vale.ilike.%${searchTerm}%`);
        orParts.push(`solicitante.ilike.%${searchTerm}%`);
        orParts.push(`destino_o_uso.ilike.%${searchTerm}%`);

        query = query.or(orParts.join(','));
    }

    const { data, error, count } = await query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return { data: data || [], count: count || 0 };
};

export const registrarEntrada = async (
    tipo: 'MATERIAL' | 'EQUIPO' | 'EPP',
    itemId: string,
    cantidad: number,
    guia: string,
    selectedObraId: string,
    requerimientoId?: string
) => {
    const { error } = await supabase.rpc('registrar_entrada_almacen', {
        p_tipo: tipo,
        p_item_id: itemId,
        p_cantidad: cantidad,
        p_guia: guia,
        p_obra_id: selectedObraId,
        p_req_id: requerimientoId || null
    });

    if (error) throw error;
};

export const registrarSalida = async (
    tipo: 'MATERIAL' | 'EQUIPO' | 'EPP',
    itemId: string,
    cantidad: number,
    destino: string,
    solicitante: string,
    selectedObraId: string,
    options?: {
        terceroId?: string;
        encargadoId?: string;
        bloqueId?: string;
        numeroVale?: string;
        solicitanteDni?: string;
    }
) => {
    const { error } = await supabase.rpc('registrar_salida_almacen', {
        p_tipo: tipo,
        p_item_id: itemId,
        p_cantidad: cantidad,
        p_destino: destino,
        p_solicitante: solicitante,
        p_obra_id: selectedObraId,
        p_tercero_id: options?.terceroId || null,
        p_encargado_id: options?.encargadoId || null,
        p_bloque_id: options?.bloqueId || null,
        p_vale: options?.numeroVale || null,
        p_solicitante_dni: options?.solicitanteDni || null
    });

    if (error) throw error;
};

export const getNextValeSalida = async (obraId: string) => {
    const { data, error } = await supabase.rpc('get_next_vale_salida', {
        p_obra_id: obraId
    });

    if (error) throw error;
    return data as string;
};

export const peekNextValeSalida = async (obraId: string) => {
    const { data, error } = await supabase.rpc('get_peek_vale_salida', {
        p_obra_id: obraId
    });

    if (error) throw error;
    return data as string;
};

export const getInventarioResumen = async (obraId: string) => {
    const { data, error } = await supabase.rpc('get_inventario_resumen', {
        p_obra_id: obraId
    });

    if (error) throw error;
    return data;
};

export const getMovimientosPorMes = async (obraId: string, tipo: 'ENTRADA' | 'SALIDA', mes: number, anio: number) => {
    const startDate = new Date(anio, mes - 1, 1).toISOString();
    const endDate = new Date(anio, mes, 0, 23, 59, 59).toISOString();

    const { data, error } = await supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, marca, codigo),
            epp:epps_c(descripcion, codigo, unidad),
            requerimiento:requerimientos(id, item_correlativo),
            tercero:terceros(nombre_completo),
            encargado:profiles(nombre),
            bloque:bloques(nombre_bloque)
        `)
        .eq('obra_id', obraId)
        .eq('tipo', tipo)
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return data || [];
};

// --- CIERRE MENSUAL ---

export const getCierresMensuales = async (obraId: string) => {
    const { data, error } = await supabase
        .from('cierres_mensuales')
        .select('*')
        .eq('obra_id', obraId)
        .order('anio', { ascending: false })
        .order('mes', { ascending: false });

    if (error) throw error;
    return data || [];
};

export const ejecutarCierreMensual = async (obraId: string, anio: number, mes: number, userId: string) => {
    const { data, error } = await supabase.rpc('ejecutar_cierre_mensual', {
        p_obra_id: obraId,
        p_anio: anio,
        p_mes: mes,
        p_usuario: userId
    });

    if (error) throw error;
    return data;
};

export const getCierreDetalle = async (cierreId: string) => {
    const { data, error } = await supabase
        .from('cierres_mensuales_detalle')
        .select(`
            *,
            material:materiales(descripcion, categoria, unidad),
            equipo:equipos(nombre, codigo),
            epp:epps_c(descripcion, codigo, unidad)
        `)
        .eq('cierre_id', cierreId)
        .order('subtotal', { ascending: false });

    if (error) {
        console.error('Error fetching cierre detalle:', error);
        return [];
    }
    return data || [];
};

// --- PEDIDOS DE SALIDA (PRODUCCIÓN) ---

export const getPedidosSalida = async (obraId: string, estado?: string) => {
    let query = supabase
        .from('pedidos_salida')
        .select(`
            *,
            encargado:profiles!pedidos_salida_encargado_id_fkey(nombre),
            bloque:bloques(nombre_bloque),
            tercero:terceros(nombre_completo),
            detalles:pedidos_salida_detalle(
                *,
                material:materiales(descripcion, unidad),
                equipo:equipos(nombre, codigo),
                epp:epps_c(descripcion, unidad)
            )
        `)
        .eq('obra_id', obraId);

    if (estado) {
        query = query.eq('estado', estado);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching pedidos salida:', error);
        return [];
    }
    return data as PedidoSalida[];
};

export const crearPedidoSalida = async (
    obraId: string,
    solicitanteDni: string,
    solicitanteNombre: string,
    encargadoId: string,
    destino: string,
    bloqueId: string,
    terceroId: string,
    items: {
        material_id?: string | null;
        equipo_id?: string | null;
        epp_id?: string | null;
        cantidad: number;
    }[]
): Promise<any> => {
    const { data, error } = await supabase.rpc('crear_pedido_salida', {
        p_obra_id: obraId,
        p_solicitante_dni: solicitanteDni,
        p_solicitante_nombre: solicitanteNombre,
        p_encargado_id: encargadoId,
        p_destino: destino,
        p_bloque_id: bloqueId,
        p_tercero_id: terceroId,
        p_items: items
    });

    if (error) throw error;
    return data;
};

export const aprobarPedidoSalida = async (
    pedidoId: string,
    itemsEntrega: { detalle_id: string; cantidad_entregada: number }[]
) => {
    const { error } = await supabase.rpc('aprobar_pedido_salida', {
        p_pedido_id: pedidoId,
        p_items_entrega: itemsEntrega
    });

    if (error) throw error;
};

export const actualizarPedidoSalida = async (
    pedidoId: string,
    destino: string,
    bloqueId: string,
    terceroId: string,
    encargadoId: string,
    solicitanteDni: string,
    solicitanteNombre: string,
    items: {
        material_id?: string | null;
        equipo_id?: string | null;
        epp_id?: string | null;
        cantidad: number;
    }[]
) => {
    const { error } = await supabase.rpc('actualizar_pedido_salida', {
        p_pedido_id: pedidoId,
        p_destino: destino,
        p_bloque_id: bloqueId,
        p_tercero_id: terceroId,
        p_encargado_id: encargadoId,
        p_solicitante_dni: solicitanteDni,
        p_solicitante_nombre: solicitanteNombre,
        p_items: items
    });

    if (error) throw error;
};

export const anularPedidoSalida = async (pedidoId: string) => {
    const { error } = await supabase.rpc('anular_pedido_salida', {
        p_pedido_id: pedidoId
    });

    if (error) throw error;
};

export const rechazarPedidoSalida = async (pedidoId: string) => {
    const { error } = await supabase
        .from('pedidos_salida')
        .update({ estado: 'Rechazado', updated_at: new Date().toISOString() })
        .eq('id', pedidoId);

    if (error) throw error;
};

export const getAllMovimientos = async (obraId: string, tipo?: 'ENTRADA' | 'SALIDA') => {
    let query = supabase
        .from('movimientos_almacen')
        .select(`
            *,
            material:materiales(descripcion, unidad),
            equipo:equipos(nombre, codigo, marca),
            epp:epps_c(descripcion, codigo, unidad),
            requerimiento:requerimientos(id, item_correlativo)
        `)
        .eq('obra_id', obraId);

    if (tipo) {
        query = query.eq('tipo', tipo);
    }

    const { data, error } = await query.order('fecha', { ascending: false });

    if (error) throw error;
    return data || [];
};

export const registrarEntradaMasiva = async (items: any[], docRef: string, obraId: string, solicitante?: string, ocId?: string) => {
    const { data, error } = await supabase.rpc('registrar_entrada_masiva_v2', {
        p_items: items,
        p_doc_ref: docRef,
        p_obra_id: obraId,
        p_solicitante: solicitante || null,
        p_oc_id: ocId || null
    });

    if (error) throw error;
    return data;
};

export const registrarEntradaCajaChica = async (
    reqId: string,
    detReqId: string,
    materialId: string | null,
    equipoId: string | null,
    eppId: string | null,
    cantidad: number,
    factura: string,
    solicitante: string,
    obraId: string,
    frenteId: string | null,
    precioUnitario: number | null
) => {
    const { data, error } = await supabase.rpc('registrar_entrada_caja_chica', {
        p_req_id: reqId,
        p_det_req_id: detReqId,
        p_material_id: materialId,
        p_equipo_id: equipoId,
        p_epp_id: eppId,
        p_cantidad: cantidad,
        p_factura: factura,
        p_solicitante: solicitante,
        p_obra_id: obraId,
        p_frente_id: frenteId,
        p_precio_unitario: precioUnitario
    });

    if (error) throw error;
    return data;
};

export const registrarEntradaDirectaV3 = async (items: any[], docRef: string, obraId: string) => {
    const { data, error } = await supabase.rpc('registrar_entrada_directa_v3', {
        p_items: items,
        p_doc_ref: docRef,
        p_obra_id: obraId
    });

    if (error) throw error;
    return data;
};

export const registrarAjusteInventario = async (
    obraId: string,
    materialId: string | null,
    equipoId: string | null,
    eppId: string | null,
    cantidadFisica: number,
    motivo: string,
    usuario: string
) => {
    const { data, error } = await supabase.rpc('registrar_ajuste_inventario', {
        p_obra_id: obraId,
        p_material_id: materialId,
        p_equipo_id: equipoId,
        p_epp_id: eppId,
        p_cantidad_fisica: cantidadFisica,
        p_motivo: motivo,
        p_usuario: usuario
    });

    if (error) throw error;
    return data;
};

export const registrarDevolucionHistorial = async (
    obraId: string,
    usuarioId: string,
    tipoSalida: 'MATERIAL' | 'EQUIPO' | 'EPP',
    itemSalidaId: string,
    cantidadSalida: number,
    motivo: string,
    esCambio: boolean,
    idSalidaRef: string | null,
    tipoEntrada?: 'MATERIAL' | 'EQUIPO' | 'EPP',
    itemEntradaId?: string,
    cantidadEntrada?: number,
    idEntradaRef?: string | null
) => {
    const devolucionData: any = {
        obra_id: obraId,
        usuario_id: usuarioId,
        tipo_salida: tipoSalida,
        cantidad_salida: cantidadSalida,
        motivo: motivo,
        es_cambio: esCambio,
        id_salida_ref: idSalidaRef,
    };

    if (tipoSalida === 'MATERIAL') devolucionData.material_salida_id = itemSalidaId;
    else if (tipoSalida === 'EQUIPO') devolucionData.equipo_salida_id = itemSalidaId;
    else if (tipoSalida === 'EPP') devolucionData.epp_salida_id = itemSalidaId;

    if (esCambio) {
        devolucionData.tipo_entrada = tipoEntrada;
        devolucionData.cantidad_entrada = cantidadEntrada;
        devolucionData.id_entrada_ref = idEntradaRef;

        if (tipoEntrada === 'MATERIAL') devolucionData.material_entrada_id = itemEntradaId;
        else if (tipoEntrada === 'EQUIPO') devolucionData.equipo_entrada_id = itemEntradaId;
        else if (tipoEntrada === 'EPP') devolucionData.epp_entrada_id = itemEntradaId;
    }

    const { data, error } = await supabase
        .from('devoluciones')
        .insert([devolucionData])
        .select()
        .single();

    if (error) throw error;
    return data;
};
