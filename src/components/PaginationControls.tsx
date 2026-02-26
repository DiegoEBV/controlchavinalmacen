import React from 'react';
import { Pagination } from 'react-bootstrap';

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
}) => {
    if (totalPages <= 1) return null;

    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    // Mostrar hasta 5 números de página alrededor de la actual
    const pageNumbers: (number | '...')[] = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else {
        pageNumbers.push(1);
        if (currentPage > 3) pageNumbers.push('...');
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pageNumbers.push(i);
        }
        if (currentPage < totalPages - 2) pageNumbers.push('...');
        pageNumbers.push(totalPages);
    }

    return (
        <div className="d-flex justify-content-between align-items-center mt-3 px-1">
            <small className="text-muted">
                Mostrando <strong>{start}–{end}</strong> de <strong>{totalItems}</strong> registros
            </small>
            <Pagination className="mb-0" size="sm">
                <Pagination.Prev
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                />
                {pageNumbers.map((p, idx) =>
                    p === '...' ? (
                        <Pagination.Ellipsis key={`ellipsis-${idx}`} disabled />
                    ) : (
                        <Pagination.Item
                            key={p}
                            active={p === currentPage}
                            onClick={() => onPageChange(p as number)}
                        >
                            {p}
                        </Pagination.Item>
                    )
                )}
                <Pagination.Next
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                />
            </Pagination>
        </div>
    );
};

export default PaginationControls;
