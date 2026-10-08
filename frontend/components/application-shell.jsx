import { useState } from 'react';
import { WorkbenchShell } from '@/workbench/shell';
import { MessageSquare, Users, FileText, Files, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navigation = {
  zh: [['chat', '对话', MessageSquare], ['intake', '材料与事实', Files], ['customers', '客户库', Users], ['documents', '文档', FileText]],
  en: [['chat', 'Conversation', MessageSquare], ['intake', 'Materials & facts', Files], ['customers', 'Customers', Users], ['documents', 'Documents', FileText]]
};

export function ApplicationShell({ children, lang = 'zh', onLanguageChange, view = 'chat', onNavigate, account, migrationNotice, inbox = false, rail, context, onNewCase }) {
  const [contextOpen, setContextOpen] = useState(true);
  if (inbox) return <WorkbenchShell lang={lang} contextOpen={contextOpen} onContextOpenChange={setContextOpen}
    brand={<span className="wb-brand"><img src="/logo.svg" alt="" width="24" height="24" /><span>{lang === 'zh' ? '巢小秘' : 'Nestlet'}</span></span>}
    topbarEnd={<>{account}<Button variant="ghost" size="sm" onClick={onLanguageChange} aria-label={lang === 'zh' ? 'Switch interface to English' : '切换界面为中文'}><Globe aria-hidden="true" /><span lang={lang === 'zh' ? 'en' : 'zh-CN'}>{lang === 'zh' ? 'EN' : '中文'}</span></Button></>}
    rail={<><button type="button" className="wb-rail-item" onClick={onNewCase}>{lang === 'zh' ? '新事项' : 'New case'}</button>{rail}</>}
    context={context} center={<><nav className="inbox-navigation wb-tabs" aria-label={lang === 'zh' ? '工作区导航' : 'Workspace navigation'}>{navigation[lang].map(([id,label,Icon]) => <button key={id} type="button" className="wb-tab" aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon aria-hidden="true" size={18}/>{label}</button>)}</nav>{children}</>} />;
  return <div className="paper-shell">
    <a href="#workspace" className="sr-only focus:not-sr-only focus:block focus:py-2">{lang === 'zh' ? '跳到工作区' : 'Skip to workspace'}</a>
    <header className="paper-masthead">
      <a href="/" className="paper-brand flex min-w-0 items-center gap-3 text-inherit no-underline" aria-label="Nestlet">
        <img src="/logo.svg" alt="" width="40" height="40" />
        <div className="paper-title min-w-0 text-[23px] font-bold leading-tight">{lang === 'zh' ? '巢小秘' : 'Nestlet'}<span className="paper-tagline mt-1 block font-sans text-[10px] font-normal tracking-[.14em] text-muted-foreground">{lang === 'zh' ? 'NESTLET' : 'ONE DOCUMENT. ONE STEP FORWARD.'}</span></div>
      </a>
      <div className="paper-tools flex min-w-0 flex-wrap items-center justify-end gap-2">
        {account}
        <Button variant="outline" size="sm" onClick={onLanguageChange} aria-label={lang === 'zh' ? 'Switch interface to English' : '切换界面为中文'}><Globe aria-hidden="true" /><span lang={lang === 'zh' ? 'en' : 'zh-CN'}>{lang === 'zh' ? 'English' : '中文'}</span></Button>
      </div>
    </header>
    {migrationNotice && <p className="paper-note mt-7 rounded-r-lg px-4 py-3 text-sm leading-relaxed">{migrationNotice}</p>}
    {onNavigate && <nav aria-label={lang === 'zh' ? '工作区导航' : 'Workspace navigation'} className="mt-8 mb-7 flex flex-wrap gap-1 border-b border-border pb-3">
      {navigation[lang].map(([id, label, Icon]) => <Button key={id} variant={view === id ? 'secondary' : 'ghost'} onClick={() => onNavigate(id)} aria-current={view === id ? 'page' : undefined}><Icon aria-hidden="true" />{label}</Button>)}
    </nav>}
    <main id="workspace" tabIndex={-1} className="mt-8 outline-none">{children}</main>

  </div>;
}
