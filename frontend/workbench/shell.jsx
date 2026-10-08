import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { PanelLeft, PanelRight, X } from 'lucide-react';
const copy={zh:{openNav:'打开客户与事项列表',closeNav:'关闭列表',openContext:'打开案例上下文',closeContext:'关闭上下文',navigation:'客户与事项',context:'案例上下文',skip:'跳到工作区'},en:{openNav:'Open customers and cases',closeNav:'Close list',openContext:'Open case context',closeContext:'Close context',navigation:'Customers and cases',context:'Case context',skip:'Skip to workspace'}};
const query='(max-width: 960px)';
const externalModal=()=>[...document.querySelectorAll('[role="dialog"][aria-modal="true"],[data-slot="dialog-content"][data-state="open"]')].some(node=>!node.closest('.wb'));
const selector='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
/** Stable desktop/sidebar hosts retain their React portals and feature state.
 * One modal drawer at a time on mobile; no business-state decisions live here. */
export function WorkbenchShell({lang='zh',brand,topbarEnd,rail,center,context,contextOpen,onContextOpenChange,navigationKey}){
 const t=copy[lang]||copy.zh,id=useId();
 const [mobile,setMobile]=useState(()=>window.matchMedia?.(query).matches===true),[drawer,setDrawer]=useState(null);
 const railRef=useRef(null),contextRef=useRef(null),mainRef=useRef(null),railToggle=useRef(null),contextToggle=useRef(null),previousDrawer=useRef(null),focusCenter=useRef(false),previousNavigation=useRef(navigationKey);
 const close=useCallback(()=>setDrawer(null),[]);
 useEffect(()=>{const media=window.matchMedia?.(query);if(!media)return;const change=event=>{setMobile(event.matches);close();};media.addEventListener?.('change',change);return()=>media.removeEventListener?.('change',change);},[close]);
 useEffect(()=>{document.body.classList.add('wb-theme');return()=>document.body.classList.remove('wb-theme');},[]);
 useEffect(()=>{if(previousNavigation.current!==navigationKey){previousNavigation.current=navigationKey;focusCenter.current=true;close();}},[navigationKey,close]);
 const modal=mobile?drawer:null;
 useLayoutEffect(()=>{
  if(!modal){if(previousDrawer.current){const toggle=previousDrawer.current==='rail'?railToggle.current:contextToggle.current;if(!externalModal())(focusCenter.current?mainRef.current:toggle||mainRef.current)?.focus();previousDrawer.current=null;focusCenter.current=false;}return;}
  previousDrawer.current=modal;const node=(modal==='rail'?railRef:contextRef).current;node?.querySelector('[data-drawer-close]')?.focus();
 },[modal]);
 useEffect(()=>{
  if(!modal)return;const node=(modal==='rail'?railRef:contextRef).current;
  const key=event=>{if(externalModal()){close();return;}if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab'||!node)return;
   const items=[...node.querySelectorAll(selector)].filter(el=>!el.closest('[hidden],[inert]')&&el.getClientRects().length>0);
   if(!items.length){event.preventDefault();node.focus();return;}
   const first=items[0],last=items.at(-1),inside=node.contains(document.activeElement);
   if(event.shiftKey&&(!inside||document.activeElement===first)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(!inside||document.activeElement===last)){event.preventDefault();first.focus();}
  };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[modal,close]);
 useEffect(()=>{
  if(!modal)return;const reconcile=()=>{if(externalModal())close();};
  const observer=new MutationObserver(reconcile);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['role','aria-modal','data-state']});reconcile();return()=>observer.disconnect();
 },[modal,close]);
 const railHidden=mobile&&modal!=='rail',contextHidden=mobile?modal!=='context':!contextOpen;
 const dialogProps=name=>mobile?{role:'dialog','aria-modal':modal===name?'true':undefined}:{};
 return <div className="wb">
  <a href="#workspace" className="inbox-skip" inert={!!modal} onClick={event=>{event.preventDefault();mainRef.current?.focus();}}>{t.skip}</a>
  <header className="wb-topbar" inert={!!modal}>
   {mobile&&<button ref={railToggle} type="button" className="wb-icon-button" aria-label={t.openNav} aria-controls={`${id}-rail`} aria-expanded={modal==='rail'} onClick={()=>setDrawer('rail')}><PanelLeft aria-hidden="true" size={20}/></button>}
   {brand}<div className="wb-spacer">{topbarEnd}</div>
   <button ref={contextToggle} type="button" className="wb-icon-button" aria-label={(!mobile&&contextOpen)?t.closeContext:t.openContext} aria-controls={`${id}-context`} aria-expanded={mobile?modal==='context':contextOpen} onClick={()=>mobile?setDrawer('context'):onContextOpenChange(!contextOpen)}><PanelRight aria-hidden="true" size={20}/></button>
  </header>
  <div className="wb-body" data-context-open={!mobile&&contextOpen?'true':'false'}>
   <aside ref={railRef} id={`${id}-rail`} className="wb-rail" data-open={!railHidden?'true':'false'} hidden={railHidden} inert={railHidden||!!modal&&modal!=='rail'} tabIndex={-1} aria-label={t.navigation} {...dialogProps('rail')} onClick={event=>{if(mobile&&!event.defaultPrevented&&event.target.closest('.wb-rail-item')){focusCenter.current=true;close();}}}>
    {mobile&&<button type="button" className="wb-icon-button" data-drawer-close aria-label={t.closeNav} onClick={close}><X aria-hidden="true"/></button>}{rail}
   </aside>
   <main id="workspace" className="wb-center" ref={mainRef} tabIndex={-1} inert={!!modal}>{center}</main>
   <aside ref={contextRef} id={`${id}-context`} className="wb-context" data-open={!contextHidden?'true':'false'} hidden={contextHidden} inert={contextHidden||!!modal&&modal!=='context'} tabIndex={-1} aria-label={t.context} {...dialogProps('context')}>
    {mobile&&<button type="button" className="wb-icon-button" data-drawer-close aria-label={t.closeContext} onClick={close}><X aria-hidden="true"/></button>}{context}
   </aside>
  </div>
  {mobile&&<button type="button" className="wb-scrim" data-open={modal?'true':'false'} aria-label={modal==='context'?t.closeContext:t.closeNav} tabIndex={-1} aria-hidden="true" onClick={close}/>}
 </div>;
}
