import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { draftVault } from './draft-vault.js';

const WorkspaceContext = createContext(null);

export function DraftWorkspaceProvider({ userId, workspaceKey, children }) {
  const scope = useMemo(() => ({ userId, workspaceKey }), [userId, workspaceKey]);
  return <WorkspaceContext.Provider value={scope}>{children}</WorkspaceContext.Provider>;
}

/** Text-only, current-tab recovery. Features validate snapshots before restoring.
 * Cleanup deliberately does not clear drafts: session expiry unmounts the UI.
 * Explicit save, workspace switch, logout and identity changes clear through
 * their respective owners. No browser storage or network is used by this hook.
 */
export function useSuspendedDraft(feature) {
  const workspace = useContext(WorkspaceContext);
  const key = useMemo(() => workspace ? { ...workspace, feature } : null, [workspace, feature]);
  const restored = useMemo(() => key ? draftVault.read(key) : null, [key]);
  const [cacheStatus, setCacheStatus] = useState(() => restored ? 'restored' : key ? 'empty' : 'disabled');
  const saveDraft = useCallback(snapshot => {
    if (!key) return false;
    const saved = draftVault.write(key, snapshot);
    setCacheStatus(saved ? 'saved' : 'unavailable');
    return saved;
  }, [key]);
  const clearDraft = useCallback(() => {
    if (!key) return false;
    const removed = draftVault.remove(key);
    setCacheStatus('empty');
    return removed;
  }, [key]);
  return { restored, saveDraft, clearDraft, cacheStatus };
}
