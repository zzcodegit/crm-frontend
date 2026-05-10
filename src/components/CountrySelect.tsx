import { useState, useRef, useEffect } from "react";
import type { CountryItem } from "../api";

interface CountrySelectProps {
  value: number | null;
  onChange: (countryId: number | null) => void;
  countries: CountryItem[];
  disabled?: boolean;
}

export default function CountrySelect({ value, onChange, countries, disabled }: CountrySelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = countries.find(c => c.id === value);

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCountries[highlightedIndex]) {
          onChange(filteredCountries[highlightedIndex].id);
          setIsOpen(false);
          setSearchQuery("");
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery("");
        break;
    }
  };

  const handleSelect = (countryId: number) => {
    onChange(countryId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Поле выбора */}
      <div
        className="relative cursor-pointer"
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск страны..."
            disabled={disabled}
            className="w-full pl-12 pr-12 py-3.5 rounded-xl text-base transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '2px solid var(--accent)',
              boxShadow: '0 0 0 4px var(--accent-light)',
            }}
          />
        ) : (
          <div
            className="w-full pl-12 pr-12 py-3.5 rounded-xl text-base transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: selectedCountry ? 'var(--text-primary)' : 'var(--text-tertiary)',
              border: '2px solid var(--border)',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 4px var(--accent-light)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {selectedCountry ? selectedCountry.name : 'Выберите страну'}
          </div>
        )}

        {/* Кнопки справа */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selectedCountry && !isOpen && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="p-1 rounded-md transition-colors hover:bg-opacity-10"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ 
              color: 'var(--text-tertiary)',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Выпадающий список */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-2xl animate-slide-in z-50"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {filteredCountries.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Страна не найдена
              </div>
            </div>
          ) : (
            filteredCountries.map((country, index) => (
              <button
                key={country.id}
                type="button"
                onClick={() => handleSelect(country.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left transition-all"
                style={{
                  backgroundColor: index === highlightedIndex ? 'var(--accent-light)' : 'transparent',
                  borderBottom: index < filteredCountries.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex-1">
                  <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                    {country.name}
                  </div>
                  {country.code && (
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {country.code}
                    </div>
                  )}
                </div>
                {value === country.id && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
