import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Form } from 'react-bootstrap';
import { List } from 'react-window';

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

    // Debounce search term
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);

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
        } else {
            setSearchTerm('');
            setDebouncedSearchTerm('');
        }
    }, [value, options]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search term to selected value on close if no new selection was made
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
        if (!debouncedSearchTerm || (options.find(o => o.value === value)?.label === debouncedSearchTerm)) {
            // If we have a selection and the search matches it, show everything or a focused set?
            // Usually we show everything when opening, but if searching, we filter.
            if (!isOpen) return options;
        }

        // If searching but search matches current selection label, and it's open, maybe user wants to change it
        // We filter by debounced term (case insensitive)
        return options.filter(option =>
            option.label.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
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
            // onChange(''); // Optional: clear selection if input empty
        }
    };

    const getHighlightedText = (text: string, highlight: string) => {
        if (!highlight) return <span>{text}</span>;
        const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === highlight.toLowerCase() ? (
                        <strong key={i}>{part}</strong>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    };

    // Row component for react-window v2
    const Row = (props: {
        index: number;
        style: React.CSSProperties;
    }) => {
        const { index, style } = props;
        const option = filteredOptions[index];
        if (!option) return null;

        return (
            <div
                style={{
                    ...style,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    backgroundColor: index === highlightedIndex ? '#e9ecef' : 'white',
                    borderBottom: '1px solid #f8f9fa',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: '1.3',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.85rem'
                }}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
            >
                <div style={{ width: '100%' }}>
                    {getHighlightedText(option.label, debouncedSearchTerm)}
                    {option.info && (
                        <small className="text-muted d-block mt-1">
                            {option.info}
                        </small>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
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
            />

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #ced4da',
                        borderRadius: '0.25rem',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        marginTop: '2px',
                        overflow: 'hidden'
                    }}
                >
                    {filteredOptions.length > 0 ? (
                        <List<{}>
                            style={{ height: Math.min(filteredOptions.length * 70, 300) }}
                            rowCount={filteredOptions.length}
                            rowHeight={70}
                            rowComponent={Row}
                            rowProps={{}}
                        />
                    ) : (
                        <div style={{ padding: '8px 12px', color: '#6c757d' }}>
                            No se encontraron materiales
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
