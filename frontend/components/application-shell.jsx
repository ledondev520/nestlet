import { MessageSquare, Users, FileText, Files, Globe, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navigation = {
  zh: [['chat', '对话', MessageSquare], ['intake', '材料与事实', Files], ['customers', '客户库', Users], ['documents', '文档', FileText]],
  en: [['chat', 'Conversation', MessageSquare], ['intake', 'Materials & facts', Files], ['customers', 'Customers', Users], ['documents', 'Documents', FileText]]
};

export function ApplicationShell({ children, lang = 'zh', onLanguageChange, view = 'chat', onNavigate, account, migrationNotice }) {
  return <div className="paper-shell">
    <a href="#workspace" className="sr-only focus:not-sr-only focus:block focus:py-2">{lang === 'zh' ? '跳到工作区' : 'Skip to workspace'}</a>
    <header className="paper-masthead">
      <a href="/next/" className="paper-brand flex min-w-0 items-center gap-3 text-inherit no-underline" aria-label="Nestlet">
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
    <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
      <p>{lang === 'zh' ? '仅限虚构或去标识化资料 · 不自动发送或提交' : 'Synthetic or de-identified material only · No automatic sending or submission'}</p>
      <a href="/" className="inline-flex items-center gap-1 underline underline-offset-4"><ArrowLeft size={13} aria-hidden="true" />{lang === 'zh' ? '现有工作区' : 'Existing workspace'}</a>
    </footer>
  </div>;
}
