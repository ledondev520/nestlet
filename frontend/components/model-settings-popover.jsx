import { useEffect, useState } from 'react';
import { Popover, Tooltip } from 'radix-ui';
import { KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { canManageProvider } from '@/features/auth/auth-model';
import { ModelSettingsForm } from '@/features/auth/model-settings-form';

/** Only the existing owner capability may open the server-held key form. */
export function ModelSettingsPopover({ lang = 'zh', active = true }) {
  const session = useSession();
  if (!active || !canManageProvider(session.status)) return null;
  return <OwnerModelPopover key={session.status.userId || 'owner'} session={session} lang={lang} />;
}

function OwnerModelPopover({ session, lang }) {
  const [open, setOpen] = useState(false);
  const label = lang === 'zh' ? '模型设置' : 'Model settings';
  useEffect(() => {
    const dismiss = () => setOpen(false);
    window.addEventListener('pagehide', dismiss);
    window.addEventListener('popstate', dismiss);
    window.addEventListener('hashchange', dismiss);
    return () => {
      window.removeEventListener('pagehide', dismiss);
      window.removeEventListener('popstate', dismiss);
      window.removeEventListener('hashchange', dismiss);
    };
  }, []);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild><Popover.Trigger asChild><Button variant="outline" size="sm" aria-label={label}><KeyRound aria-hidden="true" /><span>{lang === 'zh' ? '模型' : 'Model'}</span></Button></Popover.Trigger></Tooltip.Trigger>
        {!open && <Tooltip.Portal><Tooltip.Content side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50 max-w-[calc(100vw-1.5rem)] rounded-md bg-foreground px-3 py-2 text-xs text-background">{lang === 'zh' ? '设置 DeepSeek API Key' : 'Set the DeepSeek API key'}</Tooltip.Content></Tooltip.Portal>}
      </Tooltip.Root>
    </Tooltip.Provider>
    <Popover.Portal>
      <Popover.Content aria-label={label} align="end" sideOffset={8} collisionPadding={12} className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-background p-4 text-foreground shadow-lg outline-none">
        <Popover.Close asChild><Button className="absolute right-2 top-2" variant="ghost" size="icon" aria-label={lang === 'zh' ? '关闭模型设置' : 'Close model settings'}><X aria-hidden="true" /></Button></Popover.Close>
        <ModelSettingsForm session={session} lang={lang} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
