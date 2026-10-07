import { useSession } from '@/lib/session';
import { IntakeWorkspace } from './workspace.jsx';
import { wordsFor } from './copy.js';
export function IntakePage({
  lang = 'zh',
  caseId = null,
  onCaseChange,
  onDirtyChange,
  importRequest,
  onImportHandled,
  onOpenDocuments,
  active = true
}) {
  const {
    status,
    api,
    journey
  } = useSession();
  if (!status?.authenticated || !status.userId) return <p role="status" className="py-12 text-center text-muted-foreground">{wordsFor(lang).signIn}</p>;
  return <IntakeWorkspace key={status.userId} {...{
    lang,
    caseId,
    onCaseChange,
    onDirtyChange,
    importRequest,
    onImportHandled,
    onOpenDocuments,
    active,
    api,
    status,
    journey
  }} />;
}
