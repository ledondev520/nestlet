import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { ModelSettingsPopover } from '@/components/model-settings-popover';
import { ApplicationShell } from '@/components/application-shell';
import { FeatureBoundary } from '@/components/feature-boundary';
import ComponentPreview from '@/components/component-preview';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { draftVault } from '@/lib/draft-vault';
import { captureAuthFragment } from '@/features/auth/auth-route';
import { DraftWorkspaceProvider } from '@/lib/suspended-draft';
import { ConversationRail } from '@/workbench/conversation-rail';
import { useScopedRead } from '@/lib/use-scoped-read';
import { conversationFromHash, conversationHref, readConversationIndex } from '@/lib/conversation-index';
import { ContextPanel } from '@/workbench/context-panel';
import { handoffMatches } from '@/lib/conversation-handoff';
import { DEFAULT_GUIDANCE_AGENCY } from '../public/agency-guidance.js';

// Bundled modules let migration lanes land independently. Missing lanes remain
// explicitly labeled; never substitute samples or claim an unfinished page works.
const modules = Object.fromEntries(Object.entries(import.meta.glob('./features/*/index.{js,jsx}', { eager: true })).map(([file, exports]) => [file.split('/')[2], exports]));
const views = ['chat', 'intake', 'customers', 'documents', 'settings'];
const viewLabels = { zh: { chat: '对话', intake: '材料与事实', customers: '客户库', documents: '文档', settings: '账户与设置' }, en: { chat: 'Conversation', intake: 'Materials and facts', customers: 'Customers', documents: 'Documents', settings: 'Account and settings' } };
const currentView = () => views.includes(window.location.hash.slice(1).split('?')[0]) ? window.location.hash.slice(1).split('?')[0] : 'chat';

function PageUnavailable({ lang }) {
  return <Alert><AlertDescription>{lang === 'zh' ? '页面加载失败，请刷新重试。' : 'This page could not load. Refresh and try again.'}</AlertDescription></Alert>;
}

