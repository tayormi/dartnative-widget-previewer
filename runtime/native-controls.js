import { color } from './style-values.js';
import { applyTextStyle } from './layout-values.js';
import { symbolName as symbol } from './platform.js';
import { renderCalendar } from './date-picker.js';
import { renderColorPicker, selectedColor } from './color-picker.js';

const element = (tag, className, text) => {
  const e = document.createElement(tag);
  e.className = className;
  if (text != null) e.textContent = text;
  return e;
};
export function renderControl({ name, p, runtime, mode, platform, render, key }) {
  const active = mode === 'interact',
    change = (fn, value) => {
      if (active && fn) runtime.action(fn, value);
    };
  if (name === 'SegmentedControl') {
    const el = element('div', 'dn dn-SegmentedControl');
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', 'Segments');
    if (p.backgroundColor) el.style.backgroundColor = color(p.backgroundColor);
    (p.segments || []).forEach((label, i) => {
      const selected = i === (p.selectedIndex ?? 0),
        b = element('button', 'segment', label);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(selected));
      b.tabIndex = selected ? 0 : -1;
      b.disabled = !active || !p.onValueChanged;
      applyTextStyle(b, {
        props: { ...p.labelFontStyle?.props, ...(selected ? p.selectedLabelFontStyle?.props : {}) },
      });
      if (selected && p.indicatorColor) b.style.backgroundColor = color(p.indicatorColor);
      b.onclick = () => {
        if (!selected) change(p.onValueChanged, i);
      };
      b.onkeydown = (e) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          change(
            p.onValueChanged,
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? p.segments.length - 1
                : (i + (e.key === 'ArrowRight' ? 1 : -1) + p.segments.length) % p.segments.length,
          );
        }
      };
      el.append(b);
    });
    return el;
  }
  if (name === 'Slider') {
    const el = element('input', 'dn dn-Slider');
    el.type = 'range';
    el.min = String(p.min ?? 0);
    el.max = String(p.max ?? 1);
    el.step = p.divisions ? String((Number(el.max) - Number(el.min)) / p.divisions) : 'any';
    el.value = String(p.value);
    el.disabled = !active || !p.onChanged;
    el.setAttribute('aria-label', 'Slider');
    if (p.divisions) {
      el.dataset.discrete = 'true';
      el.style.setProperty('--slider-divisions', p.divisions);
    }
    const paint = () =>
      el.style.setProperty(
        '--slider-percent',
        `${(100 * (Number(el.value) - Number(el.min))) / (Number(el.max) - Number(el.min))}%`,
      );
    paint();
    if (p.activeColor) el.style.setProperty('--slider-active', color(p.activeColor));
    if (p.inactiveColor) el.style.setProperty('--slider-inactive', color(p.inactiveColor));
    if (p.thumbColor) el.style.setProperty('--slider-thumb', color(p.thumbColor));
    const state = runtime.uiState.get(key) || {};
    runtime.uiState.set(key, state);
    const start = () => {
      if (!state.dragging) {
        state.dragging = true;
        change(p.onChangeStart, Number(el.value));
      }
    };
    const end = () => {
      if (state.dragging) {
        state.dragging = false;
        change(p.onChangeEnd, Number(el.value));
      }
    };
    el.onpointerdown = (event) => {
      if (!active || !p.onChanged) return;
      event.preventDefault();
      el.focus();
      const rect = el.getBoundingClientRect(),
        min = Number(el.min),
        max = Number(el.max),
        epoch = runtime.epoch;
      let value = Number(el.value);
      start();
      const move = (e) => {
        if (runtime.epoch !== epoch || runtime.disposed) {
          finish();
          return;
        }
        const thumb = platform === 'ios' ? 38 : 20;
        const percent = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left - thumb / 2) / (rect.width - thumb)),
        );
        value = min + percent * (max - min);
        if (p.divisions)
          value = min + (Math.round(percent * p.divisions) * (max - min)) / p.divisions;
        el.value = String(value);
        change(p.onChanged, value);
      };
      const finish = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        runtime.cleanups.delete(finish);
        if (state.dragging) {
          state.dragging = false;
          if (runtime.epoch === epoch && !runtime.disposed) change(p.onChangeEnd, value);
        }
      };
      runtime.cleanups.add(finish);
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
      move(event);
    };
    el.onkeydown = (e) => {
      if (
        [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(e.key)
      )
        start();
    };
    el.onkeyup = end;
    el.oninput = () => {
      paint();
      change(p.onChanged, Number(el.value));
    };
    el.onchange = end;
    return el;
  }
  if (['CircularProgressIndicator', 'LinearProgressIndicator'].includes(name)) {
    const el = element('div', `dn dn-${name}`),
      v = p.value == null ? null : Math.min(1, Math.max(0, p.value));
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', 'Progress');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    if (v != null) el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    const tint = color(p.valueColor?.value ?? p.color) || 'var(--native-accent)';
    if (name === 'LinearProgressIndicator') {
      el.style.background =
        color(p.backgroundColor) || (platform === 'ios' ? '#bdddff' : '#78788029');
      el.style.height = `${platform === 'ios' ? 4 : (p.minHeight ?? 4)}px`;
      const bar = element('div', 'progress-fill');
      bar.style.background = tint;
      bar.style.width = `${(v ?? 0) * 100}%`;
      el.append(bar);
      if (v == null && platform === 'android') el.classList.add('indeterminate');
    } else if (v == null) {
      el.style.color = tint;
      if (platform === 'android') {
        el.classList.add('android-spinner');
        return el;
      }
      el.classList.add('spinner');
      for (let i = 0; i < 8; i++) {
        const bar = element('i', 'spinner-tick');
        bar.style.transform = `rotate(${i * 45}deg) translateY(-7px)`;
        bar.style.animationDelay = `${-1 + i / 8}s`;
        el.append(bar);
      }
    } else {
      const ns = 'http://www.w3.org/2000/svg',
        svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 36 36');
      for (const [stroke, progress] of [
        [color(p.backgroundColor) || 'transparent', 1],
        [tint, v],
      ]) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', '18');
        c.setAttribute('cy', '18');
        c.setAttribute('r', '15');
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', stroke);
        c.setAttribute('stroke-width', String(p.strokeWidth ?? 3));
        c.setAttribute('pathLength', '100');
        c.setAttribute('stroke-dasharray', `${progress * 100} 100`);
        c.setAttribute('transform', 'rotate(-90 18 18)');
        svg.append(c);
      }
      el.append(svg);
    }
    return el;
  }
  if (name === 'SearchBar') {
    const state = runtime.uiState.get(key) || { query: '', open: false };
    runtime.uiState.set(key, state);
    const el = element('div', 'dn dn-SearchBar');
    el.dataset.open = String(state.open);
    const field = element('input', 'search-input');
    field.type = 'search';
    field.placeholder = p.hintText ?? 'Search';
    field.value = state.query;
    field.setAttribute('aria-label', field.placeholder);
    field.readOnly = !active;
    if (p.backgroundColor) field.style.background = color(p.backgroundColor);
    field.onfocus = () => {
      if (active && !state.open) {
        state.open = true;
        runtime.onChange();
      }
    };
    field.oninput = () => {
      state.query = field.value;
      change(p.onChanged, state.query);
    };
    field.onkeydown = (e) => {
      if (e.key === 'Enter') change(p.onSubmitted, field.value);
      if (e.key === 'Escape') {
        field.blur();
        close();
      }
    };
    const close = () => {
      state.open = false;
      if (platform === 'ios' && state.query) {
        state.query = '';
        change(p.onChanged, '');
      }
      if (p.onClosed) change(p.onClosed);
      else runtime.onChange();
    };
    el.append(field);
    if (state.open) {
      const panel = element('div', 'search-results');
      if (p.surfaceColor) panel.style.background = color(p.surfaceColor);
      if (p.suggestions) panel.append(render(p.suggestions));
      const cancel = element('button', 'search-close', platform === 'ios' ? 'Cancel' : 'Back');
      cancel.setAttribute('aria-label', platform === 'ios' ? 'Cancel' : 'Back');
      cancel.onclick = close;
      el.append(cancel, panel);
    }
    return el;
  }
  return null;
}

