import { useEffect, useMemo, useRef, useState } from 'react';

export type FilterOption = { value: string; label: string };

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z" />
    </svg>
  );
}

export function FilterSelect({
  label,
  placeholder,
  options,
  value,
  multiple,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: FilterOption[];
  value: string | string[];
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = multiple ? (Array.isArray(value) ? value : []) : [];
  const single = multiple ? '' : (typeof value === 'string' ? value : '');
  const hasValue = multiple ? selected.length > 0 : single !== '';
  const searchable = !!multiple || options.length > 12;
  const current = options.find((option) => option.value === single);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter((option) => option.value !== '');
    if (!q) return list;
    return list.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const choose = (option: FilterOption) => {
    if (multiple) {
      const next = selected.includes(option.value)
        ? selected.filter((item) => item !== option.value)
        : [...selected, option.value];
      onChange(next);
      setQuery('');
      return;
    }
    onChange(option.value);
    setQuery('');
    setOpen(false);
  };

  const clear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(multiple ? [] : '');
    setQuery('');
  };

  const shown = multiple
    ? selected.map((item) => options.find((option) => option.value === item)?.label || item).join(', ')
    : current?.label || placeholder;

  return (
    <div className={`_group_blpjc_1${hasValue ? '' : ''}`} data-filled={hasValue ? '' : undefined} ref={rootRef}>
      <label className='_label_blpjc_7' data-filled={hasValue ? '' : undefined}>
        {label}
      </label>
      <div className='_container_7u5yy_1'>
        <div
          className='_control_7u5yy_6'
          data-filled={hasValue ? '' : undefined}
          data-placeholder={hasValue ? undefined : ''}
          role={searchable ? 'group' : 'combobox'}
          aria-expanded={searchable ? undefined : open}
          aria-haspopup={searchable ? undefined : 'listbox'}
          aria-label={searchable ? undefined : label}
          tabIndex={searchable ? undefined : 0}
          onKeyDown={(event) => {
            if (searchable) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen((state) => !state);
            }
          }}
          onClick={() => setOpen((state) => (searchable ? true : !state))}
        >
          <div className={`_values_7u5yy_37${multiple ? ' _multiple_7u5yy_50' : ''}${hasValue ? ' _clearable_7u5yy_47' : ''}`}>
            {(hasValue || !searchable) && (
              <span className='_singleValue_7u5yy_55'>
                <span className='_optionLabel_7u5yy_191'>{shown}</span>
              </span>
            )}
            {searchable && (
              <input
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-label={label}
                className='_input_7u5yy_69'
                placeholder={hasValue ? '' : placeholder}
                value={open ? query : ''}
                data-filled={hasValue ? '' : undefined}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
              />
            )}
          </div>
          {hasValue && (
            <button type="button" className='_indicator_7u5yy_92' aria-label="Clear selection" onClick={clear}>
              <ClearIcon />
            </button>
          )}
          <button
            type="button"
            className='_indicator_7u5yy_92'
            aria-label="Open choices"
            aria-expanded={open}
            aria-haspopup="listbox"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((state) => !state);
            }}
          >
            <Chevron />
          </button>
        </div>
        {open && (
          <div className='_positioner_7u5yy_117' role="presentation" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', width: '100%', zIndex: 30 }}>
            <div className='_menu_7u5yy_122' data-open="" data-side="bottom" data-align="center" role="presentation">
              <div role="listbox" aria-multiselectable={multiple || undefined} className='_list_7u5yy_139'>
                {filtered.length === 0 && <div className='_empty_7u5yy_148'>No matches</div>}
                {filtered.map((option) => {
                  const on = multiple ? selected.includes(option.value) : option.value === single;
                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={on}
                      data-selected={on ? '' : undefined}
                      className='_option_7u5yy_164'
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                    >
                      <span className='_optionLabel_7u5yy_191'>{option.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
