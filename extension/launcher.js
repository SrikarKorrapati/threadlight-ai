// The floating launcher belongs to this browser, independently of any chat.
(() => {
  let launcher = null, footer = null, panel = null, position = null;
  let loaded = false, revision = 0, frame = 0, drag = null, suppressClick = false;
  const margin = 8, gap = 12;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const resizeObserver = new ResizeObserver(schedule);
  const panelObserver = new MutationObserver(schedule);

  async function send(type, data = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...data });
    if (!response?.ok) throw new Error(response?.error || 'Could not save the button position.');
    return response;
  }
  function validPosition(value) {
    return value === null || (value && typeof value.x === 'number' && typeof value.y === 'number' &&
      Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1);
  }
  function bounds() {
    const rect = launcher.getBoundingClientRect();
    return { width: rect.width, height: rect.height, maxX: Math.max(margin, innerWidth - rect.width - margin), maxY: Math.max(margin, innerHeight - rect.height - margin) };
  }
  function place(x, y, area = bounds()) {
    x = clamp(x, margin, area.maxX); y = clamp(y, margin, area.maxY);
    const composer = footer?.getBoundingClientRect();
    // A reply preview expands the footer. Keep its dismissal/send controls clear.
    if (composer?.width && composer.height && x + area.width > composer.left - gap && x < composer.right + gap &&
        y + area.height > composer.top - gap && y < composer.bottom + gap) {
      y = clamp(composer.top - area.height - gap, margin, area.maxY);
    }
    const left = `${Math.round(x)}px`, top = `${Math.round(y)}px`;
    if (launcher.style.left !== left) launcher.style.left = left;
    if (launcher.style.top !== top) launcher.style.top = top;
    launcher.style.right = 'auto'; launcher.style.bottom = 'auto';
    return { x, y };
  }
  function render() {
    if (!launcher || launcher.hidden || drag) return;
    const area = bounds();
    if (!area.width || !area.height) return;
    if (position) place(margin + position.x * (area.maxX - margin), margin + position.y * (area.maxY - margin), area);
    else {
      const composer = footer?.getBoundingClientRect();
      place(innerWidth - area.width - 20, composer?.height ? composer.top - area.height - gap : innerHeight - area.height - 94, area);
    }
    launcher.dataset.positionReady = String(loaded);
  }
  function schedule() {
    bind();
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function save(next) {
    position = next; revision++;
    const currentRevision = revision;
    void send('SAVE_LAUNCHER_POSITION', { position: next }).then(() => {
      if (revision === currentRevision) launcher.title = 'Drag to move · Arrow keys move · Home resets position';
    }).catch(() => {
      if (revision === currentRevision) launcher.title = 'Position could not be saved. Drag again to retry.';
    });
  }
  function saveCurrent() {
    const area = bounds(), rect = launcher.getBoundingClientRect();
    save({ x: clamp((rect.left - margin) / Math.max(1, area.maxX - margin), 0, 1), y: clamp((rect.top - margin) / Math.max(1, area.maxY - margin), 0, 1) });
  }
  function finish(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null; launcher.style.cursor = 'grab';
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
    suppressClick = moved;
    if (moved && !cancelled) saveCurrent();
    else schedule();
  }
  function bind() {
    const host = document.getElementById('threadlight-root'), next = host?.shadowRoot?.querySelector('.launcher');
    const nextFooter = document.querySelector('#main footer');
    if (nextFooter !== footer) {
      if (footer) resizeObserver.unobserve(footer);
      footer = nextFooter;
      if (footer) resizeObserver.observe(footer);
    }
    if (!next || next === launcher) return;
    launcher = next; panel = host.shadowRoot.querySelector('.panel');
    launcher.style.touchAction = 'none'; launcher.style.cursor = 'grab';
    launcher.title = 'Drag to move · Arrow keys move · Home resets position';
    resizeObserver.observe(launcher);
    panelObserver.disconnect();
    if (panel) panelObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    launcher.addEventListener('pointerdown', event => {
      if (!event.isTrusted || event.button !== 0 || !event.isPrimary) return;
      suppressClick = false;
      const rect = launcher.getBoundingClientRect();
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener('pointermove', event => {
      if (!event.isTrusted || !drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; launcher.style.cursor = 'grabbing'; event.preventDefault();
      place(drag.left + dx, drag.top + dy);
    });
    launcher.addEventListener('pointerup', event => finish(event));
    launcher.addEventListener('pointercancel', event => finish(event, true));
    launcher.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) finish(event, true); });
    launcher.addEventListener('click', event => {
      if (suppressClick && event.detail !== 0) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    launcher.addEventListener('keydown', event => {
      if (!event.isTrusted || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { save(null); schedule(); return; }
      const rect = launcher.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
      place(rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
      saveCurrent();
    });
    const before = revision;
    void send('GET_LAUNCHER_POSITION').then(response => {
      if (revision === before && validPosition(response.position)) position = response.position;
    }).catch(() => {}).finally(() => { loaded = true; schedule(); });
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  schedule();
})();
