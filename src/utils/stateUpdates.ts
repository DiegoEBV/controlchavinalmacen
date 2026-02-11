/**
 * Helper to update a list of items based on realtime changes.
 * 
 * @param currentList The current state array
 * @param newItems Array of items fetched from DB (Upserts)
 * @param deletedIds Set of IDs that were deleted
 * @param idField The field to use as ID (default: 'id')
 * @returns A new array with updates applied
 */
export const mergeUpdates = <T>(
    currentList: T[],
    newItems: T[],
    deletedIds: Set<string>,
    idField: keyof T = 'id' as keyof T,
    sortFn?: (a: T, b: T) => number
): T[] => {
    // 1. Convert current list to Map for O(1) access and deduplication
    // Map preserves insertion order of the first set() for a key
    const map = new Map<string, T>();

    // Initialize with current items (excluding deleted ones)
    currentList.forEach(item => {
        const id = String(item[idField]);
        if (!deletedIds.has(id)) {
            map.set(id, item);
        }
    });

    // 2. Merge upserts (updates existing or adds new)
    newItems.forEach(item => {
        const id = String(item[idField]);
        map.set(id, item);
    });

    const updatedList = Array.from(map.values());

    // 3. Sort if provided
    if (sortFn) {
        return updatedList.sort(sortFn);
    }

    // If no sort provided and new items were added, they are at the end.
    // Ideally, consumers should provide a sortFn if order matters.
    return updatedList;
};
