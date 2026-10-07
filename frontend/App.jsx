import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { ApplicationShell } from '@/components/application-shell';
import { FeatureBoundary } from '@/components/feature-boundary';
import ComponentPreview from '@/components/component-preview';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { draftVault } from '@/lib/draft-vault';
import { DraftWorkspaceProvider } from '@/lib/suspended-draft';

// Bundled modules let migration lanes land independently. Missing lanes remain
// explicitly labeled; never substitute samples or claim an unfinished page works.
const modules = Object.fromEntries(Object.entries(import.meta.glob('./features/*/index.{js,jsx}', { eager: true })).map(([file, exports]) => [file.split('/')[2], exports]));
const views = ['chat', 'intake', 'customers', 'documents', 'settings'];
const viewLabels = { zh: { chat: '对话', intake: '材料与事实', customers: '客户库', documents: '文档', settings: '账户与设置' }, en: { chat: 'Conversation', intake: 'Materials and facts', customers: 'Customers', documents: 'Documents', settings: 'Account and settings' } };
const currentView = () => views.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'chat';

function PageUnavailable({ lang }) {
  return <Alert><AlertDescription>{lang === 'zh' ? '页面加载失败，请刷新重试。' : 'This page could not load. Refresh and try again.'}</AlertDescription></Alert>;
}

function AccountWorkspace({ lang, view, navigate }) {
  const { status, journey } = useSession();
  const [recoveredWorkspace] = useState(() => draftVault.read({ userId: status.userId, workspaceKey: 'active', feature: 'workspace' }));
  const [workspaceKey, setWorkspaceKey] = useState(() => recoveredWorkspace?.workspaceKey || crypto.randomUUID());
  const [caseId, setCaseId] = useState(() => recoveredWorkspace?.caseId || null);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [visited, setVisited] = useState(() => new Set([view]));
  const [importRequest, setImportRequest] = useState(null);
  const dirty = useRef({ chat: false, documents: false, intake: false });
  const userIdRef = useRef(status.userId);
  const caseIdRef = useRef(caseId);
  userIdRef.current = status.userId;
  caseIdRef.current = caseId;
  useLayoutEffect(() => {
    try {
      journey.setScope({ workspaceKey, caseId });
      journey.visit(view);
    } catch { /* Observability must not block navigation or private workspace cleanup. */ }
  }, [journey, workspaceKey, caseId, view]);
  useEffect(() => { setVisited(previous => previous.has(view) ? previous : new Set([...previous, view])); }, [view]);
  useEffect(() => {
    draftVault.write({ userId: status.userId, workspaceKey: 'active', feature: 'workspace' }, { caseId, view, workspaceKey });
  }, [status.userId, caseId, view, workspaceKey]);
  const markChatDirty = useCallback(value => { dirty.current.chat = value; }, []);
  const markDocumentsDirty = useCallback(value => { dirty.current.documents = value; }, []);
  const markIntakeDirty = useCallback(value => { dirty.current.intake = value; }, []);
  const openCase = useCallback(nextId => {
    if (nextId !== caseIdRef.current) {
      if (Object.values(dirty.current).some(Boolean) && !window.confirm(lang === 'zh' ? '切换案例会丢失当前未保存的输入，并停止正在进行的请求。继续？' : 'Switching cases clears unsaved input and stops active requests. Continue?')) return false;
      dirty.current = { chat: false, documents: false, intake: false };
      draftVault.clearWorkspace(userIdRef.current, workspaceKey);
      setWorkspaceKey(crypto.randomUUID());
      setImportRequest(null);
      setWorkspaceEpoch(value => value + 1);
      setCaseId(nextId);
    }
    navigate('chat');
    return true;
  }, [lang, navigate, workspaceKey]);
  const bindCurrentCase = useCallback(nextId => {
    // Saving this transient workspace is different from opening another case.
    setCaseId(nextId);
    setImportRequest(request => request ? { ...request, caseId: nextId } : null);
  }, []);
  const importFiles = useCallback((files, scope) => {
    if (scope && (scope.userId !== userIdRef.current || scope.caseId !== caseIdRef.current)) return;
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setImportRequest({ id: crypto.randomUUID(), userId: userIdRef.current, caseId: caseIdRef.current, files: selected });
    navigate('intake');
  }, [navigate]);
  const imported = useCallback(id => setImportRequest(request => request?.id === id ? null : request), []);
  const openIntake = useCallback(() => navigate('intake'), [navigate]);
  const openDocuments = useCallback(() => navigate('documents'), [navigate]);
  const slots = {
    chat: [modules.chat?.ChatPage, { caseId, onCaseChange: bindCurrentCase, onDirtyChange: markChatDirty, onImportFiles: importFiles }],
    intake: [modules.intake?.IntakePage, { caseId, onCaseChange: bindCurrentCase, onDirtyChange: markIntakeDirty, importRequest, onImportHandled: imported, onOpenDocuments: openDocuments, active: view === 'intake' }],
    customers: [modules.customers?.CustomersPage, { onOpenCase: openCase, active: view === 'customers' }],
    documents: [modules.documents?.DocumentsPage, { caseId, onDirtyChange: markDocumentsDirty, onOpenIntake: openIntake, active: view === 'documents' }],
    settings: [modules.auth?.SettingsPage, {}]
  };
  return <DraftWorkspaceProvider userId={status.userId} workspaceKey={workspaceKey}>{views.filter(id => visited.has(id) || id === view).map(id => {
    const [Page, props] = slots[id];
    // Explicit case switches remount after the dirty guard. First-save binding
    // keeps the current chat composer mounted, including prepared image previews.
    const key = ['chat', 'intake', 'documents'].includes(id) ? `${id}:${workspaceEpoch}` : id;
    return <section key={key} hidden={view !== id} aria-label={viewLabels[lang][id]}><FeatureBoundary lang={lang}>{Page ? <Page lang={lang} {...props} /> : <PageUnavailable lang={lang} />}</FeatureBoundary></section>;
  })}</DraftWorkspaceProvider>;
}

