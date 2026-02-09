import { useState, useRef } from 'react';
import { EVENT_TYPE_CONFIG, MAIN_EVENT_TYPES } from './Timeline';
import type { EventType } from '../types';

interface FiltersProps {
  selectedTypes: Set<EventType>;
  onTypeToggle: (type: EventType) => void;
  availableYears: number[];
  selectedYears: Set<number>;
  onYearsChange: (years: Set<number>) => void;
  onReset: () => void;
}

// Default selected types (for checking if filters are active)
const DEFAULT_TYPES: EventType[] = ['RECOVERED', 'REGRINDED', 'PICTURE', 'LINKED', 'UNLINKED'];

export function Filters({
  selectedTypes,
  onTypeToggle,
  availableYears,
  selectedYears,
  onYearsChange,
  onReset,
}: FiltersProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const dragModeRef = useRef<'select' | 'deselect'>('select');

  const hasActiveFilters =
    selectedTypes.size !== DEFAULT_TYPES.length ||
    !DEFAULT_TYPES.every(t => selectedTypes.has(t)) ||
    selectedYears.size > 0;

  // Handle year click/drag
  const handleYearMouseDown = (year: number) => {
    setIsDragging(true);
    setDragStart(year);
    // Determine mode: if clicking selected year, deselect; otherwise select
    dragModeRef.current = selectedYears.has(year) ? 'deselect' : 'select';

    const newYears = new Set(selectedYears);
    if (dragModeRef.current === 'select') {
      newYears.add(year);
    } else {
      newYears.delete(year);
    }
    onYearsChange(newYears);
  };

  const handleYearMouseEnter = (year: number) => {
    if (!isDragging || dragStart === null) return;

    // Select/deselect all years between dragStart and current year
    const minYear = Math.min(dragStart, year);
    const maxYear = Math.max(dragStart, year);

    const newYears = new Set(selectedYears);
    for (let y = minYear; y <= maxYear; y++) {
      if (availableYears.includes(y)) {
        if (dragModeRef.current === 'select') {
          newYears.add(y);
        } else {
          newYears.delete(y);
        }
      }
    }
    onYearsChange(newYears);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Clear year selection
  const clearYears = () => {
    onYearsChange(new Set());
  };

  return (
    <div
      className="flex flex-col gap-4"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Row 1: Event Type Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-sm font-medium text-gray-700 mr-1">Show:</span>
        {MAIN_EVENT_TYPES.map(type => {
          const config = EVENT_TYPE_CONFIG[type];
          const isSelected = selectedTypes.has(type);

          return (
            <label
              key={type}
              className={`
                inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm cursor-pointer
                transition-all duration-150 select-none
                ${isSelected
                  ? 'ring-2 ring-offset-1'
                  : 'opacity-50 hover:opacity-75'
                }
              `}
              style={{
                backgroundColor: isSelected ? config.bgColor : '#f3f4f6',
                color: isSelected ? config.color : '#6b7280',
                ringColor: isSelected ? config.color : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onTypeToggle(type)}
                className="sr-only"
              />
              <span
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
                style={{
                  backgroundColor: isSelected ? config.bgColor : '#e5e7eb',
                  color: isSelected ? config.color : '#9ca3af',
                  border: `1.5px solid ${isSelected ? config.color : '#9ca3af'}`,
                }}
              >
                {config.icon}
              </span>
              <span className="whitespace-nowrap">{config.label}</span>
            </label>
          );
        })}
      </div>

      {/* Row 2: Year Selector + Reset */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Years:</span>
          <div className="flex items-center gap-1 select-none">
            {availableYears.map(year => {
              const isSelected = selectedYears.has(year);
              return (
                <button
                  key={year}
                  type="button"
                  onMouseDown={() => handleYearMouseDown(year)}
                  onMouseEnter={() => handleYearMouseEnter(year)}
                  className={`
                    px-2 py-1 text-xs sm:text-sm rounded transition-all cursor-pointer
                    ${isSelected
                      ? 'bg-[#1DB898] text-white font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  {year}
                </button>
              );
            })}
            {selectedYears.size > 0 && (
              <button
                type="button"
                onClick={clearYears}
                className="ml-1 px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600"
                title="Clear year selection"
              >
                ✕
              </button>
            )}
          </div>
          {selectedYears.size === 0 && (
            <span className="text-xs text-gray-400">(all)</span>
          )}
        </div>

        {/* Reset Button */}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
