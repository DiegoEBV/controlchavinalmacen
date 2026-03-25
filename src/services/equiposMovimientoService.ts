import { supabase } from '../config/supabaseClient';

export interface EquipoEstado {
    id: string;
    obra_id: string;
    nombre: string;
    codigo: string;
    marca: string;
    estado: string;
    fecha_adquisicion: string;
    movimiento_id: string | null;
    encargado_id: string | null;
    encargado_nombre: string | null;
    encargado_role: string | null;
    bloque_destino: string | null;
    fecha_salida: string | null;
    fecha_retorno_estimada: string | null;
    color_alerta: 'VERDE' | 'AZUL' | 'AMARILLO' | 'ROJO' | 'GRIS';
}

export const getEquiposByObra = async (obraId: string): Promise<EquipoEstado[]> => {
    try {
        const { data, error } = await supabase
            .from('vw_equipos_estado')
            .select('*')
            .eq('obra_id', obraId)
            .order('codigo', { ascending: true });

        if (error) throw error;
        return data as EquipoEstado[];
    } catch (error) {
        console.error('Error fetching equipos estado:', error);
        return [];
    }
};

export const registrarMovimientoSalida = async (
    equipoId: string,
    usuarioAutorizaId: string,
    bloqueDestino: string,
    fechaRetornoEstimada: string, // ISO String
    nombreSolicitante: string,
    encargadoId: string
) => {
    try {
        const { data, error } = await supabase.rpc('registrar_salida_equipo', {
            p_equipo_id: equipoId,
            p_usuario_autoriza_id: usuarioAutorizaId,
            p_bloque_destino: bloqueDestino,
            p_fecha_retorno_estimada: fechaRetornoEstimada,
            p_nombre_solicitante: nombreSolicitante,
            p_encargado_id: encargadoId
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error in registrarMovimientoSalida:', error);
        return { success: false, error: error.message };
    }
};

export const registrarMovimientoRetorno = async (
    movimientoId: string,
    estadoRetorno: string
) => {
    try {
        const { data, error } = await supabase.rpc('registrar_retorno_equipo', {
            p_movimiento_id: movimientoId,
            p_estado_retorno: estadoRetorno
        });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error in registrarMovimientoRetorno:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Registra un equipo nuevo en la tabla principal de unidades de equipo
 */
export const registrarCargaInicialEquipo = async (
    obraId: string,
    nombre: string,
    codigo: string,
    marca: string
) => {
    try {
        // Validate unique code for the obra
        const { data: existing } = await supabase
            .from('equipos')
            .select('id')
            .eq('obra_id', obraId)
            .ilike('codigo', codigo)
            .single();

        if (existing) {
            return { success: false, error: `El código ${codigo} ya está registrado en esta obra.` };
        }

        const { data, error } = await supabase
            .from('equipos')
            .insert({
                obra_id: obraId,
                nombre,
                codigo: codigo.toUpperCase(),
                marca,
                estado: 'Operativo',
                es_unidad_fisica: true
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error in registrarCargaInicialEquipo:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Changes equipment status directly (for maintenance/repair flows)
 */
export const updateEquipoStatus = async (equipoId: string, nuevoEstado: string) => {
    try {
        const { data, error } = await supabase
            .from('equipos')
            .update({ estado: nuevoEstado })
            .eq('id', equipoId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};