function AccountWorkspace({ lang, view, navigate, shellProps, notices }) {
  const { status, journey, api, dataRevision } = useSession();
  const [conversationRevision,setConversationRevision] = useState(0);
  const refreshConversations = useCallback(()=>setConversationRevision(value=>value+1),[]);
  const conversationIndex = useScopedRead(api,JSON.stringify([status.userId,dataRevision,conversationRevision]),signal=>readConversationIndex(api,signal));
  const [requestedConversationId,setRequestedConversationId] = useState(null);
  const [activeConversationId,setActiveConversationId] = useState(null);
  const [conversationRouteError,setConversationRouteError] = useState(false);
  const handledConversationHash = useRef(null);
  const [recoveredWorkspace] = useState(() => draftVault.read({ userId: status.userId, workspaceKey: 'active', feature: 'workspace' }));
  const [workspaceKey, setWorkspaceKey] = useState(() => recoveredWorkspace?.workspaceKey || crypto.randomUUID());
  const [caseId, setCaseId] = useState(() => recoveredWorkspace?.caseId || null);
  const [workflowTarget, setWorkflowTarget] = useState(null);
  const [lookupTarget, setLookupTarget] = useState(null);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  // Reference selection is transient and cannot write or confirm the case's PHA.
  const [guidanceAgency, setGuidanceAgency] = useState(DEFAULT_GUIDANCE_AGENCY);
  const [visited, setVisited] = useState(() => new Set([view]));
  const [importRequest, setImportRequest] = useState(null);
  const [textReviewRequest, setTextReviewRequest] = useState(null);
  const textReviewRef = useRef(null); textReviewRef.current = textReviewRequest;
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
  const openCase = useCallback((nextId, destination = 'chat', fresh = false, preserveRoute = false) => {
    if (fresh || nextId !== caseIdRef.current) {
      if (Object.values(dirty.current).some(Boolean) && !window.confirm(lang === 'zh' ? '切换案例会丢失当前未保存的输入，并停止正在进行的请求。继续？' : 'Switching cases clears unsaved input and stops active requests. Continue?')) return false;
      dirty.current = { chat: false, documents: false, intake: false };
      draftVault.clearWorkspace(userIdRef.current, workspaceKey);
      setWorkspaceKey(crypto.randomUUID());
      setImportRequest(null);
      setTextReviewRequest(null);
      setWorkspaceEpoch(value => value + 1);
      setGuidanceAgency(DEFAULT_GUIDANCE_AGENCY);
      setCaseId(nextId);
      setRequestedConversationId(null);
      setActiveConversationId(null);
    }
    navigate(destination,{preserveRoute});
    return true;
  }, [lang, navigate, workspaceKey]);
  const openConversation = useCallback((row,{fromHistory=false}={}) => {
    if(!row || !conversationIndex.data?.some(item=>item.id===row.id&&item.caseId===row.caseId))return false;
    const previousHash=conversationHref(activeConversationId||'');
    if(row.id===activeConversationId){navigate('chat',{preserveRoute:true});return true;}
    if(!openCase(row.caseId,'chat',true,fromHistory)){
      if(fromHistory)window.history.replaceState({},'',activeConversationId?previousHash:'#chat');
      return false;
    }
    setRequestedConversationId(row.id);setActiveConversationId(row.id);setConversationRouteError(false);
    const href=conversationHref(row.id);handledConversationHash.current=href;
    window.history.replaceState({},'',href);
    return true;
  },[conversationIndex.data,activeConversationId,openCase,navigate]);
  useEffect(()=>{
    const follow=()=>{
      const hash=window.location.hash,id=conversationFromHash(hash);
      if(!id||hash===handledConversationHash.current||conversationIndex.phase!=='ready')return;
      handledConversationHash.current=hash;
      const row=conversationIndex.data.find(item=>item.id===id);
      if(row)openConversation(row,{fromHistory:true});else setConversationRouteError(true);
    };
    follow();window.addEventListener('hashchange',follow);window.addEventListener('popstate',follow);
    return()=>{window.removeEventListener('hashchange',follow);window.removeEventListener('popstate',follow);};
  },[conversationIndex,openConversation]);
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
  const reviewConversation = useCallback(request => {
    if (!handoffMatches(request, userIdRef.current, caseIdRef.current)) return false;
    const pending = textReviewRef.current;
    if (pending && pending.messageId !== request.messageId && !window.confirm(lang === 'zh' ? '已有另一段对话待核对。改为核对本段？现有材料不会改变。' : 'Review this message instead of the pending conversation text? Existing material will stay unchanged.')) return false;
    if (!pending || pending.messageId !== request.messageId) { textReviewRef.current = request; setTextReviewRequest(request); }
    navigate('intake');
    return true;
  }, [lang, navigate]);
  const reviewedConversation = useCallback(id => setTextReviewRequest(request => request?.id === id ? null : request), []);
  const continueDocument = useCallback(scope => {
    if (scope && (scope.userId !== userIdRef.current || scope.caseId !== caseIdRef.current)) return false;
    // The existing materials editor owns its unsaved facts and file work. Finish
    // that work first rather than generate a document from an older saved case.
    if (dirty.current.intake || textReviewRef.current) {
      navigate('intake');
      return false;
    }
    navigate('documents');
    return true;
  }, [navigate]);
  const openSourceCase = useCallback(request => {
    if (!request || request.userId !== userIdRef.current || request.caseId !== caseIdRef.current ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(request.targetCaseId) ||
        !['chat', 'intake', 'documents'].includes(request.view)) return false;
    // Same-case continuation preserves the mounted editors and material guard.
    if (request.targetCaseId === caseIdRef.current && request.view === 'documents') return continueDocument(request);
    return openCase(request.targetCaseId, request.view);
  }, [openCase, continueDocument]);
  const slots = {
    chat: [modules.chat?.ChatPage, { caseId, initialConversationId: requestedConversationId, conversationIndex, onOpenConversation: openConversation, onConversationChange: setActiveConversationId, onHistoryChange: refreshConversations, onNewConversation: () => openCase(null, 'chat', true), guidanceAgency, workflowTarget, lookupTarget, onCaseChange: bindCurrentCase, onDirtyChange: markChatDirty, onImportFiles: importFiles, onReviewMessage: reviewConversation, onOpenMaterials: openIntake, onOpenDocuments: continueDocument, onOpenSourceCase: openSourceCase, active: view === 'chat' }],
    intake: [modules.intake?.IntakePage, { caseId, onCaseChange: bindCurrentCase, onDirtyChange: markIntakeDirty, importRequest, onImportHandled: imported, textReviewRequest, onTextReviewHandled: reviewedConversation, onOpenDocuments: openDocuments, active: view === 'intake' }],
    customers: [modules.customers?.CustomersPage, { onOpenCase: openCase, active: view === 'customers' }],
    documents: [modules.documents?.DocumentsPage, { caseId, onDirtyChange: markDocumentsDirty, onOpenIntake: openIntake, active: view === 'documents' }],
    settings: [modules.auth?.SettingsPage, { active: view === 'settings' }]
  };
  return <DraftWorkspaceProvider userId={status.userId} workspaceKey={workspaceKey}>
    <ApplicationShell {...shellProps} inbox navigationKey={`${view}:${caseId}:${workspaceEpoch}`}
      rail={<><div ref={setLookupTarget} /><ConversationRail lang={lang} state={conversationIndex} selectedId={activeConversationId} onOpen={openConversation} onRetry={refreshConversations} /></>}
      context={<><div ref={setWorkflowTarget} /><ContextPanel lang={lang} caseId={caseId} guidanceAgency={guidanceAgency} onAgencyChange={setGuidanceAgency} onOpenMaterials={openIntake} onOpenDocuments={() => continueDocument({ userId: status.userId, caseId })} refreshKey={view} showCaseDetails={view !== 'chat'} showGuidance={['chat','intake','documents'].includes(view)} /></>}
      onNewCase={() => openCase(null, 'chat', true)}>
    {notices}
    {conversationRouteError&&<Alert variant="destructive"><AlertDescription>{lang==='zh'?'当前账号无法打开这段对话。请从左侧选择自己的对话。':'This conversation is unavailable to this account. Choose a conversation from the list.'}</AlertDescription></Alert>}
    {views.filter(id => visited.has(id) || id === view).map(id => {
    const [Page, props] = slots[id];
    // Explicit case switches remount after the dirty guard. First-save binding
    // keeps the current chat composer mounted, including prepared image previews.
    const key = ['chat', 'intake', 'documents'].includes(id) ? `${id}:${workspaceEpoch}` : id;
    return <section key={key} hidden={view !== id} aria-label={viewLabels[lang][id]}><FeatureBoundary lang={lang}>{Page ? <Page lang={lang} {...props} /> : <PageUnavailable lang={lang} />}</FeatureBoundary></section>;
  })}</ApplicationShell></DraftWorkspaceProvider>;
}

