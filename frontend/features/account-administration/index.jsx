import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/session';
import { useOperation } from '../auth/use-operation.js';
import { accountAdministrationCopy } from './copy.js';
import { accountLabel, accountSessionKey, canChangeAdministrator, canManageAccounts, changeFailure, readAccounts, readAdministratorChange, verifiedEmail } from './model.js';

function OwnerAccounts({ api, lang }) {
  const t = accountAdministrationCopy(lang), id = useId(), operation = useOperation();
  const [accounts, setAccounts] = useState(null), [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const confirmation = useRef(null), feedback = useRef(null), trigger = useRef(null);

  const load = useCallback(async () => {
    const task = operation.start(); if (!task) return;
    setAccounts(null); setPending(null); setError(''); setNotice(''); setBusy('load');
    try {
      const rows = readAccounts(await api.get('/api/admin/accounts', { signal: task.controller.signal }));
      if (operation.current(task)) setAccounts(rows);
    } catch (failure) {
      if (operation.current(task)) setError('loadError');
    } finally {
      if (operation.current(task)) setBusy('');
      operation.finish(task);
    }
  }, [api, operation]);

  useEffect(() => { load(); return () => operation.cancel(); }, [load, operation]);
  useEffect(() => {
    const clear = () => {
      operation.cancel(); setAccounts(null); setPending(null); setBusy(''); setNotice(''); setError('interrupted');
    };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, [operation]);
  useEffect(() => { if (pending) confirmation.current?.focus(); }, [pending]);
  useEffect(() => { if (error || notice) feedback.current?.focus(); }, [error, notice]);

  function select(account, event) {
    if (busy || pending || !canChangeAdministrator(account)) return;
    trigger.current = event.currentTarget;
    setNotice(''); setError(''); setPending(account);
  }
  function cancel() {
    if (busy) return;
    setPending(null);
    // The action button remains in place; it becomes enabled in this commit.
    const button = trigger.current;
    queueMicrotask(() => button?.isConnected && button.focus());
  }
  async function confirm() {
    if (busy || !pending || !accounts?.includes(pending) || !canChangeAdministrator(pending)) return;
    const selected = pending, administrator = !selected.administrator;
    const task = operation.start(); if (!task) return;
    setBusy('save'); setError(''); setNotice('');
    // An uncertain write must never leave an actionable stale roster behind.
    setAccounts(null);
    let acknowledged = false;
    try {
      const result = readAdministratorChange(await api.put(`/api/admin/accounts/${encodeURIComponent(selected.id)}/administrator`, {
        administrator, expectedVersion: selected.capabilityVersion,
      }, { signal: task.controller.signal }), selected, administrator);
      if (!operation.current(task)) return;
      acknowledged = true;
      const rows = readAccounts(await api.get('/api/admin/accounts', { signal: task.controller.signal }));
      if (operation.current(task)) { setAccounts(rows); setNotice(result.changed ? 'saved' : 'unchanged'); }
    } catch (failure) {
      if (operation.current(task)) { setAccounts(null); setError(acknowledged ? 'refreshFailed' : changeFailure(failure)); }
    } finally {
      if (operation.current(task)) { setBusy(''); setPending(null); }
      operation.finish(task);
    }
  }

  return <Card className="paper-card" aria-labelledby={`${id}-title`}>
    <CardHeader>
      <CardTitle id={`${id}-title`} className="paper-title text-xl">{t.title}</CardTitle>
      <CardDescription className="whitespace-pre-line">{t.description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5" aria-busy={Boolean(busy)}>
      <p className="whitespace-pre-line paper-note rounded-r-md p-3 text-sm leading-relaxed">{t.boundary}</p>
      {busy && <p role="status" className="whitespace-pre-line text-sm text-muted-foreground">{busy === 'save' ? t.saving : t.loading}</p>}
      {(error || notice) && <p ref={feedback} tabIndex={-1} role={error ? 'alert' : 'status'} className={error ? 'whitespace-pre-line rounded-md border border-destructive/30 p-3 text-sm text-destructive' : 'whitespace-pre-line rounded-md border p-3 text-sm'}>{t[error || notice]}</p>}
      {pending && <section aria-labelledby={`${id}-confirm`} className="space-y-3 rounded-lg border border-primary/30 bg-secondary/30 p-4">
        <h3 ref={confirmation} tabIndex={-1} id={`${id}-confirm`} className="font-semibold">{t.confirmTitle}</h3>
        <p className="whitespace-pre-line break-words text-sm">{t.selected}: <strong>{pending.username}</strong>{pending.email ? ` · ${pending.email}` : ''}</p>
        <p className="whitespace-pre-line text-sm leading-relaxed">{pending.administrator ? t.revokeEffect : t.grantEffect}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{t.confirmHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={pending.administrator ? 'destructive' : 'default'} disabled={Boolean(busy)} onClick={confirm}>{pending.administrator ? t.confirmRevoke : t.confirmGrant}</Button>
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={cancel}>{t.cancel}</Button>
        </div>
      </section>}
      {accounts && (accounts.length === 0 ? <p className="whitespace-pre-line text-sm text-muted-foreground">{t.empty}</p> : <ul aria-label={t.directory} className="space-y-3">
        {accounts.map(account => {
          const mutable = canChangeAdministrator(account);
          const reason = account.role === 'owner' ? t.ownerReason : !verifiedEmail(account) ? t.bindFirst : t.unavailable;
          return <li key={account.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words font-medium">{account.username}</h3><Badge variant={accountLabel(account) === 'ordinary' ? 'outline' : 'secondary'}>{t[accountLabel(account)]}</Badge></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-muted-foreground">{t.email}</dt><dd className="break-words">{account.email || t.noEmail}<span className="mt-1 block text-xs text-muted-foreground">{verifiedEmail(account) ? t.verified : t.unverified}</span></dd></div>
              <div><dt className="text-muted-foreground">{t.created}</dt><dd>{new Date(account.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')}</dd></div>
            </dl>
            {mutable ? <Button type="button" variant="outline" className="max-w-full whitespace-normal" disabled={Boolean(busy || pending)} aria-label={`${account.administrator ? t.revoke : t.grant}: ${account.username}`} onClick={event => select(account, event)}>{account.administrator ? t.revoke : t.grant}</Button> : <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{reason}</p>}
          </li>;
        })}
      </ul>)}
      <Button type="button" variant="ghost" onClick={load} disabled={Boolean(busy || pending)}>{t.reload}</Button>
    </CardContent>
  </Card>;
}

/** Testable boundary: unauthorized/inactive sessions never mount or request a directory. */
export function AccountAdministrationPanel({ api, status, lang = 'zh', active = true }) {
  if (!active || !canManageAccounts(status)) return null;
  return <OwnerAccounts key={accountSessionKey(status)} api={api} lang={lang} />;
}

/** Mount inside SessionProvider; the application decides where this optional page appears. */
export function AccountAdministration({ lang = 'zh', active = true }) {
  const { api, status } = useSession();
  return <AccountAdministrationPanel api={api} status={status} lang={lang} active={active} />;
}

export { OperationalDiagnostics, OperationalDiagnosticsPanel } from './diagnostics.jsx';
