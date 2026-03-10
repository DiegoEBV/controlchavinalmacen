/**
 * Formats a date string from the database (YYYY-MM-DD or ISO) to a local date string (DD/MM/YYYY).
 * Prevents the common "one day off" error caused by timezone shifts when parsing "YYYY-MM-DD" as UTC.
 * 
 * @param dateStr Date string from the database
 * @returns Formatted date string or '-' if invalid
 */
export const formatDisplayDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';

    // Handle simple YYYY-MM-DD case
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        return `${parseInt(day)}/${parseInt(month)}/${year}`;
    }

    // Handle ISO timestamps (like updated_at)
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString();
    } catch (e) {
        return '-';
    }
};
