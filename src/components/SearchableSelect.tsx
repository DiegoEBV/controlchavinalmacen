import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Form } from 'react-bootstrap';
import { FixedSizeList } from 'react-window';

interface Option {
    value: string | number;
    label: string;
    info?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    disabled?: boolean;
}

// Separate Row component to prevent re-mounting and ensure memoization works correctly
const RowComponent = ({ index, style, data }: { index: number; style: React.CSSProperties; data: any }) => {
    const { options, highlightedIndex, onSelect, searchTerm } = data;
    const option = options[index];
    if (!option) return null;

    const getHighlightedText = (text: string, highlight: string) => {
        if (!highlight) return <span>{text}</span>;
        const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === highlight.toLowerCase() ? (
                        <strong key={i} style={{ color: '#0d6efd' }}>{part}</strong>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    };

    const isHighlighted = index === highlightedIndex;

    return (
        <div
            style={{
                ...style,
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: isHighlighted ? '#f0f4f9' : 'white',
                borderBottom: '1px solid #f1f3f5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: '1.2',
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.82rem',
                transition: 'background-color 0.1s ease'
            }}
            onClick={() => onSelect(option)}
            onMouseEnter={() => {}} // Could add hover state if not using highlightedIndex
        >
            <div style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <div style={{ fontWeight: 500, color: isHighlighted ? '#0d6efd' : '#212529' }}>
                    {getHighlightedText(option.label, searchTerm)}
                </div>
                {option.info && (
                    <div style={{ fontSize: '0.7rem', color: '#6c757d', marginTop: '2px' }} className="text-truncate">
                        {option.info}
                    </div>
                )}
            </div>
        </div>
    );
};

const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Seleccione...',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter height to match RowComponent.itemSize
    const ROW_HEIGHT = 45;

    // Debounce search term
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 150); // Faster debounce for better UX

        return () => {
            clearTimeout(handler);
        };
    }, [searchTerm]);

    // Sync input with external value changes
    useEffect(() => {
        const selectedOption = options.find(o => o.value === value);
        if (selectedOption) {
            setSearchTerm(selectedOption.label);
            setDebouncedSearchTerm(selectedOption.label);
        } else if (!value) {
            // Force clear if value is empty (like after handleAddItem)
            setSearchTerm('');
            setDebouncedSearchTerm('');
        }
    }, [value, options]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                const selectedOption = options.find(o => o.value === value);
                if (selectedOption) {
                    setSearchTerm(selectedOption.label);
                } else {
                    setSearchTerm('');
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [value, options]);

    const filteredOptions = useMemo(() => {
        const isCurrentlySelected = options.find(o => o.value === value)?.label === debouncedSearchTerm;
        
        if (!debouncedSearchTerm || (isCurrentlySelected && !isOpen)) {
            return options;
        }

        // Only filter if not exactly matching selected or if user is searching
        return options.filter(option =>
            option.label.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
            (option.info && option.info.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
        );
    }, [options, debouncedSearchTerm, isOpen, value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleSelect(filteredOptions[highlightedIndex]);
                } else if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            case 'Tab':
                setIsOpen(false);
                break;
        }
    };

    const handleSelect = (option: Option) => {
        onChange(option.value);
        setSearchTerm(option.label);
        setDebouncedSearchTerm(option.label);
        setIsOpen(false);
        setHighlightedIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setIsOpen(true);
        setHighlightedIndex(0);

        if (e.target.value === '') {
            setDebouncedSearchTerm('');
        }
    };

    const itemData = useMemo(() => ({
        options: filteredOptions,
        highlightedIndex,
        onSelect: handleSelect,
        searchTerm: debouncedSearchTerm
    }), [filteredOptions, highlightedIndex, debouncedSearchTerm]);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <Form.Control
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onClick={() => {
                        if (!disabled) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    style={{
                        paddingRight: '30px',
                        borderRadius: '8px',
                        border: isOpen ? '1px solid #0d6efd' : '1px solid #dee2e6',
                        boxShadow: isOpen ? '0 0 0 0.2rem rgba(13, 110, 253, 0.15)' : 'none',
                        transition: 'all 0.2s'
                    }}
                />
                <div style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: '#adb5bd',
                    transition: 'transform 0.2s',
                    rotate: isOpen ? '180deg' : '0deg'
                }}>
                    <i className="bi bi-chevron-down"></i>
                </div>
            </div>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1100,
                        backgroundColor: 'white',
                        border: '1px solid #e9ecef',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                        marginTop: '6px',
                        overflow: 'hidden',
                        animation: 'fadeIn 0.15s ease-out'
                    }}
                >
                    <div className="virtualized-list-wrapper">
                        {filteredOptions.length > 0 ? (
                            <FixedSizeList
                                height={Math.min(filteredOptions.length * ROW_HEIGHT, 250)}
                                itemCount={filteredOptions.length}
                                itemSize={ROW_HEIGHT}
                                width="100%"
                                itemData={itemData}
                                style={{ overflowX: 'hidden' }}
                            >
                                {RowComponent}
                            </FixedSizeList>
                        ) : (
                            <div style={{ padding: '15px', color: '#6c757d', textAlign: 'center', fontSize: '0.85rem' }}>
                                <i className="bi bi-search me-2"></i> No se encontraron resultados
                            </div>
                        )}
                    </div>
                </div>
            )}
            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .virtualized-list-wrapper::-webkit-scrollbar {
                    width: 6px;
                }
                .virtualized-list-wrapper::-webkit-scrollbar-thumb {
                    background: #dfe3e6;
                    border-radius: 10px;
                }
                `}
            </style>
        </div>
    );
};

export default SearchableSelect;
