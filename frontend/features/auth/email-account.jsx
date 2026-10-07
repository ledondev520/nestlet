import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthField, PasswordFields, clearNativePasswords } from './auth-fields.jsx';
import { acceptedEmailRequest, emailPayload, passwordPayload } from './auth-model.js';
import { authCopy, authErrorMessage } from './copy.js';
import { useOperation } from './use-operation.js';
import { useCooldown } from './use-cooldown.js';

export function EmailAccount({ session, lang = 'zh', active = true }) {
  const { status, api, refresh } = session, t = authCopy(lang), id = useId(), operation = useOperation();
  const [editing, setEditing] = useState(false), [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [pending, setPending] = useState(false);
  const formRef = useRef(null);
  const [passwordEpoch, setPasswordEpoch] = useState(0);
  const [cooldown, startCooldown] = useCooldown();
  const bound = status.emailVerified === true && typeof status.email === 'string';
  const allowed = status.secureLogin === true && status.emailDeliveryConfigured === true;
  const privateRecovery = status.role === 'owner' || status.passwordRecoveryMethod === 'private-bootstrap';
  useEffect(() => { if (!active) { operation.cancel(); clearNativePasswords(formRef.current); setEditing(false); setBusy(false); } }, [active, operation]);
  useEffect(() => {
    const clear = () => { operation.cancel(); clearNativePasswords(formRef.current); setEditing(false); setBusy(false); };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, [operation]);
  async function bind(event) {
    event.preventDefault(); if (busy || cooldown || !allowed || bound) return;
    const native = new window.FormData(event.currentTarget);
    const address = emailPayload(native.get('email')), credential = passwordPayload(native.get('currentPassword'), undefined, false);
    setEmail(String(native.get('email') || ''));
    if (!address.ok || !credential.ok) { setError(!address.ok ? address : credential); return; }
    const task = operation.start(); if (!task) return;
    clearNativePasswords(formRef.current); setPasswordEpoch(value => value + 1); setBusy(true); setError(null);
    try {
      const result = await api.post('/api/auth/email/bind', { email: address.payload.email, currentPassword: credential.payload.password }, { signal: task.controller.signal, telemetry: false });
      if (operation.current(task)) { startCooldown(acceptedEmailRequest(result)); setPending(true); setEditing(false); }
    } catch (failure) { if (operation.current(task) && failure.name !== 'AbortError') { setError(failure); if (failure.code === 'EMAIL_AUTH_RATE_LIMITED') startCooldown(60); } }
    finally { if (operation.current(task)) setBusy(false); operation.finish(task); }
  }
  async function check() {
    const task = operation.start(); if (!task) return;
    setBusy(true); setError(null);
    try { await refresh({ signal: task.controller.signal }); }
    catch (failure) { if (operation.current(task) && failure.name !== 'AbortError') setError(failure); }
    finally { if (operation.current(task)) setBusy(false); operation.finish(task); }
  }
  return <Card className="paper-card"><CardHeader><CardTitle className="paper-title text-xl">{t.emailAccount}</CardTitle><CardDescription>{bound ? t.emailVerified : t.emailNotBound}</CardDescription></CardHeader><CardContent className="space-y-4">
    {bound && <p className="break-all text-sm">{status.email}</p>}
    <p className="text-sm leading-relaxed text-muted-foreground">{privateRecovery ? t.bootstrapRecovery : bound ? t.emailRecovery : t.bindingHint}</p>
    {!allowed && !bound && <p role="status" className="text-sm text-muted-foreground">{status.secureLogin === true ? t.emailUnavailable : t.insecureLogin}</p>}
    {pending && !bound && <p role="status" className="paper-note rounded-r-md p-3 text-sm">{t.bindingPending}</p>}
    {!bound && editing && <form ref={formRef} autoComplete="on" method="post" noValidate onSubmit={bind} className="space-y-4" aria-busy={busy}>
      <AuthField id={`${id}-email`} label={t.email} help={t.emailHint} type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} defaultValue={email} onChange={event => { setEmail(event.target.value); setError(null); }} maxLength={254} required disabled={busy || !allowed} error={error?.field === 'email'} />
      <PasswordFields key={passwordEpoch} id={id} t={t} onChange={() => setError(null)} current confirm={false} disabled={busy || !allowed} error={error} />
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !allowed || cooldown > 0}>{busy ? t.bindBusy : t.bind}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { clearNativePasswords(formRef.current); setEditing(false); setError(null); }}>{t.cancel}</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{authErrorMessage(error, lang)}</p>}
    {!bound && !editing && <Button type="button" variant="outline" disabled={busy || !allowed || cooldown > 0} onClick={() => { setEditing(true); setError(null); }}>{t.bind}</Button>}
    {cooldown > 0 && !bound && <p role="status" className="text-xs text-muted-foreground">{cooldown} {t.cooldown}</p>}
    <Button type="button" variant="ghost" disabled={busy} onClick={check}>{t.refresh}</Button>
  </CardContent></Card>;
}
