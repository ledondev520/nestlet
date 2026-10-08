import { useCallback, useEffect, useId, useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  async function save(event) {
    const enableLive = true;
    event.preventDefault();
    if(busy || !view?.secureSettings || (enableLive && !apiKey.trim() && !view.configured))return;
    const parsed=settingsPayload({apiKey,enableLive,configured:view.configured});
    if(!parsed.ok){setError(parsed);return;}
    const task=operation.start();if(!task)return;
    setBusy('save');setError(null);setNotice('');setWarning(false);
    // Never auto-fill or auto-post a key. This explicit submit is the only write path.
    setApiKey('');
    try {
      const result=await api.post('/api/settings',parsed.payload,{signal:task.controller.signal});
      if(result?.check!=='chat-completion' || result.chatCompletionTested!==true || !result.connectionVerifiedAt)throw {code:'INVALID_RESPONSE'};
      const next=checkedStatus(result);
      if(operation.current(task)){setView(next);setNotice('validatedSaved');}
      await refreshSession(task);
    } catch(failure){
      if(operation.current(task) && failure.name!=='AbortError'){
        setError(failure);
        // A lost response does not prove the write was rejected. Require a fresh read.
        setView(null);
        try { const next=checkedStatus(await api.get('/api/settings',{signal:task.controller.signal})); if(operation.current(task))setView(next); } catch {}
      }
    } finally{if(operation.current(task))setBusy('');operation.finish(task);}
  }

  return <section className="space-y-3">
    <div className="flex items-center gap-2"><KeyRound className="size-5 text-muted-foreground" aria-hidden="true" /><h2 className="text-base font-semibold">{lang==='zh'?'助手设置':'Model settings'}</h2></div>
    <div className="space-y-3" aria-busy={Boolean(busy)}>
      {busy==='load' && <p role="status" className="whitespace-pre-line flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t.refreshing}</p>}
      {error && <p role="alert" className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}
      {notice && <p role="status" className="whitespace-pre-line flex items-start gap-2 text-sm leading-relaxed"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t[notice]}</p>}
      {warning && <p role="status" className="whitespace-pre-line paper-note rounded-r-md p-3 text-sm">{t.refreshFailed}</p>}
      {view && <>
        {!notice && <p className="whitespace-pre-line text-sm"><span className="font-medium">deepseek-flash</span> · {view.configured?t.configured:t.notConfigured} · {view.liveEnabled?t.enabled:t.paused}</p>}
        {!view.secureSettings ? <p role="status" className="whitespace-pre-line paper-note rounded-r-md p-4 text-sm leading-relaxed">{t.secureSettingsRequired}</p> : <form noValidate onSubmit={event=>save(event)} className="space-y-3">
          <div className="space-y-2"><Label htmlFor={`${id}-key`}>{t.keyLabel}</Label><Input id={`${id}-key`} name="deepseek-api-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={event=>{setApiKey(event.target.value);setError(null);setNotice('');}} disabled={Boolean(busy)} placeholder={t.keyPlaceholder} aria-invalid={error?.field==='apiKey'} aria-describedby={`${id}-key-help`} /><p id={`${id}-key-help`} className="text-xs text-muted-foreground">{t.keyHelp}</p></div>

          <div className="flex items-center gap-3"><Button type="submit" disabled={Boolean(busy) || !dirty}>{busy==='save' && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy==='save'?(lang==='zh'?'正在检查并保存…':'Checking and saving…'):(lang==='zh'?'保存':'Save')}</Button><span className="text-xs text-muted-foreground">{lang==='zh'?'检查消耗少量额度':'Check uses model quota'}</span></div>
        </form>}
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{lang==='zh'?'详情':'Details'}</summary><div className="mt-2 space-y-2">
        <p className="whitespace-pre-line text-sm"><span className="font-medium">deepseek-flash</span> · {view.configured?t.configured:t.notConfigured} · {view.liveEnabled?t.enabled:t.paused}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{view.verifiedAt ? `${lang==='zh'?'上次检查':'Model response last checked'} · ${new Date(view.verifiedAt).toLocaleString(language(lang)==='zh'?'zh-CN':'en-US')}` : t.notVerified}</p>
        {view.configured && view.keyStorage==='server-memory' && <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{t.memoryStorage}</p>}
          <p className="whitespace-pre-line text-xs text-muted-foreground">{lang==='zh'?'保存时会检查一次，成功后启用助手。\n检查失败会保留原有密钥。\n检查会消耗少量模型额度。':'Save checks the key once and enables AI on success. A failed check keeps your previous key. Verification uses a small amount of model quota.'}</p>
        </div></details>
      </>}
      {!view && !busy && <Button type="button" variant="ghost" size="sm" onClick={load}>{t.refresh}</Button>}
    </div>
  </section>;
}

