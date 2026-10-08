import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';

const copy = {
  zh: { openNav: '打开客户与事项列表', closeNav: '关闭列表', openContext: '打开案例上下文', closeContext: '关闭上下文', context: '案例上下文' },
  en: { openNav: 'Open customers and cases', closeNav: 'Close list', openContext: 'Open case context', closeContext: 'Close context', context: 'Case context' }
};

const mobileQuery = '(max-width: 960px)';

/** Inbox-style three-column shell. Rail and context are columns on desktop,
 *  modal drawers below 960px. Presentation only; no business state here. */
export function WorkbenchShell({ lang = 'zh', brand, topbarEnd, rail, center, context, contextOpen, onContextOpenChange }) {
  const t = copy[lang] || copy.zh;
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(mobileQuery).matches);
  const [railOpen, setRailOpen] = useState(false);
  const railButtonRef = useRef(null);
  const contextButtonRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const onChange = event => { setIsMobile(event.matches); if (!event.matches) setRailOpen(false); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const anyDrawerOpen = isMobile && (railOpen || contextOpen);
  const closeDrawers = useCallback(() => { setRailOpen(false); onContextOpenChange(false); }, [onContextOpenChange]);

  useEffect(() => {
    if (!anyDrawerOpen) return;
    const onKey = event => { if (event.key === 'Escape') { closeDrawers(); (railOpen ? railButtonRef : contextButtonRef).current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anyDrawerOpen, railOpen, closeDrawers]);

  // Return focus to the toggle when a drawer closes on mobile.
  const toggleRail = () => setRailOpen(open => { if (open) railButtonRef.current?.focus(); return !open; });
  const toggleContext = () => onContextOpenChange(!contextOpen);

  return (
    <div className="wb">
      <header className="wb-topbar">
        {isMobile && (
          <button ref={railButtonRef} type="button" className="wb-icon-button" aria-label={railOpen ? t.closeNav : t.openNav} aria-expanded={railOpen} onClick={toggleRail}>
            {railOpen ? <X aria-hidden="true" size={20} /> : <PanelLeft aria-hidden="true" size={20} />}
          </button>
        )}
        {brand}
        <div className="wb-spacer">{topbarEnd}</div>
        <button ref={contextButtonRef} type="button" className="wb-icon-button" aria-label={contextOpen ? t.closeContext : t.openContext} aria-expanded={contextOpen} onClick={toggleContext}>
          <PanelRight aria-hidden="true" size={20} />
        </button>
      </header>
      <div className="wb-body" data-context-open={!isMobile && contextOpen ? 'true' : 'false'}>
        <aside className="wb-rail" data-open={!isMobile || railOpen ? 'true' : 'false'} aria-hidden={isMobile && !railOpen}>
          {rail}
        </aside>
        <main className="wb-center">{center}</main>
        {(!isMobile && contextOpen) || isMobile ? (
          <aside className="wb-context" data-open={!isMobile || contextOpen ? 'true' : 'false'} aria-hidden={isMobile && !contextOpen} aria-label={t.context}>
            {context}
          </aside>
        ) : null}
      </div>
      {isMobile && <button type="button" className="wb-scrim" data-open={anyDrawerOpen ? 'true' : 'false'} aria-label={t.closeNav} tabIndex={anyDrawerOpen ? 0 : -1} onClick={closeDrawers} />}
    </div>
  );
}
