export function calendarDays(year, month) {
  const first = new Date(year, month, 1).getDay(),
    count = new Date(year, month + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
}
export function renderCalendar(overlay, onChange) {
  const today = new Date();
  overlay.date ??= {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
    hour: today.getHours(),
    minute: today.getMinutes(),
  };
  overlay.page ??= { year: overlay.date.year, month: overlay.date.month };
  const root = document.createElement('div');
  root.className = 'native-calendar';
  const paint = () => {
    root.replaceChildren();
    const { year, month } = overlay.page;
    const header = document.createElement('div');
    header.className = 'calendar-month';
    const title = document.createElement('button');
    title.className = 'calendar-month-title';
    title.textContent = new Date(year, month, 1).toLocaleDateString('en', {
      month: 'long',
      year: 'numeric',
    });
    title.setAttribute('aria-label', 'Choose month and year');
    title.onclick = () => {
      overlay.chooseMonth = !overlay.chooseMonth;
      paint();
    };
    header.append(title);
    for (const [label, delta, glyph] of [
      ['Previous month', -1, '‹'],
      ['Next month', 1, '›'],
    ]) {
      const button = document.createElement('button');
      button.textContent = glyph;
      button.setAttribute('aria-label', label);
      button.onclick = () => {
        const next = new Date(year, month + delta, 1);
        overlay.page = { year: next.getFullYear(), month: next.getMonth() };
        paint();
      };
      header.append(button);
    }
    root.append(header);
    if (overlay.chooseMonth) {
      const months = document.createElement('select');
      months.setAttribute('aria-label', 'Month');
      for (let month = 0; month < 12; month++)
        months.add(
          new Option(
            new Date(2026, month, 1).toLocaleDateString('en', { month: 'long' }),
            String(month),
          ),
        );
      months.value = String(month);
      months.onchange = () => {
        overlay.page.month = Number(months.value);
        paint();
      };
      const years = document.createElement('input');
      years.type = 'number';
      years.min = '1900';
      years.max = '2200';
      years.value = String(year);
      years.setAttribute('aria-label', 'Year');
      years.onchange = () => {
        overlay.page.year = Math.min(2200, Math.max(1900, Number(years.value)));
        paint();
      };
      root.append(months, years);
      return;
    }
    const days = document.createElement('div');
    days.className = 'calendar-days';
    for (const name of ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']) {
      const label = document.createElement('span');
      label.className = 'calendar-weekday';
      label.textContent = name;
      days.append(label);
    }
    for (const day of calendarDays(year, month)) {
      const cell = document.createElement(day ? 'button' : 'span');
      if (day) {
        cell.textContent = String(day);
        cell.setAttribute(
          'aria-label',
          new Date(year, month, day).toLocaleDateString('en', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        );
        cell.setAttribute(
          'aria-pressed',
          String(
            overlay.date.year === year && overlay.date.month === month && overlay.date.day === day,
          ),
        );
        cell.onclick = () => {
          overlay.date = { ...overlay.date, year, month, day };
          paint();
          onChange?.();
        };
      }
      days.append(cell);
    }
    root.append(days);
  };
  paint();
  return root;
}
