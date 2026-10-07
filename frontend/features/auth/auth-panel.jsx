import { useId, useState } from 'react';
import { LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/session';
import { AccountControls } from './account-controls.jsx';
import { authPayload } from './auth-model.js';
import { authCopy, authErrorMessage } from './copy.js';
import { useOperation } from './use-operation.js';

export function AuthPanel({ lang = 'zh', onAuthenticated }) {
  const { status, loading, error:sessionError, login, register, refresh } = useSession();
  const t = authCopy(lang), id = useId();
  const [mode,setMode] = useState('login');
  const [username,setUsername] = useState('');
  const [password,setPassword] = useState('');
  const [confirmation,setConfirmation] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(null);
  const operation = useOperation();
  const loginAllowed = status.authConfigured === true && status.secureLogin === true;
  const registering = mode === 'register';
  const submitAllowed = loginAllowed && (!registering || status.registrationEnabled === true);

  async function retry() {
    const task=operation.start();if(!task)return;
    setBusy(true);setError(null);
    try { await refresh({signal:task.controller.signal}); }
    catch(failure){if(operation.current(task))setError(failure);}
    finally{if(operation.current(task))setBusy(false);operation.finish(task);}
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !submitAllowed) return;
    const parsed = authPayload(mode,{username,password,passwordConfirmation:confirmation});
    if (!parsed.ok) { setError(parsed); return; }
    const task=operation.start();if(!task)return;
    setBusy(true);setError(null);
    // Only this explicit submit can transmit credentials; clear inputs immediately.
    setPassword('');setConfirmation('');
    let result;
    try { result=await (registering ? register(parsed.payload) : login(parsed.payload)); }
    catch(failure){if(operation.current(task))setError(failure);}
    finally{if(operation.current(task))setBusy(false);operation.finish(task);}
    if(result?.authenticated)onAuthenticated?.(result);
  }
  function changeMode(next) { if(busy)return;setMode(next);setError(null);setPassword('');setConfirmation(''); }

  if (status.authenticated) return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{t.signedIn}</CardTitle><CardDescription>{t.signedInHint}</CardDescription></CardHeader><CardContent className="space-y-3"><AccountControls lang={lang} />{sessionError && <><p role="status" className="text-sm text-muted-foreground">{authErrorMessage(sessionError,lang)}</p><Button type="button" variant="outline" size="sm" onClick={retry} disabled={busy}>{t.retry}</Button></>}</CardContent></Card>;
  if (loading) return <Card className="paper-card"><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t.loading}</CardContent></Card>;
  if (typeof status.authConfigured !== 'boolean') return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{t.account}</CardTitle><CardDescription>{t.authUnavailable}</CardDescription></CardHeader><CardContent className="space-y-4"><p role="alert" className="text-sm text-destructive">{authErrorMessage(error || sessionError,lang)}</p><Button type="button" variant="outline" disabled={busy} onClick={retry}><RefreshCw aria-hidden="true" />{t.retry}</Button></CardContent></Card>;
  if (!status.authConfigured) return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{t.setupTitle}</CardTitle><CardDescription className="leading-relaxed">{t.setupHint}</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" disabled={busy} onClick={retry}><RefreshCw aria-hidden="true" />{t.retry}</Button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}</CardContent></Card>;

  return <Card className="paper-card mx-auto w-full max-w-lg">
    <CardHeader className="space-y-3"><span className="inline-flex size-9 items-center justify-center rounded-md bg-secondary"><LockKeyhole className="size-4" aria-hidden="true" /></span><CardTitle className="paper-title text-2xl">{registering ? t.registerTitle : t.loginTitle}</CardTitle><CardDescription>{registering ? t.registerHint : t.loginHint}</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div role="group" aria-label={t.account} className="grid grid-cols-2 gap-2"><Button type="button" variant={!registering?'secondary':'outline'} aria-pressed={!registering} disabled={busy} onClick={()=>changeMode('login')}>{t.login}</Button><Button type="button" variant={registering?'secondary':'outline'} aria-pressed={registering} disabled={busy || !status.registrationEnabled} onClick={()=>changeMode('register')}>{t.register}</Button></div>
      {!loginAllowed && <p role="alert" className="paper-note rounded-r-md p-3 text-sm leading-relaxed">{t.insecureLogin}</p>}
      {!status.registrationEnabled && <p className="text-sm text-muted-foreground">{t.registrationUnavailable}</p>}
      <form noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <div className="space-y-2"><Label htmlFor={`${id}-username`}>{t.username}</Label><Input id={`${id}-username`} name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event=>{setUsername(event.target.value);setError(null);}} maxLength={128} required disabled={busy || !loginAllowed} placeholder={t.usernamePlaceholder} aria-invalid={error?.field==='username'} aria-describedby={`${id}-username-help`} /><p id={`${id}-username-help`} className="text-xs leading-relaxed text-muted-foreground">{t.usernameHint}</p></div>
        <div className="space-y-2"><Label htmlFor={`${id}-password`}>{t.password}</Label><Input id={`${id}-password`} name="password" type="password" autoComplete={registering?'new-password':'current-password'} value={password} onChange={event=>{setPassword(event.target.value);setError(null);}} minLength={6} maxLength={256} required disabled={busy || !loginAllowed} aria-invalid={error?.field==='password'} aria-describedby={`${id}-password-help`} /><p id={`${id}-password-help`} className="text-xs leading-relaxed text-muted-foreground">{t.passwordHint}</p></div>
        {registering && <div className="space-y-2"><Label htmlFor={`${id}-confirm`}>{t.confirmPassword}</Label><Input id={`${id}-confirm`} name="passwordConfirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event=>{setConfirmation(event.target.value);setError(null);}} minLength={6} maxLength={256} required disabled={busy || !loginAllowed} aria-invalid={error?.field==='passwordConfirmation'} /></div>}
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}
        <Button className="w-full" type="submit" disabled={busy || !submitAllowed}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy ? (registering?t.registerBusy:t.loginBusy) : (registering?t.register:t.login)}</Button>
      </form>
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{t.usernameOnly}</p>
    </CardContent>
  </Card>;
}
