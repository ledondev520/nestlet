import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { ModelSettingsPopover } from '@/components/model-settings-popover';
import { AccountControls } from './account-controls.jsx';
import { EmailAccount } from './email-account.jsx';
import { LibraryPermissionSettings } from './library-permission-settings.jsx';
import { AuthPanel } from './auth-panel.jsx';
import { canManageProvider } from './auth-model.js';
import { authCopy } from './copy.js';
import { AccountAdministration, OperationalDiagnostics } from '../account-administration/index.jsx';
import { accountLabel } from '../account-administration/model.js';
import { accountAdministrationCopy } from '../account-administration/copy.js';

export function SettingsPage({ lang = 'zh', active = true }) {
  const session=useSession(), t=authCopy(lang), accessCopy=accountAdministrationCopy(lang);
  if(!session.status?.authenticated)return <AuthPanel lang={lang} />;
  return <section className="space-y-6" aria-label={canManageProvider(session.status)?t.settingsTitle:t.account}>
    <Card className="paper-card"><CardHeader><CardTitle className="paper-title text-xl">{canManageProvider(session.status)?t.settingsTitle:t.account}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><AccountControls lang={lang} /><span data-testid="account-access" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{session.status.role==='owner' && <ShieldCheck className="size-4" aria-hidden="true" />}{accessCopy[accountLabel(session.status)]}</span></CardContent></Card>
    <EmailAccount key={`email:${session.status.userId}`} session={session} lang={lang} active={active} />
    {active && canManageProvider(session.status) && <Card className="paper-card"><CardContent className="pt-6"><ModelSettingsPopover lang={lang} /></CardContent></Card>}
    <LibraryPermissionSettings key={`privacy:${session.status.userId}`} session={session} lang={lang} active={active} />
    <OperationalDiagnostics lang={lang} active={active} />
    <AccountAdministration lang={lang} active={active} />
  </section>;
}
