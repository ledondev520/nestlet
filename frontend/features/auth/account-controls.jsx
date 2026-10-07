import { useState } from 'react';
import { LoaderCircle, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { authCopy, authErrorMessage } from './copy.js';
import { useOperation } from './use-operation.js';

function Controls({ session, lang }) {
  const t=authCopy(lang);
  const username = session.status.username || '';
  const displayName = session.status.email || (/^email-[0-9a-f-]{36}$/iu.test(username) ? '' : username) || t.account;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const operation=useOperation();
  async function signOut() {
    const task=operation.start();if(!task)return;
    // Native confirmation keeps this critical path compatible with strict style CSP.
    if(!window.confirm(`${t.signOutTitle}\n\n${t.signOutWarning}`)){operation.finish(task);return;}
    setBusy(true);setError(null);
    try {await session.logout();}
    catch(failure){if(operation.current(task))setError(failure);}
    finally{if(operation.current(task))setBusy(false);operation.finish(task);}
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"><UserRound className="size-4 shrink-0" aria-hidden="true" /><span className="max-w-36 truncate" title={displayName}>{displayName}</span></span>
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={signOut}>{busy?<LoaderCircle className="animate-spin" aria-hidden="true" />:<LogOut aria-hidden="true" />}{busy?t.signOutBusy:t.signOut}</Button>
    {error && <p role="alert" className="w-full max-w-sm text-xs text-destructive">{authErrorMessage(error,lang)}</p>}
  </div>;
}

/** Compact shell control. A cancelled confirmation never sends logout. */
export function AccountControls({ lang = 'zh' }) {
  const session=useSession();
  if(!session.status?.authenticated)return null;
  return <Controls key={session.status.userId || 'signed-in'} session={session} lang={lang} />;
}
