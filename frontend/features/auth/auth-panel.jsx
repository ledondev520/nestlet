import { useId, useRef, useState } from 'react';
import { LoaderCircle, LockKeyhole, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { readRememberedAccount, rememberAccount } from './remember-account.js';
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
  const [username] = useState(()=>readRememberedAccount());
  const [remember,setRemember] = useState(()=>Boolean(readRememberedAccount()));
  const [showPassword,setShowPassword] = useState(false);
  const formRef = useRef(null);
  const clearPasswords = () => {for(const name of ['password','passwordConfirmation']){const field=formRef.current?.elements.namedItem(name);if(field)field.value='';}};
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
    const fields = new window.FormData(event.currentTarget);
    const parsed = authPayload(mode,{username:fields.get('username'),password:fields.get('password'),passwordConfirmation:fields.get('passwordConfirmation')});
    if(parsed.ok&&!registering)parsed.payload.rememberMe=remember;
    if (!parsed.ok) { setError(parsed); return; }
    const task=operation.start();if(!task)return;
    setBusy(true);setError(null);
    // Keep native form values through successful sign-in for password managers.
    let result;
    try { result=await (registering ? register(parsed.payload) : login(parsed.payload)); }
    catch(failure){if(operation.current(task)){setError(failure);clearPasswords();setShowPassword(false);}}
    finally{if(operation.current(task))setBusy(false);operation.finish(task);}
    if(result?.authenticated){clearPasswords();setShowPassword(false);rememberAccount(parsed.payload.username,remember&&!registering);onAuthenticated?.(result);}
  }
  function changeMode(next) { if(busy)return;setMode(next);setError(null);clearPasswords();setShowPassword(false); }

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
      <form ref={formRef} autoComplete="on" method="post" noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <div className="space-y-2"><Label htmlFor={`${id}-username`}>{t.username}</Label><Input id={`${id}-username`} name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={username} onChange={()=>setError(null)} maxLength={128} required readOnly={busy} disabled={!loginAllowed} placeholder={t.usernamePlaceholder} aria-invalid={error?.field==='username'} aria-describedby={registering?`${id}-username-help`:undefined} />{registering&&<p id={`${id}-username-help`} className="text-xs leading-relaxed text-muted-foreground">{t.usernameHint}</p>}</div>
        <div className="space-y-2"><Label htmlFor={`${id}-password`}>{t.password}</Label><Input id={`${id}-password`} name="password" type={showPassword?'text':'password'} autoComplete={registering?'new-password':'current-password'} defaultValue="" onChange={()=>setError(null)} minLength={6} maxLength={256} required readOnly={busy} disabled={!loginAllowed} aria-invalid={error?.field==='password'} aria-describedby={registering?`${id}-password-help`:undefined} />{registering&&<p id={`${id}-password-help`} className="text-xs leading-relaxed text-muted-foreground">{t.passwordHint}</p>}</div>
        <div className="flex items-center justify-between gap-3">{!registering&&<div className="flex items-center gap-2"><Checkbox id={`${id}-remember`} checked={remember} onCheckedChange={value=>{setRemember(value===true);if(value!==true)rememberAccount('',false);}} disabled={busy}/><Label htmlFor={`${id}-remember`} className="text-sm">{t.remember}</Label></div>}<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?t.hidePassword:t.showPassword}>{showPassword?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}{showPassword?t.hidePassword:t.showPassword}</Button></div>
        {registering && <div className="space-y-2"><Label htmlFor={`${id}-confirm`}>{t.confirmPassword}</Label><Input id={`${id}-confirm`} name="passwordConfirmation" type="password" autoComplete="new-password" defaultValue="" onChange={()=>setError(null)} minLength={6} maxLength={256} required readOnly={busy} disabled={!loginAllowed} aria-invalid={error?.field==='passwordConfirmation'} /></div>}
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error,lang)}</p>}
        <Button className="w-full" type="submit" disabled={busy || !submitAllowed}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy ? (registering?t.registerBusy:t.loginBusy) : (registering?t.register:t.login)}</Button>
      </form>

    </CardContent>
  </Card>;
}