export default function App() {
  const [lang, setLang] = useState('zh');
  const [view, setView] = useState(currentView);
  const { status, loading, error, recovery, refresh } = useSession();
  const navigate = useCallback(next => {
    if (!views.includes(next)) return;
    setView(next);
    if (window.location.hash !== `#${next}`) window.history.pushState({}, '', `#${next}`);
  }, []);
  useEffect(() => {
    const followHistory = () => setView(currentView());
    window.addEventListener('popstate', followHistory);
    window.addEventListener('hashchange', followHistory);
    return () => { window.removeEventListener('popstate', followHistory); window.removeEventListener('hashchange', followHistory); };
  }, []);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; document.title = lang === 'zh' ? '巢小秘 · Nestlet' : 'Nestlet'; }, [lang]);
  if (window.location.hash === '#components') return <ComponentPreview />;
  const AuthPanel = modules.auth?.AuthPanel;
  const AccountControls = modules.auth?.AccountControls;
  const authenticated = result => {
    const workspace = result?.userId ? draftVault.read({ userId: result.userId, workspaceKey: 'active', feature: 'workspace' }) : null;
    navigate(workspace?.view || 'chat');
  };
  return <ApplicationShell lang={lang} view={view} onNavigate={status.authenticated ? navigate : undefined}
    onLanguageChange={() => setLang(value => value === 'zh' ? 'en' : 'zh')}
    account={status.authenticated ? <><Button variant="outline" size="sm" onClick={() => navigate('settings')} aria-label={lang === 'zh' ? '账户与设置' : 'Account and settings'}><Settings aria-hidden="true" /></Button>{AccountControls && <AccountControls lang={lang} />}</> : null}>
    {recovery === 'suspended' && <Alert className="mb-5"><AlertDescription>{lang === 'zh' ? '登录已过期。请在 30 分钟内使用同一账号重新登录，并保持当前页面打开，以恢复未保存的文字。' : 'Your session expired. Keep this page open and sign in with the same account within 30 minutes to recover unsaved text.'}</AlertDescription></Alert>}
    {recovery === 'restored' && <Alert className="mb-5"><AlertDescription>{lang === 'zh' ? '已恢复未保存的文字，请重新添加图片和文件。' : 'Unsaved text restored. Reattach images and files.'}</AlertDescription></Alert>}
    {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{lang === 'zh' ? '连接状态未能刷新，请重试。' : 'Connection status could not be refreshed. Try again.'}<Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>{lang === 'zh' ? '重试' : 'Retry'}</Button></AlertDescription></Alert>}
    {loading ? <div role="status" aria-label={lang === 'zh' ? '正在连接' : 'Connecting'} className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-60 w-full" /></div> : status.authenticated && status.userId ? <AccountWorkspace key={status.userId} lang={lang} view={view} navigate={navigate} /> : AuthPanel ? <AuthPanel lang={lang} onAuthenticated={authenticated} /> : <Card><CardHeader><CardTitle>{lang === 'zh' ? '登录后继续' : 'Sign in to continue'}</CardTitle></CardHeader><CardContent><PageUnavailable lang={lang} /></CardContent></Card>}
  </ApplicationShell>;
}
