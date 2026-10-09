import { useSession } from '@/lib/session';
import { CustomerWorkspace } from './workspace';
import { localeCopy } from './copy';

export function CustomersPage({ lang = 'zh', onOpenCase, onDeletedCase, active = true }) {
  const { status, api } = useSession();
  if (!status?.authenticated || !status.userId) return <p role="status" className="py-12 text-center text-muted-foreground">{localeCopy(lang).signIn}</p>;
  // Reset the entire directory, forms, reads and pending navigation on account change.
  return <CustomerWorkspace key={status.userId} api={api} lang={lang} onOpenCase={onOpenCase} onDeletedCase={onDeletedCase} active={active} />;
}
