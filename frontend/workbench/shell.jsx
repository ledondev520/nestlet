import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';

const copy = {
  zh: { openNav: '打开客户与事项列表', closeNav: '关闭列表', openContext: '打开案例上下文', closeContext: '关闭上下文', navigation: '客户与事项', context: '案例上下文' },
  en: { openNav: 'Open customers and cases', closeNav: 'Close list', openContext: 'Open case context', closeContext: 'Close context', navigation: 'Customers and cases', context: 'Case context' }
};

const mobileQuery = '(max-width: 960px)';
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Inbox-style three-column shell. Rail and context are columns on desktop;
 *  below 960px each becomes a modal drawer with dialog semantics: initial
 *  focus inside, Tab containment, inert background, and focus return to the
 *  owning toggle on every close route. Presentation only; no business state. */
export function WorkbenchShell({ lang = 'zh', brand, topbarEnd, rail, center, context, contextOpen, onContextOpenChange }) {
  const t = copy[lang] || copy.zh;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(mobileQuery).matches);
  const [railOpen, setRailOpen] = useState(false);
  // Mobile drawer state is separate: a desktop-open panel must not become an
  // open modal when the viewport shrinks.
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const railButtonRef = useRef(null);
  const contextButtonRef = useRef(null);
  const railRef = useRef(null);
  const contextRef = useRef(null);
  const topbarRef = useRef(null);
  const centerRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const onChange = event => {
      setIsMobile(event.matches);
      // Viewport changes never leave a modal drawer open.
      setRailOpen(false);
      setMobileContextOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const drawer = isMobile ? (railOpen ? 'rail' : mobileContextOpen ? 'context' : null) : null;

  const closeDrawers = useCallback(() => {
    setRailOpen(false);
    setMobileContextOpen(false);
  }, []);

  // Focus management lives in effects, after inert/visibility settle:
  // initial focus into the drawer on open, return focus on every close
  // route — to the owning toggle, or to the center after a rail selection.
  const wasDrawerRef = useRef(null);
  const closeFocusRef = useRef('toggle');
  useEffect(() => {
    if (!drawer) {
      if (wasDrawerRef.current) {
        if (closeFocusRef.current === 'center') centerRef.current?.focus();
        else (wasDrawerRef.current === 'rail' ? railButtonRef : contextButtonRef).current?.focus();
        closeFocusRef.current = 'toggle';
        wasDrawerRef.current = null;
      }
      return;
    }
    wasDrawerRef.current = drawer;
    const node = (drawer === 'rail' ? railRef : contextRef).current;
    const frame = requestAnimationFrame(() => node?.querySelector(focusable)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [drawer]);

  // Escape closes; Tab/Shift+Tab stay inside the open drawer.
  useEffect(() => {
    if (!drawer) return;
    const node = (drawer === 'rail' ? railRef : contextRef).current;
    const onKey = event => {
      if (event.key === 'Escape') { closeDrawers(); return; }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(focusable)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const inside = node.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, closeDrawers]);

  // Inert background while a modal drawer is open.
  useEffect(() => {
    if (!drawer) return;
    const background = [topbarRef.current, centerRef.current, drawer === 'rail' ? contextRef.current : railRef.current].filter(Boolean);
    background.forEach(el => { el.inert = true; });
    return () => background.forEach(el => { el.inert = false; });
  }, [drawer]);

  const railDialogProps = isMobile ? { role: 'dialog', 'aria-modal': railOpen ? 'true' : undefined, 'aria-label': t.navigation } : { 'aria-label': t.navigation };
  const contextDialogProps = isMobile ? { role: 'dialog', 'aria-modal': mobileContextOpen ? 'true' : undefined, 'aria-label': t.context } : { 'aria-label': t.context };

  return (
    <div className="wb">
      <header className="wb-topbar" ref={topbarRef}>
        {isMobile && (
          <button ref={railButtonRef} type="button" className="wb-icon-button" aria-label={railOpen ? t.closeNav : t.openNav} aria-expanded={railOpen} onClick={() => setRailOpen(open => !open)}>
            {railOpen ? <X aria-hidden="true" size={20} /> : <PanelLeft aria-hidden="true" size={20} />}
          </button>
        )}
        {brand}
        <div className="wb-spacer">{topbarEnd}</div>
        <button ref={contextButtonRef} type="button" className="wb-icon-button" aria-label={(isMobile ? mobileContextOpen : contextOpen) ? t.closeContext : t.openContext} aria-expanded={isMobile ? mobileContextOpen : contextOpen} onClick={() => isMobile ? setMobileContextOpen(open => !open) : onContextOpenChange(!contextOpen)}>
          <PanelRight aria-hidden="true" size={20} />
        </button>
      </header>
      <div className="wb-body" data-context-open={!isMobile && contextOpen ? 'true' : 'false'}>
        <aside ref={railRef} className="wb-rail" data-open={!isMobile || railOpen ? 'true' : 'false'} inert={isMobile && !railOpen} {...railDialogProps}
          onClick={event => { if (isMobile && event.target.closest('.wb-rail-item')) { closeFocusRef.current = 'center'; closeDrawers(); } }}>
          {rail}
        </aside>
        <main className="wb-center" ref={centerRef} tabIndex={-1}>{center}</main>
        {(!isMobile && contextOpen) || isMobile ? (
          <aside ref={contextRef} className="wb-context" data-open={!isMobile || mobileContextOpen ? 'true' : 'false'} inert={isMobile && !mobileContextOpen} {...contextDialogProps}>
            {context}
          </aside>
        ) : null}
      </div>
      {isMobile && <button type="button" className="wb-scrim" data-open={drawer ? 'true' : 'false'} aria-label={t.closeNav} tabIndex={drawer ? 0 : -1} onClick={() => closeDrawers()} />}
    </div>
  );
}
