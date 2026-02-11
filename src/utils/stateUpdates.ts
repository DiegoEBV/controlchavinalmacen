/**
 * Ayudante para actualizar una lista de ítems basado en cambios en tiempo real.
 * 
 * @param currentList El array de estado actual
 * @param newItems Array de ítems obtenidos de la BD (Upserts)
 * @param deletedIds Conjunto de IDs que fueron eliminados
 * @param idField El campo a usar como ID (por defecto: 'id')
 * @returns Un nuevo array con las actualizaciones aplicadas
 */
export const mergeUpdates = <T>(
    currentList: T[],
    newItems: T[],
    deletedIds: Set<string>,
    idField: keyof T = 'id' as keyof T,
    sortFn?: (a: T, b: T) => number
): T[] => {
    // 1. Convertir lista actual a Mapa para acceso O(1) y deduplicación
    // Map preserva el orden de inserción del primer set() para una clave
    const map = new Map<string, T>();

    // Inicializar con ítems actuales (excluyendo los eliminados)
    currentList.forEach(item => {
        const id = String(item[idField]);
        if (!deletedIds.has(id)) {
            map.set(id, item);
        }
    });

    // 2. Fusionar upserts (actualiza existentes o agrega nuevos)
    newItems.forEach(item => {
        const id = String(item[idField]);
        map.set(id, item);
    });

    const updatedList = Array.from(map.values());

    // 3. Ordenar si se proporciona
    if (sortFn) {
        return updatedList.sort(sortFn);
    }

    // Si no se proporciona orden y se agregaron nuevos ítems, están al final.
    // Idealmente, los consumidores deberían proporcionar una sortFn si el orden importa.
    return updatedList;
};