export function renderOverlays(runtime, { platform, mode, render }) {
  if (!runtime.overlays.length) return null;
  const overlay = runtime.overlays.at(-1),
    { name, props: p } = overlay;
  const root = element('div', 'native-overlay'),
    panel = element('section', 'native-overlay-panel');
  root.dataset.platform = platform;
  root.dataset.kind = name;
  root.setAttribute('role', 'presentation');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', p.title || 'Choose an option');
  panel.tabIndex = -1;
  if (!overlay.focused) {
    overlay.focused = true;
    queueMicrotask(() => {
      if (panel.isConnected) panel.focus();
    });
  }
  const close = (value) => {
    if (mode === 'interact') runtime.completeOverlay(value);
  };
  root.onclick = (e) => {
    if (e.target === root && name !== 'showAlert') close(name === 'showActionSheet' ? -1 : null);
  };
  root.onkeydown = (e) => {
    if (e.key === 'Escape' && name !== 'showAlert') {
      e.stopPropagation();
      close(name === 'showActionSheet' ? -1 : null);
    }
    if (e.key === 'Tab') {
      const items = [
        ...panel.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
        ),
      ];
      const i = items.indexOf(document.activeElement);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
      } else if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items.at(-1).focus();
      } else if (!e.shiftKey && (i === -1 || i === items.length - 1)) {
        e.preventDefault();
        items[0].focus();
      }
    }
  };
  if (p.title) panel.append(element('h2', '', p.title));
  if (p.message) panel.append(element('p', '', p.message));
  const button = (label, handler, danger = false) => {
    const b = element('button', danger ? 'destructive' : '', label);
    b.onclick = handler;
    b.disabled = mode !== 'interact';
    panel.append(b);
    return b;
  };
  if (name === 'showModalBottomSheet') {
    root.style.background = `rgb(0 0 0 / ${p.dimOpacity ?? 0.4})`;
    panel.style.background = color(p.backgroundColor) || 'var(--native-background)';
    panel.style.borderRadius = `${p.cornerRadius ?? 15}px ${p.cornerRadius ?? 15}px 0 0`;
    panel.append(render(p.builder(null)));
  } else if (name === 'showAlert' || name === 'showActionSheet') {
    const actions = p.actions ?? ['OK'];
    const buttons = actions.map((label, i) =>
      button(label, () => close(i), p.destructiveIndices?.includes(i)),
    );
    if (name === 'showAlert' && platform === 'ios') {
      const row = element('div', 'native-alert-actions');
      row.dataset.layout = actions.length <= 2 ? 'row' : 'column';
      row.append(...buttons);
      panel.append(row);
    }
    if (name === 'showActionSheet') button(p.cancelLabel ?? 'Cancel', () => close(-1));
  } else if (name === 'showDatePicker') {
    const dateMode = symbol(p.mode) || 'date';
    if (dateMode === 'date' || dateMode === 'dateAndTime') {
      panel.append(renderCalendar(overlay));
      if (dateMode === 'dateAndTime') {
        const time = element('input', 'native-date-input');
        time.type = 'time';
        time.setAttribute('aria-label', 'Time');
        time.value = `${String(overlay.date.hour).padStart(2, '0')}:${String(overlay.date.minute).padStart(2, '0')}`;
        time.onchange = () => {
          const [hour, minute] = time.value.split(':').map(Number);
          Object.assign(overlay.date, { hour, minute });
        };
        panel.append(time);
      }
      const choose = button(p.confirmText ?? 'Done', () =>
        close({ ...overlay.date, month: overlay.date.month + 1 }),
      );
      choose.classList.add('picker-confirm');
      if (platform === 'android') button('Cancel', () => close(null));
      root.append(panel);
      return root;
    }
    const input = element('input', 'native-date-input'),
      kind = symbol(p.mode) || 'date';
    input.type =
      kind === 'time' || kind === 'countDownTimer'
        ? 'time'
        : kind === 'dateAndTime'
          ? 'datetime-local'
          : 'date';
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
    input.value =
      overlay.selection ??
      (input.type === 'date'
        ? local.slice(0, 10)
        : input.type === 'time'
          ? local.slice(11, 16)
          : local.slice(0, 16));
    input.oninput = () => {
      overlay.selection = input.value;
    };
    input.setAttribute('aria-label', 'Choose date');
    panel.append(input);
    button('Cancel', () => close(null));
    button(p.confirmText ?? 'Done', () => {
      if (!input.value) return;
      const date = new Date(
        input.type === 'time'
          ? `${local.slice(0, 10)}T${input.value}`
          : `${input.value}${input.type === 'date' ? 'T00:00:00' : ''}`,
      );
      close({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      });
    });
  } else if (name === 'showColorPicker') {
    panel.append(renderColorPicker(overlay, runtime));
    button('Cancel', () => close(null));
    button('Done', () => close(selectedColor(overlay.color)));
  }
  root.append(panel);
  return root;
}
