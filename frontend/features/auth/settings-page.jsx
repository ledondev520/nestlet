import { useCallback, useEffect, useId, useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';
import { AccountControls } from './account-controls.jsx';
import { AuthPanel } from './auth-panel.jsx';
import { canManageProvider, providerStatus, settingsPayload } from './auth-model.js';
import { authCopy, authErrorMessage, language } from './copy.js';
import { useOperation } from './use-operation.js';

function checkedStatus(value) {
  if (!value || typeof value.configured !== 'boolean' || typeof value.liveEnabled !== 'boolean' || typeof value.secureSettings !== 'boolean') throw { code:'INVALID_RESPONSE' };
  return providerStatus(value);
}
function ProviderSettings({ lang, session }) {
  const t=authCopy(lang), id=useId(), operation=useOperation();
  const {api,refresh}=session;
  const [view,setView]=useState(null);
  const [apiKey,setApiKey]=useState('');
  const [enableLive,setEnableLive]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState(null);
  const [notice,setNotice]=useState('');
  const [warning,setWarning]=useState(false);
  const [cleared,setCleared]=useState(false);
  const dirty=Boolean(apiKey) || Boolean(view && enableLive !== view.liveEnabled);

  const load=useCallback(async () => {
    const task=operation.start();if(!task)return;
    setBusy('load');setError(null);setWarning(false);
    try {
      const next=checkedStatus(await api.get('/api/settings',{signal:task.controller.signal}));
      if(operation.current(task)){setView(next);setEnableLive(next.liveEnabled);setApiKey('');}
    } catch(failure){if(operation.current(task) && failure.name!=='AbortError'){setError(failure);setView(null);}}
    finally{if(operation.current(task))setBusy('');operation.finish(task);}
  },[api,operation]);
  useEffect(()=>{load();},[load]);

  async function refreshSession(task) {
    try {await refresh({signal:task.controller.signal});}
    catch(failure){if(operation.current(task) && failure.name!=='AbortError')setWarning(true);}
  }
  async function save(event) {
    event.preventDefault();
    if(busy || !view?.secureSettings)return;
    const parsed=settingsPayload({apiKey,enableLive,configured:view.configured});
    if(!parsed.ok){setError(parsed);return;}
    const task=operation.start();if(!task)return;
    const submittedKey=Boolean(parsed.payload.apiKey);
    setBusy('save');setError(null);setNotice('');setWarning(false);setCleared(submittedKey);
    // Never auto-fill or auto-post a key. This explicit submit is the only write path.
    setApiKey('');
    try {
      const next=checkedStatus(await api.post('/api/settings',parsed.payload,{signal:task.controller.signal}));
      if(operation.current(task)){setView(next);setEnableLive(next.liveEnabled);setNotice('saved');}
      await refreshSession(task);
    } catch(failure){
      if(operation.current(task) && failure.name!=='AbortError'){
        setError(failure);
        // A lost response does not prove the write was rejected. Require a fresh read.
        setView(null);
      }
    } finally{if(operation.current(task))setBusy('');operation.finish(task);}
  }
  async function testConnection() {
    if(busy || dirty || !view?.configured || !view.secureSettings)return;
    const task=operation.start();if(!task)return;
    setBusy('test');setError(null);setNotice('');setWarning(false);setCleared(false);
    try {
      const result=await api.post('/api/settings/test',{}, {signal:task.controller.signal});
      if(result?.ok!==true || result.check!=='model-access' || result.chatCompletionTested!==false || result.model!=='deepseek-flash')throw {code:'INVALID_RESPONSE'};
      if(operation.current(task)){
        setView(current=>({...current,verifiedAt:providerStatus({connectionVerifiedAt:result.verifiedAt}).verifiedAt}));
        setNotice('tested');
      }
      await refreshSession(task);
    } catch(failure){if(operation.current(task) && failure.name!=='AbortError')setError(failure);}
    finally{if(operation.current(task))setBusy('');operation.finish(task);}
  }
  function discard(){if(busy)return;setApiKey('');setEnableLive(view?.liveEnabled===true);setError(null);setNotice('');setCleared(false);}

  return <Card className="paper-card">
    <CardHeader><div className="flex items-center gap-2"><KeyRound className="size-5 text-muted-foreground" aria-hidden="true" /><CardTitle className="paper-title text-xl">{t.providerTitle}</CardTitle></div><CardDescription>{t.providerHint}</CardDescription></CardHeader>
    <CardContent className="space-y-5" aria-busy={Boolean(busy)}>
      {busy==='load' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t.refreshing}</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}
      {notice && <p role="status" className="flex items-start gap-2 text-sm leading-relaxed"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t[notice]}</p>}
      {warning && <p role="status" className="paper-note rounded-r-md p-3 text-sm">{t.refreshFailed}</p>}
      {cleared && <p className="text-xs text-muted-foreground">{t.keyCleared}</p>}
      {view && <>
        <dl className="grid gap-3 rounded-lg border border-border bg-secondary/30 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">API Key</dt><dd className="mt-1 font-medium">{view.configured?t.configured:t.notConfigured}</dd></div>
          <div><dt className="text-muted-foreground">{t.liveLabel}</dt><dd className="mt-1 font-medium">{view.liveEnabled?t.enabled:t.paused}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">{t.connection}</dt><dd className="mt-1">{view.verifiedAt ? `${t.verified} · ${new Date(view.verifiedAt).toLocaleString(language(lang)==='zh'?'zh-CN':'en-US')}` : t.notVerified}</dd></div>
        </dl>
        {view.configured && <p className="text-xs leading-relaxed text-muted-foreground">{view.keyStorage==='server-environment'?t.environmentStorage:t.memoryStorage}</p>}
        {!view.secureSettings ? <p role="status" className="paper-note rounded-r-md p-4 text-sm leading-relaxed">{t.secureSettingsRequired}</p> : <form noValidate onSubmit={save} className="space-y-5">
          <div className="space-y-2"><Label htmlFor={`${id}-key`}>{t.keyLabel}</Label><Input id={`${id}-key`} name="deepseek-api-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={event=>{setApiKey(event.target.value);setError(null);setNotice('');setCleared(false);}} disabled={Boolean(busy)} placeholder={t.keyPlaceholder} aria-describedby={`${id}-key-hint`} aria-invalid={error?.field==='apiKey'} /><p id={`${id}-key-hint`} className="text-xs leading-relaxed text-muted-foreground">{t.keyHint}</p></div>
          <div className="flex items-start gap-3"><Checkbox id={`${id}-live`} checked={enableLive} onCheckedChange={value=>{setEnableLive(value===true);setNotice('');}} disabled={Boolean(busy)} className="mt-0.5" /><div className="space-y-1"><Label htmlFor={`${id}-live`}>{t.liveLabel}</Label><p className="text-xs leading-relaxed text-muted-foreground">{t.liveHint}</p></div></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={Boolean(busy) || !dirty}>{busy==='save' && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy==='save'?t.saving:t.save}</Button><Button type="button" variant="outline" onClick={discard} disabled={Boolean(busy) || !dirty}>{t.discard}</Button><Button type="button" variant="outline" onClick={testConnection} disabled={Boolean(busy) || dirty || !view.configured}>{busy==='test' && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy==='test'?t.testing:t.test}</Button></div>
          {dirty && <p role="status" className="text-xs text-muted-foreground">{t.saveBeforeTest}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{t.testHint}</p>
        </form>}
      </>}
      <Button type="button" variant="ghost" size="sm" onClick={load} disabled={Boolean(busy) || dirty}><RefreshCw aria-hidden="true" />{t.refresh}</Button>
    </CardContent>
  </Card>;
}

export function SettingsPage({ lang = 'zh' }) {
  const session=useSession(), t=authCopy(lang);
  if(!session.status?.authenticated)return <AuthPanel lang={lang} />;
  return <section className="space-y-6" aria-label={canManageProvider(session.status)?t.settingsTitle:t.account}>
    <Card className="paper-card"><CardHeader><CardTitle className="paper-title text-xl">{canManageProvider(session.status)?t.settingsTitle:t.account}</CardTitle><CardDescription>{canManageProvider(session.status)?t.settingsHint:t.ordinaryHint}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><AccountControls lang={lang} /><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{session.status.role==='owner' && <ShieldCheck className="size-4" aria-hidden="true" />}{session.status.role==='owner'?t.administrator:t.ordinary}</span></CardContent></Card>
    {canManageProvider(session.status) && <ProviderSettings key={session.status.userId || 'owner'} session={session} lang={lang} />}
  </section>;
}
