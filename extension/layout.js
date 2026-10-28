// Reserve a separate app region without changing WhatsApp's inline styles or DOM order.
(() => {
  const style = document.createElement('style');
  style.id = 'threadlight-layout';
  document.documentElement.append(style);
  let frame = 0, panel = null, marked = new Map(), layout = '';
  const panelObserver = new MutationObserver(schedule);

  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
  }
  function sync() {
    const host = document.getElementById('threadlight-root');
    const nextPanel = host?.shadowRoot?.querySelector('.panel');
    if (nextPanel !== panel) {
      panelObserver.disconnect(); panel = nextPanel;
      if (panel) panelObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }
    const app = document.getElementById('app');
    const main = document.getElementById('main');
    const next = new Map();
    const open = panel && !panel.hidden && app;
    const dock = innerWidth >= 1200 ? 'side' : 'bottom';
    const height = Math.min(520, Math.round(innerHeight * .55));
    if (open) {
      next.set(app, 'data-threadlight-app');
      // .two is WhatsApp's chat-list/conversation split. Only its outer shell
      // fills the app width; the chat column must still share space with the list.
      const split = main?.closest('.two') || app.querySelector('.two');
      for (let node = split; node && node !== app && app.contains(node); node = node.parentElement) {
        next.set(node, 'data-threadlight-shell');
      }
      if (split && main && split.contains(main)) {
        for (let node = main; node !== split; node = node.parentElement) next.set(node, 'data-threadlight-chat');
      }
    }
    for (const [node, attribute] of marked) if (next.get(node) !== attribute) node.removeAttribute(attribute);
    for (const [node, attribute] of next) if (!node.hasAttribute(attribute)) node.setAttribute(attribute, '');
    marked = next;
    const key = open ? `${dock}:${height}` : '';
    if (layout === key) return;
    layout = key;
    if (!open) {
      document.documentElement.removeAttribute('data-threadlight-dock');
      host?.removeAttribute('data-dock');
      style.textContent = '';
      return;
    }
    document.documentElement.dataset.threadlightDock = dock;
    host.dataset.dock = dock;
    host.style.setProperty('--threadlight-dock-width', '400px');
    host.style.setProperty('--threadlight-dock-height', `${height}px`);
    const scope = 'html[data-threadlight-dock]';
    style.textContent = `
      ${scope} [data-threadlight-app] {
        position:fixed!important; inset:0 ${dock === 'side' ? '400px' : '0'} ${dock === 'bottom' ? `${height}px` : '0'} 0!important;
        width:auto!important; height:auto!important; min-width:0!important; min-height:0!important;
        max-width:none!important; max-height:none!important; margin:0!important; box-sizing:border-box!important;
        contain:layout size!important; overflow:hidden!important;
      }
      ${scope} [data-threadlight-shell] {
        width:100%!important; height:100%!important; min-width:0!important; min-height:0!important;
        max-width:100%!important; max-height:100%!important; margin:0!important; inset:0!important; box-sizing:border-box!important;
      }
      ${scope} [data-threadlight-chat] { min-width:0!important; min-height:0!important; max-width:100%!important; height:100%!important; }
    `;
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  sync();
})();
