import { useState, useMemo, useEffect } from 'react';

export function usePagination<T>(items: T[], pageSize: number = 15) {
    const [currentPage, setCurrentPage] = useState(1);

    // Reset to page 1 whenever the source data changes
    useEffect(() => {
        setCurrentPage(1);
    }, [items.length]);

    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }, [items, currentPage, pageSize]);

    const goToPage = (page: number) => {
        setCurrentPage(Math.min(Math.max(1, page), totalPages));
    };

    return {
        currentPage,
        totalPages,
        totalItems: items.length,
        pageSize,
        paginatedItems,
        goToPage,
    };
}
