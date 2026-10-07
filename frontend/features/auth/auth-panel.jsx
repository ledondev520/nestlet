import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { readRememberedAccount, rememberAccount } from './remember-account.js';
import { AccountControls } from './account-controls.jsx';
import { acceptedEmailRequest, authPayload, emailPayload } from './auth-model.js';
import { AuthField, PasswordFields, clearNativePasswords } from './auth-fields.jsx';
import { authCopy, authErrorMessage } from './copy.js';
import { useOperation } from './use-operation.js';
import { useCooldown } from './use-cooldown.js';

export function AuthPanel({ lang = 'zh', onAuthenticated }) {
  const { status, loading, error: sessionError, login, register, refresh, api } = useSession();
  const t = authCopy(lang), id = useId();
  const [mode, setMode] = useState('login');
  const [identity, setIdentity] = useState(readRememberedAccount);
  const [remember, setRemember] = useState(() => Boolean(readRememberedAccount()));
  const formRef = useRef(null);
  const [passwordEpoch, setPasswordEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const operation = useOperation();
  const loginAllowed = status.authConfigured === true && status.secureLogin === true;
  const mailAllowed = loginAllowed && status.emailDeliveryConfigured === true;
  const registering = mode === 'register', requestOnly = ['forgot', 'resend'].includes(mode);
  const submitAllowed = mode === 'login' ? loginAllowed : mailAllowed && (!registering || status.registrationEnabled === true) && cooldown === 0;
  useEffect(() => {
    const clear = () => { operation.cancel(); setBusy(false); clearNativePasswords(formRef.current); setPasswordEpoch(value => value + 1); };
    window.addEventListener('popstate', clear); window.addEventListener('hashchange', clear); window.addEventListener('pagehide', clear);
    return () => { window.removeEventListener('popstate', clear); window.removeEventListener('hashchange', clear); window.removeEventListener('pagehide', clear); };
  }, [operation]);
  async function retry() {
    const task = operation.start(); if (!task) return;
    setBusy(true); setError(null);
    try { await refresh({ signal: task.controller.signal }); }
    catch (failure) { if (operation.current(task)) setError(failure); }
    finally { if (operation.current(task)) setBusy(false); operation.finish(task); }
  }
  async function submit(event, resend = false) {
    event.preventDefault();
    if (busy || (resend ? !mailAllowed || cooldown > 0 : !submitAllowed)) return;
    const emailOnly = resend || requestOnly;
    const native = event.currentTarget.tagName === 'FORM' ? new window.FormData(event.currentTarget) : null;
    const submittedIdentity = native ? String(native.get(mode === 'login' ? 'username' : 'email') || '') : identity;
    setIdentity(submittedIdentity);
    const fields = mode === 'login' && !submittedIdentity.includes('@') ? { username: submittedIdentity } : { email: submittedIdentity };
    const parsed = emailOnly ? emailPayload(submittedIdentity) : authPayload(mode, { ...fields, password: native?.get('password'), passwordConfirmation: native?.get('passwordConfirmation') });
    if (parsed.ok && mode === 'login') parsed.payload.rememberMe = remember;
    if (!parsed.ok) { setError(parsed); return; }
    const task = operation.start(); if (!task) return;
    setBusy(true); setError(null); clearNativePasswords(formRef.current); setPasswordEpoch(value => value + 1);
    try {
      const options = { signal: task.controller.signal };
      const result = emailOnly ? await api.post(mode === 'forgot' && !resend ? '/api/auth/password/forgot' : '/api/auth/email/resend', parsed.payload, options) : await (registering ? register(parsed.payload, options) : login(parsed.payload, options));
      if (!emailOnly && !registering && result?.authenticated === true) rememberAccount(parsed.payload.username || '', remember);
      if (!operation.current(task)) return;
      if (emailOnly || registering) { startCooldown(acceptedEmailRequest(result)); setAccepted(true); }
      else if (result?.authenticated === true) onAuthenticated?.(result);
      else throw { code: 'INVALID_RESPONSE' };
    } catch (failure) { if (operation.current(task) && failure.name !== 'AbortError') { setError(failure); if (failure.code === 'EMAIL_AUTH_RATE_LIMITED') startCooldown(60); } }
    finally { if (operation.current(task)) setBusy(false); operation.finish(task); }
  }
  function changeMode(next) { if (busy) return; setMode(next); setAccepted(false); setError(null); clearNativePasswords(formRef.current); setPasswordEpoch(value => value + 1); }
  const failure = error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{authErrorMessage(error, lang)}</p>;
  if (status.authenticated) return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{t.signedIn}</CardTitle><CardDescription>{t.signedInHint}</CardDescription></CardHeader><CardContent className="space-y-3"><AccountControls lang={lang} />{sessionError && <><p role="status" className="text-sm text-muted-foreground">{authErrorMessage(sessionError, lang)}</p><Button type="button" variant="outline" size="sm" onClick={retry} disabled={busy}>{t.retry}</Button></>}</CardContent></Card>;
  if (loading) return <Card className="paper-card"><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t.loading}</CardContent></Card>;
  if (typeof status.authConfigured !== 'boolean' || !status.authConfigured) return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{status.authConfigured === false ? t.setupTitle : t.account}</CardTitle><CardDescription>{status.authConfigured === false ? t.setupHint : t.authUnavailable}</CardDescription></CardHeader><CardContent className="space-y-4">{failure}<Button type="button" variant="outline" disabled={busy} onClick={retry}><RefreshCw aria-hidden="true" />{t.retry}</Button></CardContent></Card>;
  const title = accepted ? t.acceptedTitle : registering ? t.registerTitle : mode === 'forgot' ? t.forgotTitle : mode === 'resend' ? t.resend : t.loginTitle;
  const hint = accepted ? t.acceptedHint : registering ? t.registerHint : mode === 'forgot' ? t.forgotHint : mode === 'resend' ? t.emailHint : t.loginHint;
  return <Card className="paper-card mx-auto w-full max-w-lg">
    <CardHeader className="space-y-3"><span className="inline-flex size-9 items-center justify-center rounded-md bg-secondary"><LockKeyhole className="size-4" aria-hidden="true" /></span><CardTitle className="paper-title text-2xl">{title}</CardTitle><CardDescription>{hint}</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {!accepted && !requestOnly && <div role="group" aria-label={t.account} className="grid grid-cols-2 gap-2"><Button type="button" variant={!registering ? 'secondary' : 'outline'} aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>{t.login}</Button><Button type="button" variant={registering ? 'secondary' : 'outline'} aria-pressed={registering} disabled={busy || !status.registrationEnabled || !mailAllowed} onClick={() => changeMode('register')}>{t.register}</Button></div>}
      {!loginAllowed && <p role="alert" className="paper-note rounded-r-md p-3 text-sm leading-relaxed">{t.insecureLogin}</p>}
      {!status.emailDeliveryConfigured ? <p role="status" className="text-sm text-muted-foreground">{t.emailUnavailable}</p> : !status.registrationEnabled && <p className="text-sm text-muted-foreground">{t.registrationUnavailable}</p>}
      {accepted ? <div className="space-y-4"><p role="status" className="text-sm leading-relaxed">{mode === 'forgot' ? t.acceptedHint : t.checkSpam}</p>{failure}<Button type="button" variant="outline" className="w-full" disabled={busy || !mailAllowed || cooldown > 0} onClick={event => submit(event, mode !== 'forgot')}>{busy ? t.requestBusy : mode === 'forgot' ? t.requestReset : t.resend}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setAccepted(false); setError(null); }}>{t.changeEmail}</Button></div> : <form ref={formRef} autoComplete="on" method="post" noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <AuthField id={`${id}-identity`} label={mode === 'login' ? t.identity : t.email} help={mode === 'login' ? t.identityHint : t.emailHint} name={mode === 'login' ? 'username' : 'email'} type={mode === 'login' ? 'text' : 'email'} autoComplete={mode === 'login' ? 'username' : 'email'} autoCapitalize="none" spellCheck={false} key={`identity:${mode}`} defaultValue={identity} onChange={event => { setIdentity(event.target.value); setError(null); }} maxLength={254} required disabled={busy || !loginAllowed} placeholder={mode === 'login' ? t.identityPlaceholder : t.emailPlaceholder} error={['username', 'email'].includes(error?.field)} />
        {!requestOnly && <PasswordFields key={`password:${mode}:${passwordEpoch}`} id={id} t={t} onChange={() => setError(null)} confirm={registering} disabled={busy || !loginAllowed} error={error} />}
        {mode === 'login' && <div className="flex items-center gap-2"><Checkbox id={`${id}-remember`} checked={remember} onCheckedChange={value => { setRemember(value === true); if (value !== true) rememberAccount('', false); }} disabled={busy} /><Label htmlFor={`${id}-remember`}>{t.remember}</Label></div>}
        {failure}<Button className="w-full" type="submit" disabled={busy || !submitAllowed}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy ? t.requestBusy : registering ? t.register : mode === 'forgot' ? t.requestReset : mode === 'resend' ? t.resend : t.login}</Button>
      </form>}
      {cooldown > 0 && mode !== 'login' && <p role="status" className="text-xs text-muted-foreground">{cooldown} {t.cooldown}</p>}
      {mode === 'login' ? <div className="flex flex-wrap gap-2"><Button type="button" variant="link" size="sm" disabled={busy} onClick={() => changeMode('forgot')}>{t.forgot}</Button><Button type="button" variant="link" size="sm" disabled={busy} onClick={() => changeMode('resend')}>{t.resend}</Button></div> : <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode('login')}>{t.backToLogin}</Button>}
      {mode === 'forgot' && <p className="paper-note rounded-r-md p-3 text-xs leading-relaxed">{t.bootstrapRecovery}</p>}
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{t.emailPrivacy}</p>
    </CardContent>
  </Card>;
}
