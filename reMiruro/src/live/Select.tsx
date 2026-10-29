import { useEffect, useRef, useState } from 'react';
import { Ic, type IconName } from './Icon';

export type SelectOption = {
  value: string;
  label: string;
  tags?: { text: string; cls?: string }[];
};

export function LiveSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: IconName;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className='_root_9atf7_1' ref={rootRef} style={{ position: 'relative' }}>
      <button
        type='button'
        role='combobox'
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={label}
        className='_trigger_9atf7_22'
        {...(open ? { 'data-popup-open': '' } : {})}
        onClick={() => setOpen((o) => !o)}
      >
        <span className='_triggerIcon_9atf7_39'>
          <Ic n={icon} />
        </span>
        <span className='_triggerName_9atf7_45'>{current?.label || '—'}</span>
        <span className='_caret_9atf7_53'>
          <Ic n='sort' />
        </span>
      </button>
      {open && options.length > 0 && (
        <div
          className='_positioner_9atf7_59'
          style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', minWidth: '11rem' }}
        >
          <div data-open='' data-side='top' data-align='right' role='listbox' className='_menu_9atf7_64'>
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  key={o.value}
                  type='button'
                  role='option'
                  aria-selected={sel}
                  {...(sel ? { 'data-selected': '' } : {})}
                  className={`_item_9atf7_97${sel ? ' _itemActive_9atf7_121' : ''}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className='_itemLead_9atf7_124'>
                    <div className='_itemName_9atf7_131'>{o.label}</div>
                    {sel && (
                      <span className='_check_9atf7_145' aria-hidden='true'>
                        <Ic n='check' />
                      </span>
                    )}
                  </span>
                  {o.tags && o.tags.length > 0 && (
                    <span className='_tagRow_7lu1n_1'>
                      {o.tags.map((t) => (
                        <span key={t.text} className={`_tag_7lu1n_1${t.cls ? ` ${t.cls}` : ''}`}>
                          {t.text}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
