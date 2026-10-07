import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { PasswordFields, clearNativePasswords } from './auth-fields.jsx';
import { passwordPayload } from './auth-model.js';
import { authCopy, authErrorMessage } from './copy.js';
import { useOperation } from './use-operation.js';

/** No effect consumes tokens: scanners and prefetchers cannot activate accounts. */
export function EmailLinkPanel({ link, lang = 'zh', onClose }) {
  const { api, status, refresh } = useSession();
  const t = authCopy(lang), id = useId(), operation = useOperation();
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false), [used, setUsed] = useState(!link.valid);
  const [done, setDone] = useState(false), [error, setError] = useState(null);
  const reset = link.mode === 'reset';
  useEffect(() => {
    const clear = () => { operation.cancel(); link.clear(); clearNativePasswords(formRef.current); setUsed(true); setBusy(false); };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, [link, operation]);
  async function submit(event) {
    event.preventDefault();
    if (busy || used || status.secureLogin !== true) return;
    const native = new window.FormData(event.currentTarget);
    const parsed = reset ? passwordPayload(native.get('password'), native.get('passwordConfirmation')) : { ok: true, payload: {} };
    if (!parsed.ok) { setError(parsed); return; }
    const task = operation.start(); if (!task) return;
    const token = link.takeToken();
    setUsed(true); clearNativePasswords(formRef.current); setError(null);
    if (!token) { setError({ code: 'EMAIL_TOKEN_INVALID' }); operation.finish(task); return; }
    setBusy(true);
    try {
      const result = await api.post(reset ? '/api/auth/password/reset' : '/api/auth/email/verify', { token, ...parsed.payload }, { signal: task.controller.signal, telemetry: false });
      if (!operation.current(task)) return;
      if (result?.[reset ? 'reset' : 'verified'] !== true || result.authenticated !== false) throw { code: 'INVALID_RESPONSE' };
      setDone(true);
      // Binding may update the current account; a reset invalidates all old sessions.
      await refresh({ signal: task.controller.signal }).catch(() => {});
    } catch (failure) { if (operation.current(task) && failure.name !== 'AbortError') setError(failure); }
    finally { if (operation.current(task)) setBusy(false); operation.finish(task); }
  }
  function close() { operation.cancel(); link.clear(); clearNativePasswords(formRef.current); onClose?.(); }
  return <Card className="paper-card mx-auto w-full max-w-lg"><CardHeader className="space-y-3"><MailCheck className="size-5 text-muted-foreground" aria-hidden="true" /><CardTitle className="paper-title text-2xl">{reset ? t.resetTitle : t.verifyTitle}</CardTitle><CardDescription>{reset ? t.resetHint : t.verifyHint}</CardDescription></CardHeader><CardContent className="space-y-5">
    {done ? <p role="status" className="paper-note rounded-r-md p-3 text-sm">{reset ? t.resetDone : t.verified}</p> : <form ref={formRef} autoComplete="on" method="post" noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {used && !busy && <p role="status" className="text-sm leading-relaxed text-muted-foreground">{link.valid ? t.linkSubmitted : t.linkUnavailable}</p>}
      {status.secureLogin !== true && <p role="alert" className="text-sm text-destructive">{t.insecureLogin}</p>}
      {reset && !used && <PasswordFields id={id} t={t} onChange={() => setError(null)} disabled={busy || status.secureLogin !== true} error={error} />}
      {error && <p role="alert" className="text-sm text-destructive">{authErrorMessage(error, lang)}</p>}
      {!used && <Button className="w-full" type="submit" disabled={busy || status.secureLogin !== true}>{reset ? t.reset : t.verify}</Button>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{reset ? t.resetBusy : t.verifyBusy}</p>}
    </form>}
    <Button type="button" variant="outline" onClick={close}>{done ? status.authenticated ? t.continueAccount : t.backToLogin : t.leaveLink}</Button>
    <p className="text-xs leading-relaxed text-muted-foreground">{t.emailPrivacy}</p>
  </CardContent></Card>;
}
