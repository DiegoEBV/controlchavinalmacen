
/**
 * Fetches all records from a Supabase query by handling pagination automatically.
 * Useful for bypassing the default 1000 records limit.
 * 
 * @param query The Supabase query builder object.
 * @param batchSize The number of records to fetch per request (default 1000).
 * @returns An array containing all records.
 */
export async function fetchAll<T>(
    query: any,
    batchSize: number = 1000
): Promise<T[]> {
    let allData: T[] = [];
    let from = 0;
    let to = batchSize - 1;
    let finished = false;

    while (!finished) {
        const { data, error } = await query.range(from, to);

        if (error) {
            console.error('Error in fetchAll:', error);
            throw error;
        }

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < batchSize) {
                finished = true;
            } else {
                from += batchSize;
                to += batchSize;
            }
        } else {
            finished = true;
        }
    }

    return allData;
}
