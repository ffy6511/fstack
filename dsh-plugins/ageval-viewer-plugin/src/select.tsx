import { createElement as h, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  aria: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function CustomSelect({ value, onChange, options, aria, className = '', disabled = false, placeholder }: SelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex(([key]) => key === value);
  const label = selected >= 0 ? options[selected][1] : placeholder || aria;
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const optionId = (index: number) => `${id}-option-${index}`;

  function dismiss() {
    menu.current?.hidePopover();
    setOpen(false);
  }
  function show(index = selected >= 0 ? selected : 0) {
    if (disabled || !options.length) return;
    setActive(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  }
  function choose(index: number) {
    if (!options[index]) return;
    dismiss();
    trigger.current?.focus({ preventScroll: true });
    onChange(options[index][0]);
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const element = menu.current;
    element.showPopover();
    const place = () => {
      const box = trigger.current!.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const gutter = 10, gap = 5;
      const width = Math.min(Math.max(box.width, 220), 420, viewportWidth - gutter * 2);
      const below = viewportHeight - box.bottom - gap - gutter;
      const above = box.top - gap - gutter;
      const upward = below < Math.min(element.scrollHeight + 2, 280) && above > below;
      const maxHeight = Math.max(32, Math.min(280, upward ? above : below));
      const actualHeight = Math.min(element.scrollHeight + 2, maxHeight);
      setPosition({
        width,
        left: Math.max(gutter, Math.min(box.left, viewportWidth - width - gutter)),
        top: upward ? Math.max(gutter, box.top - gap - actualHeight) : box.bottom + gap,
        maxHeight,
      });
    };
    place();
    // An ancestor scroll must not leave a detached menu floating over other rows.
    const scroll = (event: Event) => { if (!element.contains(event.target as Node)) dismiss(); };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') setOpen(false);
    };
    element.addEventListener('toggle', toggle);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => {
      element.removeEventListener('toggle', toggle);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scroll, true);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => { if (disabled || !options.length) dismiss(); }, [disabled, options.length]);

  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const count = options.length;
    if (disabled || !count) return;
    if (event.key === 'Escape') { if (open) { event.preventDefault(); dismiss(); } return; }
    if (event.key === 'Tab') { if (open) dismiss(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) show(event.key === 'End' ? count - 1 : event.key === 'Home' ? 0 : selected >= 0 ? selected : event.key === 'ArrowUp' ? count - 1 : 0);
      else setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + count) % count);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      search.current = { text: (now - search.current.at < 650 ? search.current.text : '') + event.key.toLowerCase(), at: now };
      const index = options.findIndex(([, text]) => text.toLowerCase().startsWith(search.current.text));
      if (index >= 0) { event.preventDefault(); if (!open) show(index); else setActive(index); }
    }
  }

  return h('span', { className: `ageval-select-control ${className}`.trim() },
    h('button', {
      ref: trigger, type: 'button', role: 'combobox', className: 'ageval-select-trigger',
      'aria-label': aria, 'aria-haspopup': 'listbox', 'aria-expanded': open,
      'aria-controls': `${id}-list`, 'aria-activedescendant': open ? optionId(active) : undefined,
      disabled, title: label, onKeyDown: keydown,
      onClick: (event: MouseEvent) => { event.stopPropagation(); if (open) dismiss(); else show(); },
    }, h('span', { className: 'ageval-select-value' }, label), h('span', { className: 'ageval-select-chevron', 'aria-hidden': true })),
    h('div', {
      ref: menu, id: `${id}-list`, popover: 'auto', role: 'listbox', 'aria-label': aria,
      className: 'ageval-select-menu',
      style: { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight },
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
      onClick: (event: MouseEvent) => event.stopPropagation(),
    }, options.map(([key, text], index) => h('div', {
      key, id: optionId(index), role: 'option', 'aria-selected': key === value,
      className: `ageval-select-option${active === index ? ' is-active' : ''}`,
      title: text, onMouseMove: () => setActive(index), onClick: () => choose(index),
    }, h('span', { className: `ageval-select-check${key === value ? ' is-checked' : ''}`, 'aria-hidden': true }), h('span', { className: 'ageval-select-option-text' }, text)))),
  );
}
