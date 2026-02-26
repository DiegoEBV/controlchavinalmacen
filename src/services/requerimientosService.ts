import { supabase } from '../config/supabaseClient';
import { Requerimiento, DetalleRequerimiento } from '../types';

export const getRequerimientos = async (obraId?: string, excludeServices: boolean = false) => {
    try {
        let query = supabase
            .from('requerimientos')
            .select(`
                *,
                detalles:detalles_requerimiento${excludeServices ? '!inner' : ''}(*, epp:epps_c(*), equipo:equipos(*)),
                frente:frentes(*),
                specialty:specialties(*)
            `)
            .order('created_at', { ascending: false });

        if (obraId) {
            query = query.eq('obra_id', obraId);
        }

        if (excludeServices) {
            // Only fetch requirements that have at least one detail that is NOT a 'Servicio'
            query = query.neq('detalles.tipo', 'Servicio');
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
                 detalles:detalles_requerimiento(*, epp:epps_c(*), equipo:equipos(*)),
                 frente:frentes(*),
                 specialty:specialties(*)
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
): Promise<{ data: any; error: any }> => {
    // Función auxiliar para intentar la creación via RPC
    const attemptCreate = async () => {
        const detallesPayload = detalles.map(d => ({
            tipo: d.tipo,
            material_categoria: d.material_categoria,
            descripcion: d.descripcion,
            unidad: d.unidad,
            cantidad_solicitada: d.cantidad_solicitada,
            material_id: d.material_id || null, // New traceability field
            listinsumo_id: d.listinsumo_id || null, // New traceability field
            equipo_id: d.equipo_id || null, // Asegurar envío de IDs
            epp_id: d.epp_id || null
        }));

        const { data, error } = await supabase.rpc('crear_requerimiento_completo', {
            p_cabecera: requerimiento,
            p_detalles: detallesPayload
        });

        if (error) throw error;
        return data;
    };

    try {
        // Intento 1
        return { data: await attemptCreate(), error: null };
    } catch (error: any) {
        console.error('Intento 1 fallido:', error.message);

        // Verificar si es error de concurrencia (P0001 es raise exception, 23505 es unique violation)
        const isConcurrencyError =
            error.code === '23505' ||
            (error.message && error.message.includes('Error de concurrencia'));

        if (isConcurrencyError) {
            console.log('Reintentando creación de requerimiento por concurrencia...');
            try {
                // Esperar un momento aleatorio entre 100ms y 500ms
                await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
                // Intento 2
                return { data: await attemptCreate(), error: null };
            } catch (retryError: any) {
                console.error('Intento 2 fallido:', retryError.message);
                return { data: null, error: retryError.message || 'Error al crear requerimiento tras reintento.' };
            }
        }

        return { data: null, error: error.message };
    }
};

export const updateRequerimiento = async (
    id: string,
    header: any,
    items: any[]
) => {
    try {
        const { error } = await supabase.rpc('actualizar_requerimiento_completo', {
            p_req_id: id,
            p_cabecera: header,
            p_detalles: items
        });

        if (error) throw error;
        return { error: null };
    } catch (error: any) {
        console.error('Error updating requerimiento:', error);
        return { error: error.message };
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

// Local cache for materials catalog
let materialsCatalogCache: any[] | null = null;

export const getMaterialesCatalog = async (forceRefresh: boolean = false) => {
    if (materialsCatalogCache && !forceRefresh) {
        return materialsCatalogCache;
    }

    try {
        const { data, error } = await supabase
            .from('materiales')
            .select('id, categoria, descripcion, unidad, informacion_adicional')
            .order('categoria', { ascending: true })
            .order('descripcion', { ascending: true });

        if (error) throw error;
        materialsCatalogCache = data;
        return data || [];
    } catch (error) {
        console.error('Error fetching materials catalog:', error);
        return [];
    }
};

// CRUD de Materiales
export const getMateriales = async (page: number = 1, pageSize: number = 15, searchTerm: string = '') => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('materiales')
        .select('*', { count: 'exact' })
        .order('categoria', { ascending: true })
        .order('descripcion', { ascending: true })
        .range(from, to);

    if (searchTerm) {
        query = query.or(`descripcion.ilike.%${searchTerm}%,categoria.ilike.%${searchTerm}%`);
    }

    try {
        const { data, count, error } = await query;
        if (error) throw error;
        return { data: data as any[], count: count || 0 };
    } catch (error) {
        console.error('Error fetching materiales:', error);
        return { data: [], count: 0 };
    }
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

export const getBudgetedMaterials = async (frontId: string, specialtyId: string) => {
    try {
        // 1. Get FrontSpecialty ID
        const { data: fsData, error: fsError } = await supabase
            .from('front_specialties')
            .select('id')
            .eq('front_id', frontId)
            .eq('specialty_id', specialtyId)
            .single();

        if (fsError || !fsData) {
            console.warn("FrontSpecialty not found for", frontId, specialtyId);
            return [];
        }

        // 2. Fetch materials in budget
        const { data, error } = await supabase
            .from('listinsumo_especialidad')
            .select(`
                *,
                material:materiales(*)
            `)
            .eq('front_specialty_id', fsData.id);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Error fetching budgeted materials:", error);
        return [];
    }
};

export const getRequerimientosServicios = async (obraId?: string) => {
    try {
        let query = supabase
            .from('requerimientos')
            .select(`
                *,
                detalles:detalles_requerimiento!inner(*, epp:epps_c(*), equipo:equipos(*)),
                frente:frentes(*),
                specialty:specialties(*)
            `)
            .eq('detalles.tipo', 'Servicio')
            .order('created_at', { ascending: false });

        if (obraId) {
            query = query.eq('obra_id', obraId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return { data: data as Requerimiento[], error: null };
    } catch (error: any) {
        console.error('Error fetching requerimientos de servicios:', error);
        return { data: null, error: error.message };
    }
};

export const getReporteMaterialesData = async (filters: {
    obra_id: string;
    fechaInicio?: string;
    fechaFin?: string;
    tipo?: string;
    frente?: string;
    solicitante?: string;
    estado?: string;
}) => {
    try {
        // 1. Fetch details joined with requirement info
        let query = supabase
            .from('detalles_requerimiento')
            .select(`
                *,
                requerimiento:requerimientos!inner(
                    item_correlativo, 
                    solicitante, 
                    fecha_solicitud, 
                    frente_id, 
                    specialty_id,
                    especialidad,
                    frente:frentes(nombre_frente)
                )
            `)
            .eq('requerimiento.obra_id', filters.obra_id);

        if (filters.fechaInicio) query = query.gte('requerimiento.fecha_solicitud', filters.fechaInicio);
        if (filters.fechaFin) query = query.lte('requerimiento.fecha_solicitud', filters.fechaFin);
        if (filters.tipo) query = query.eq('tipo', filters.tipo);
        if (filters.frente) query = query.eq('requerimiento.frente.nombre_frente', filters.frente);
        if (filters.solicitante) query = query.eq('requerimiento.solicitante', filters.solicitante);
        if (filters.estado) query = query.eq('estado', filters.estado);

        const { data: details, error: detailsError } = await query;
        if (detailsError) throw detailsError;

        if (!details || details.length === 0) return [];

        // 2. Identify materials that need budget info
        // We only care about materials that have both material_id and are in a requirement with frente/specialty
        const materialItems = details.filter(d => d.tipo === 'Material' && d.material_id && d.requerimiento.frente_id && d.requerimiento.specialty_id);

        if (materialItems.length === 0) {
            return details.map(d => ({ ...d, stock_max: 0 }));
        }

        // 3. Batch fetch budgets
        // Collect unique pairs of (frente_id, specialty_id)

        // Fetch FrontSpecialty IDs for these pairs
        const { data: fsData, error: fsError } = await supabase
            .from('front_specialties')
            .select('id, front_id, specialty_id');

        if (fsError) throw fsError;

        const fsIdMap = new Map();
        fsData.forEach(fs => {
            fsIdMap.set(`${fs.front_id}|${fs.specialty_id}`, fs.id);
        });

        // Map details to their front_specialty_id
        const materialWithFsId = materialItems.map(d => ({
            ...d,
            fsId: fsIdMap.get(`${d.requerimiento.frente_id}|${d.requerimiento.specialty_id}`)
        })).filter(d => d.fsId);

        if (materialWithFsId.length === 0) {
            return details.map(d => ({ ...d, stock_max: 0 }));
        }

        // Fetch listinsumo_especialidad in bulk
        // Note: Supabase doesn't easily support multi-column "IN" filters in JS client, 
        // so we fetch all relevant for the front_specialties we found and filter on client if too many.
        // But usually, there aren't *that* many front_specialties in a single report.
        const uniqueFsIds = Array.from(new Set(materialWithFsId.map(d => d.fsId)));

        const { data: budgetData, error: budgetError } = await supabase
            .from('listinsumo_especialidad')
            .select('front_specialty_id, material_id, cantidad_presupuestada')
            .in('front_specialty_id', uniqueFsIds);

        if (budgetError) throw budgetError;

        const budgetMap = new Map();
        budgetData.forEach(b => {
            budgetMap.set(`${b.front_specialty_id}|${b.material_id}`, b.cantidad_presupuestada);
        });

        // 4. Merge
        return details.map(d => {
            let stock_max = 0;
            if (d.tipo === 'Material') {
                const fsId = fsIdMap.get(`${d.requerimiento.frente_id}|${d.requerimiento.specialty_id}`);
                stock_max = budgetMap.get(`${fsId}|${d.material_id}`) || 0;
            }
            return { ...d, stock_max };
        });

    } catch (error) {
        console.error('Error fetching report data:', error);
        throw error;
    }
};
