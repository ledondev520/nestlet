import { useCallback, useEffect, useId, useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { providerStatus, settingsPayload } from './auth-model.js';
import { authCopy, authErrorMessage, language } from './copy.js';
import { useOperation } from './use-operation.js';

function checkedStatus(value) {
  if (!value || typeof value.configured !== 'boolean' || typeof value.liveEnabled !== 'boolean' || typeof value.secureSettings !== 'boolean') throw { code:'INVALID_RESPONSE' };
  return providerStatus(value);
}
export function ModelSettingsForm({ lang, session }) {
  const t=authCopy(lang), id=useId(), operation=useOperation();
  const {api,refresh}=session;
  const [view,setView]=useState(null);
  const [apiKey,setApiKey]=useState('');
  
  const [busy,setBusy]=useState('');
  const [error,setError]=useState(null);
  const [notice,setNotice]=useState('');
  const [warning,setWarning]=useState(false);
  const dirty=Boolean(apiKey.trim());

  const load=useCallback(async () => {
    const task=operation.start();if(!task)return;
    setBusy('load');setError(null);setWarning(false);
    try {
      const next=checkedStatus(await api.get('/api/settings',{signal:task.controller.signal}));
      if(operation.current(task)){setView(next);setApiKey('');}
    } catch(failure){if(operation.current(task) && failure.name!=='AbortError'){setError(failure);setView(null);}}
    finally{if(operation.current(task))setBusy('');operation.finish(task);}
  },[api,operation]);
  useEffect(()=>{load();},[load]);

  async function refreshSession(task) {
    try {await refresh({signal:task.controller.signal});}
    catch(failure){if(operation.current(task) && failure.name!=='AbortError')setWarning(true);}
  }
  async function save(event, enableLive = true) {
    event.preventDefault();
    if(busy || !view?.secureSettings || (enableLive && !apiKey.trim() && !view.configured))return;
    const parsed=settingsPayload({apiKey,enableLive,configured:view.configured});
    if(!parsed.ok){setError(parsed);return;}
    const task=operation.start();if(!task)return;
    setBusy('save');setError(null);setNotice('');setWarning(false);
    // Never auto-fill or auto-post a key. This explicit submit is the only write path.
    setApiKey('');
    try {
      const next=checkedStatus(await api.post('/api/settings',parsed.payload,{signal:task.controller.signal}));
      if(operation.current(task)){setView(next);setNotice('saved');}
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
    setBusy('test');setError(null);setNotice('');setWarning(false);
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
  function discard(){if(busy)return;setApiKey('');setError(null);setNotice('');}

  return <Card className="border-0 bg-transparent shadow-none">
    <CardHeader className="px-0 pt-0"><div className="flex items-center gap-2"><KeyRound className="size-5 text-muted-foreground" aria-hidden="true" /><CardTitle className="text-base">{lang==='zh'?'模型设置':'Model settings'}</CardTitle></div></CardHeader>
    <CardContent className="space-y-3 px-0 pb-0" aria-busy={Boolean(busy)}>
      {busy==='load' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t.refreshing}</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}
      {notice && <p role="status" className="flex items-start gap-2 text-sm leading-relaxed"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t[notice]}</p>}
      {warning && <p role="status" className="paper-note rounded-r-md p-3 text-sm">{t.refreshFailed}</p>}
      {view && <>
        <p className="text-sm"><span className="font-medium">deepseek-flash</span> · {view.configured?t.configured:t.notConfigured} · {view.liveEnabled?t.enabled:t.paused}</p>
        <p className="text-xs text-muted-foreground">{view.verifiedAt ? `${lang==='zh'?'模型权限上次验证':'Model access last checked'} · ${new Date(view.verifiedAt).toLocaleString(language(lang)==='zh'?'zh-CN':'en-US')}` : t.notVerified}</p>
        {view.configured && view.keyStorage==='server-memory' && <p className="text-xs leading-relaxed text-muted-foreground">{t.memoryStorage}</p>}
        {!view.secureSettings ? <p role="status" className="paper-note rounded-r-md p-4 text-sm leading-relaxed">{t.secureSettingsRequired}</p> : <form noValidate onSubmit={event=>save(event)} className="space-y-5">
          <div className="space-y-2"><Label htmlFor={`${id}-key`}>{t.keyLabel}</Label><Input id={`${id}-key`} name="deepseek-api-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={event=>{setApiKey(event.target.value);setError(null);setNotice('');}} disabled={Boolean(busy)} placeholder={t.keyPlaceholder} aria-invalid={error?.field==='apiKey'} /></div>
          <p className="text-xs text-muted-foreground">{lang==='zh'?'保存后启用 AI；API Key 仅保存在服务器，连接仍需验证。':'Saving enables AI. The API key stays on the server; model access still needs verification.'}</p>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={Boolean(busy) || !dirty}>{busy==='save' && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy==='save'?t.saving:(lang==='zh'?'保存并启用 AI':'Save and enable AI')}</Button><Button type="button" variant="outline" onClick={discard} disabled={Boolean(busy) || !dirty}>{t.discard}</Button><Button type="button" variant="outline" onClick={testConnection} disabled={Boolean(busy) || dirty || !view.configured}>{busy==='test' && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy==='test'?t.testing:t.test}</Button></div>
          {view.configured && <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy) || dirty} onClick={event=>save(event,!view.liveEnabled)}>{view.liveEnabled?(lang==='zh'?'暂停 AI':'Pause AI'):(lang==='zh'?'启用 AI':'Enable AI')}</Button>}
          {dirty && <p role="status" className="text-xs text-muted-foreground">{t.saveBeforeTest}</p>}
        </form>}
      </>}
      <Button type="button" variant="ghost" size="sm" onClick={load} disabled={Boolean(busy) || dirty}><RefreshCw aria-hidden="true" />{t.refresh}</Button>
    </CardContent>
  </Card>;
}

