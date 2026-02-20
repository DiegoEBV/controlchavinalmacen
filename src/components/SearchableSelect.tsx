import React, { useState, useEffect, useRef } from 'react';
import { Form } from 'react-bootstrap';

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
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync input with external value changes
    useEffect(() => {
        const selectedOption = options.find(o => o.value === value);
        if (selectedOption) {
            setSearchTerm(selectedOption.label);
        } else {
            setSearchTerm('');
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

    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
        setIsOpen(false);
        setHighlightedIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setIsOpen(true);
        setHighlightedIndex(0); // Reset highlight on search

        // Optional: If user clears input, clear selection?
        if (e.target.value === '') {
            onChange(''); // Or keep previous? Usually clearing input implies clearing selection
        }
    };

    const getHighlightedText = (text: string, highlight: string) => {
        if (!highlight) return <span>{text}</span>;
        // Escape special regex characters to prevent "Invalid regular expression" errors
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
                        maxHeight: '200px',
                        overflowY: 'auto',
                        backgroundColor: 'white',
                        border: '1px solid #ced4da',
                        borderRadius: '0.25rem',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        marginTop: '2px'
                    }}
                >
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option, index) => (
                            <div
                                key={option.value}
                                onClick={() => handleSelect(option)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    backgroundColor: index === highlightedIndex ? '#e9ecef' : 'white',
                                    borderBottom: '1px solid #f8f9fa' // Separator
                                }}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {getHighlightedText(option.label, searchTerm)}
                                {option.info && (
                                    <small className="text-muted ms-2">
                                        - {option.info}
                                    </small>
                                )}
                            </div>
                        ))
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
