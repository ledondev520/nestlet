import { useCallback, useState } from 'react';
import { useSession } from '@/lib/session';
import { FeatureBoundary } from '@/components/feature-boundary';
import { AuthPanel } from '@/features/auth';
import { SettingsPage } from '@/features/auth';
import { ChatPage } from '@/features/chat';
import { IntakeWorkspace } from '@/features/intake/workspace';
import { CustomerWorkspace } from '@/features/customers/workspace';
import { DocumentsPage } from '@/features/documents';
import { WorkbenchShell } from './shell.jsx';
import { CaseRail } from './case-rail.jsx';
import { ContextPanel } from './context-panel.jsx';
import { DEFAULT_GUIDANCE_AGENCY } from '../../public/agency-guidance.js';

const copy = {
  zh: { chat: '对话', intake: '材料', documents: '文书', customers: '客户', settings: '设置', untitled: '未命名事项', switchTo: '切换界面为英文' },
  en: { chat: 'Chat', intake: 'Materials', documents: 'Documents', customers: 'Customers', settings: 'Settings', untitled: 'Untitled case', switchTo: 'Switch interface to Chinese' }
};
const views = ['chat', 'intake', 'documents', 'customers', 'settings'];

/** Workbench composition: chat-first center, case rail left, context right.
 *  Real feature components are imported and reused unchanged; this file owns
 *  layout composition only — no business logic, no functional edits. */
export function WorkbenchApp() {
  const { status, api, journey } = useSession();
  const [lang, setLang] = useState('zh');
  const [view, setView] = useState('chat');
  const [caseId, setCaseId] = useState(null);
  const [caseTitle, setCaseTitle] = useState('');
  const [guidanceAgency, setGuidanceAgency] = useState(DEFAULT_GUIDANCE_AGENCY);
  const [contextOpen, setContextOpen] = useState(true);
  const t = copy[lang];

  const selectCase = useCallback((nextId, title = '') => {
    setCaseId(nextId);
    setCaseTitle(title);
    setView('chat');
  }, []);

  if (!status.authenticated) {
    return (
      <div className="wb" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <AuthPanel lang={lang} onAuthenticated={() => {}} />
      </div>
    );
  }

  const noop = () => {};
  const center = (
    <>
      <div className="wb-case-header">
        <span className="wb-case-title">{caseTitle}</span>
        <nav className="wb-tabs" aria-label="views">
          {views.map(name => (
            <button
              key={name}
              type="button"
              className="wb-tab"
              aria-current={view === name ? 'true' : undefined}
              onClick={() => setView(name)}
            >{t[name]}</button>
          ))}
        </nav>
      </div>
      <FeatureBoundary lang={lang}>
        {view === 'chat' && <ChatPage lang={lang} caseId={caseId} guidanceAgency={guidanceAgency} onCaseChange={selectCase} onDirtyChange={noop} onReviewMessage={noop} />}
        {view === 'intake' && <IntakeWorkspace api={api} status={status} journey={journey} lang={lang} caseId={caseId} onCaseChange={selectCase} onDirtyChange={noop} importRequest={null} onImportHandled={noop} textReviewRequest={null} onTextReviewHandled={noop} onOpenDocuments={() => setView('documents')} />}
        {view === 'documents' && <DocumentsPage lang={lang} caseId={caseId} onDirtyChange={noop} onOpenIntake={() => setView('intake')} />}
        {view === 'customers' && <CustomerWorkspace api={api} lang={lang} onOpenCase={selectCase} />}
        {view === 'settings' && <SettingsPage lang={lang} />}
      </FeatureBoundary>
    </>
  );

  return (
    <WorkbenchShell
      lang={lang}
      contextOpen={contextOpen}
      onContextOpenChange={setContextOpen}
      brand={<span className="wb-brand"><img src="/logo.svg" alt="" width={22} height={22} />Nestlet 巢小秘</span>}
      topbarEnd={
        <button type="button" className="wb-icon-button" style={{ fontSize: 13, paddingInline: 12 }} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} aria-label={t.switchTo}>
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      }
      rail={<CaseRail lang={lang} selectedCaseId={caseId} onSelectCase={selectCase} />}
      center={center}
      context={<ContextPanel lang={lang} caseId={caseId} guidanceAgency={guidanceAgency} onAgencyChange={setGuidanceAgency} />}
    />
  );
}
