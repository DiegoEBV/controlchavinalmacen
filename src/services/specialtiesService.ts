import { supabase } from '../config/supabaseClient';
import { Specialty } from '../types';

export const getSpecialties = async (activeOnly = true): Promise<Specialty[]> => {
    let query = supabase
        .from('specialties')
        .select('*')
        .order('name');

    if (activeOnly) {
        query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

export const createSpecialty = async (specialty: Partial<Specialty>): Promise<Specialty> => {
    const { data, error } = await supabase
        .from('specialties')
        .insert([specialty])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const updateSpecialty = async (id: string, updates: Partial<Specialty>): Promise<Specialty> => {
    const { data, error } = await supabase
        .from('specialties')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteSpecialty = async (id: string): Promise<void> => {
    // Eliminación lógica
    const { error } = await supabase
        .from('specialties')
        .update({ active: false })
        .eq('id', id);

    if (error) throw error;
};

export const getFrontSpecialties = async (frontId: string): Promise<Specialty[]> => {
    console.log("Fetching specialties for front:", frontId);

    // Primero, verificar que podemos obtener los elementos intermedios
    const { data: rawData, error: rawError } = await supabase
        .from('front_specialties')
        .select('*')
        .eq('front_id', frontId);
    console.log("Raw front_specialties:", rawData, "Error:", rawError);

    const { data, error } = await supabase
        .from('front_specialties')
        .select(`
            specialty_id,
            specialties (*)
        `)
        .eq('front_id', frontId);

    console.log("Joined data:", data, "Error:", error);

    if (error) {
        console.error("Error fetching front specialties:", error);
        throw error;
    }

    if (!data) return [];

    // Transformar y registrar
    const mapped = data.map((item: any) => item.specialties).filter((s: any) => s && s.active);
    console.log("Mapped specialties:", mapped);
    return mapped;
};

export const assignSpecialtiesToFront = async (frontId: string, specialtyIds: string[]): Promise<void> => {
    // 1. Obtener asignaciones existentes
    const { data: existing, error: fetchError } = await supabase
        .from('front_specialties')
        .select('specialty_id')
        .eq('front_id', frontId);

    if (fetchError) throw fetchError;

    const existingIds = existing.map((e: any) => e.specialty_id);

    // 2. Identify to add and remove
    const toAdd = specialtyIds.filter(id => !existingIds.includes(id));
    const toRemove = existingIds.filter(id => !specialtyIds.includes(id));

    // 3. Eliminar
    if (toRemove.length > 0) {
        const { error: removeError } = await supabase
            .from('front_specialties')
            .delete()
            .eq('front_id', frontId)
            .in('specialty_id', toRemove);

        if (removeError) throw removeError;
    }

    // 4. Agregar
    if (toAdd.length > 0) {
        const { error: addError } = await supabase
            .from('front_specialties')
            .insert(toAdd.map(id => ({ front_id: frontId, specialty_id: id })));

        if (addError) throw addError;
    }
};