export default function App({ initialAuthLink = null }) {
  const [authLink, setAuthLink] = useState(initialAuthLink);
  const authLinkRef = useRef(initialAuthLink);
  const handledUrl = useRef(window.location.href);
  const replaceAuthLink = useCallback(next => { authLinkRef.current?.clear(); authLinkRef.current = next; setAuthLink(next); }, []);
  const [lang, setLang] = useState('zh');
  const [view, setView] = useState(currentView);
  const { status, loading, error, recovery, refresh } = useSession();
  const navigate = useCallback((next,{preserveRoute=false}={}) => {
    if (!views.includes(next)) return;
    replaceAuthLink(null);
    setView(next);
    if (!preserveRoute && window.location.hash !== `#${next}`) window.history.pushState({}, '', `#${next}`);
    handledUrl.current = window.location.href;
  }, [replaceAuthLink]);
  useEffect(() => {
    const followHistory = event => {
      // A history traversal may dispatch both popstate and hashchange. Capture once.
      if (window.location.href === handledUrl.current) {
        // Back/Forward can traverse adjacent scrubbed root entries. Even when
        // the URL is unchanged, that navigation must discard a live link.
        if (event.type === 'popstate') { replaceAuthLink(null); setView(currentView()); }
        return;
      }
      const next = captureAuthFragment(window);
      handledUrl.current = window.location.href;
      replaceAuthLink(next); setView(currentView());
    };
    const clearSecret = () => { authLinkRef.current?.clear(); };
    window.addEventListener('pagehide', clearSecret);
    window.addEventListener('popstate', followHistory);
    window.addEventListener('hashchange', followHistory);
    return () => { window.removeEventListener('popstate', followHistory); window.removeEventListener('hashchange', followHistory); window.removeEventListener('pagehide', clearSecret); };
  }, [replaceAuthLink]);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; document.title = lang === 'zh' ? '巢小秘 · Nestlet' : 'Nestlet'; }, [lang]);
  const AuthPanel = modules.auth?.AuthPanel;
  const EmailLinkPanel = modules.auth?.EmailLinkPanel;
  const AccountControls = modules.auth?.AccountControls;
  const previousIdentity = useRef(status.userId);
  useEffect(() => {
    if (previousIdentity.current && previousIdentity.current !== status.userId) replaceAuthLink(null);
    previousIdentity.current = status.userId;
  }, [status.userId, replaceAuthLink]);
  const authenticated = result => {
    const workspace = result?.userId ? draftVault.read({ userId: result.userId, workspaceKey: 'active', feature: 'workspace' }) : null;
    navigate(workspace?.view || 'chat');
  };
  if (window.location.hash === '#components') return <ComponentPreview />;
  const shellProps = { lang, view, onNavigate: status.authenticated ? navigate : undefined, onLanguageChange: () => setLang(value => value === 'zh' ? 'en' : 'zh'), model: status.authenticated ? <ModelSettingsPopover key={`${status.userId}:${view}`} lang={lang} active={!authLink && !loading && view !== 'settings'} /> : null, account: status.authenticated ? <><Button variant="outline" size="sm" data-account-settings onClick={() => navigate('settings')} aria-label={lang === 'zh' ? '账户与设置' : 'Account and settings'}><Settings aria-hidden="true" /></Button>{AccountControls && <AccountControls lang={lang} />}</> : null };
  const notices = <>
    {recovery === 'suspended' && <Alert className="mb-5"><AlertDescription>{lang === 'zh' ? '登录已过期。请在 30 分钟内使用同一账号重新登录，并保持当前页面打开，以恢复未保存的文字。' : 'Your session expired. Keep this page open and sign in with the same account within 30 minutes to recover unsaved text.'}</AlertDescription></Alert>}
    {recovery === 'restored' && <Alert className="mb-5"><AlertDescription>{lang === 'zh' ? '已恢复未保存的文字，请重新添加图片和文件。' : 'Unsaved text restored. Reattach images and files.'}</AlertDescription></Alert>}
    {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{lang === 'zh' ? '连接状态未能刷新，请重试。' : 'Connection status could not be refreshed. Try again.'}<Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>{lang === 'zh' ? '重试' : 'Retry'}</Button></AlertDescription></Alert>}
  </>;
  if (!loading && !authLink && status.authenticated && status.userId) return <AccountWorkspace key={status.userId} lang={lang} view={view} navigate={navigate} shellProps={shellProps} notices={notices} />;
  return <ApplicationShell {...shellProps}>{notices}
    {loading ? <div role="status" aria-label={lang === 'zh' ? '正在连接' : 'Connecting'} className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-60 w-full" /></div> : authLink && EmailLinkPanel ? <EmailLinkPanel key={authLink.id} link={authLink} lang={lang} onClose={() => replaceAuthLink(null)} /> : AuthPanel ? <AuthPanel lang={lang} onAuthenticated={authenticated} /> : <Card><CardHeader><CardTitle>{lang === 'zh' ? '登录后继续' : 'Sign in to continue'}</CardTitle></CardHeader><CardContent><PageUnavailable lang={lang} /></CardContent></Card>}
  </ApplicationShell>;
}
