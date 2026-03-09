import { useState, useMemo, useEffect } from 'react';

export function usePagination<T>(items: T[], pageSize: number = 15) {
    const [currentPage, setCurrentPage] = useState(1);

    // Ajustar la página actual si los datos cambian y la página actual queda fuera de rango
    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [items.length, pageSize, currentPage]);

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
