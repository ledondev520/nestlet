import { useEffect, useId, useRef, useState } from 'react';
import { Upload, FileText, ArrowRight, RotateCcw, Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useSuspendedDraft } from '@/lib/suspended-draft';
import { FIELDS, LIMITS, IntakeError, caseWork, casePayload, fileType, appendSource, applySuggestions, reconcileWork, validateWorkbook, extract, parseCSV, validateSuggestions, importMatches, equal, isUuid, recoverySnapshot, validRecovery, restoreEdits } from './logic.js';
import { wordsFor, errorText } from './copy.js';
import { WorkbookMapping } from './workbook.jsx';
const timeout = (signal, ms = 20000) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);
const aborted = error => error?.name === 'AbortError';
const failureFor = error => error?.name === 'TimeoutError' ? new IntakeError('NETWORK_ERROR') : error;
const changedFacts = (base, work) => !equal(caseWork(base).fields, work.fields);
const validRecord = record => isUuid(record?.id) && Number.isSafeInteger(record.version) && record.version > 0 && typeof record.sourceText === 'string' && Array.isArray(record.fields);

/** Account/case-scoped work buffers. Reading a newer record never replaces dirty input. */
export function IntakeWorkspace({
  api,
  status,
  lang = 'zh',
  caseId = null,
  onCaseChange,
  onDirtyChange,
  importRequest,
  onImportHandled,
  onOpenDocuments,
  active = true
}) {
  const words = wordsFor(lang),
    id = useId();
  const {
    restored,
    saveDraft,
    clearDraft,
    cacheStatus
  } = useSuspendedDraft('intake');
  const recovery = useRef(validRecovery(restored, caseId) ? restored : null),
    recovered = useRef(false);
  const [work, setWork] = useState(() => recovery.current && !caseId ? restoreEdits(recovery.current) : caseWork());
  const [base, setBase] = useState(null),
    [latest, setLatest] = useState(null);
  const [phase, setPhase] = useState('idle'),
    [reading, setReading] = useState(Boolean(caseId));
  const [error, setError] = useState(null),
    [notice, setNotice] = useState(recovery.current && !caseId ? 'recovered' : ''),
    [conflict, setConflict] = useState(false);
  const [queue, setQueue] = useState([]),
    [assets, setAssets] = useState([]),
    [workbook, setWorkbook] = useState(null);
  const [aiConsent, setAiConsent] = useState(false);
  const workRef = useRef(work),
    baseRef = useRef(base),
    queueRef = useRef(queue),
    assetsRef = useRef(assets);
  const mounted = useRef(true),
    epoch = useRef(0),
    editVersion = useRef(0),
    busyRef = useRef(false),
    operation = useRef(null),
    readOperation = useRef(null);
  const caseRef = useRef(caseId),
    incomingCase = useRef(caseId),
    adoption = useRef(null),
    pendingBinding = useRef(false),
    ownerRef = useRef(status.userId);
  const handledImports = useRef(new Set()),
    callbacks = useRef({});
  callbacks.current = {
    onCaseChange,
    onDirtyChange,
    onImportHandled,
    onOpenDocuments
  };
  incomingCase.current = caseId;
  ownerRef.current = status.userId;
  const busy = phase !== 'idle';
  const localDirty = !equal(work, caseWork(base));
  const pendingAssociations = assets.some(asset => !asset.caseId);
  const dirty = localDirty || pendingAssociations || busy || queue.some(item => item.file) || Boolean(workbook);
  const initialLoading = reading && Boolean(caseRef.current) && !base;
  const blocked = busy || initialLoading || Boolean(caseRef.current && !base);
  const scoped = () => ({
    epoch: epoch.current,
    caseId: caseRef.current,
    userId: ownerRef.current
  });
  const current = scope => mounted.current && scope.epoch === epoch.current && scope.caseId === caseRef.current && scope.userId === ownerRef.current && (incomingCase.current === caseRef.current || adoption.current?.id === caseRef.current && incomingCase.current === adoption.current.previous);
  const requireCurrent = scope => {
    if (!current(scope)) throw new DOMException('Context changed', 'AbortError');
  };
  const updateWork = (next, edited = true) => {
    workRef.current = typeof next === 'function' ? next(workRef.current) : next;
    if (edited) editVersion.current++;
    setWork(workRef.current);
  };
  const updateBase = next => {
    baseRef.current = next;
    setBase(next);
  };
  const updateQueue = next => {
    queueRef.current = typeof next === 'function' ? next(queueRef.current) : next;
    setQueue(queueRef.current);
  };
  const updateAssets = next => {
    assetsRef.current = typeof next === 'function' ? next(assetsRef.current) : next;
    setAssets(assetsRef.current);
  };
  const addAsset = asset => updateAssets(items => [asset, ...items.filter(item => item.id !== asset.id)]);
  const updateItem = (key, patch) => updateQueue(items => items.map(item => item.id === key ? {
    ...item,
    ...patch
  } : item));
  const begin = next => {
    if (busyRef.current) return null;
    const controller = new AbortController();
    operation.current = controller;
    busyRef.current = true;
    setPhase(next);
    setError(null);
    setNotice('');
    return {
      scope: scoped(),
      controller
    };
  };
  const finish = token => {
    if (current(token.scope) && operation.current === token.controller) {
      operation.current = null;
      busyRef.current = false;
      setPhase('idle');
    }
  };
  const markSource = value => {
    updateWork(previous => ({
      ...previous,
      sourceText: value
    }));
    setAiConsent(false);
    setNotice('');
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
      operation.current?.abort();
      readOperation.current?.abort();
      callbacks.current.onDirtyChange?.(false);
    };
  }, []);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (initialLoading) return;
    if (localDirty || pendingAssociations) saveDraft(recoverySnapshot(work, base, caseRef.current, assets));else clearDraft();
  }, [work, base, assets, localDirty, pendingAssociations, initialLoading, saveDraft, clearDraft]);
  useEffect(() => {
    if (!dirty) return;
    const guard = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function readCurrent({
    compare = false
  } = {}) {
    const savedId = caseRef.current;
    if (!savedId) return;
    readOperation.current?.abort();
    const controller = new AbortController();
    readOperation.current = controller;
    const scope = scoped(),
      revision = editVersion.current;
    setReading(true);
    try {
      const result = await api.get(`/api/cases/${savedId}`, {
        signal: timeout(controller.signal)
      });
      requireCurrent(scope);
      if (readOperation.current !== controller) return;
      if (!validRecord(result.case) || result.case.id !== savedId) throw new IntakeError('INVALID_RESPONSE');
      if (pendingBinding.current) {
        pendingBinding.current = false;
        try {
          const next = reconcileWork(null, workRef.current, result.case);
          updateBase(result.case);
          updateWork(next);
          setConflict(false);
        } catch (failure) {
          updateBase({
            ...result.case,
            ...caseWork()
          });
          setLatest(result.case);
          setConflict(true);
          setError(failure);
        }
      }
      if (recovery.current && !recovered.current) {
        recovered.current = true;
        const saved = recovery.current;
        updateWork(restoreEdits(saved, result.case), false);
        if (saved.baseVersion !== result.case.version) {
          updateBase({
            ...result.case,
            ...caseWork(),
            version: saved.baseVersion
          });
          setLatest(result.case);
          setConflict(true);
        } else {
          updateBase(result.case);
          setLatest(null);
          setConflict(false);
        }
        setNotice('recovered');
      }
      const edited = !equal(workRef.current, caseWork(baseRef.current)) || revision !== editVersion.current;
      if (compare || edited && baseRef.current?.version !== result.case.version) {
        setLatest(result.case);
        setConflict(true);
      } else if (!edited) {
        updateBase(result.case);
        updateWork(caseWork(result.case), false);
        setLatest(null);
        setConflict(false);
      }
      // Independent materials reads cannot prevent case recovery.
      try {
        if (recovery.current?.assetIds?.length) {
          for (const assetId of recovery.current.assetIds.filter(isUuid).slice(0, 10)) {
            try {
              const recoveredAsset = await api.get(`/api/assets/${assetId}`, {
                signal: timeout(controller.signal)
              });
              requireCurrent(scope);
              if (isUuid(recoveredAsset.asset?.id) && (!recoveredAsset.asset.caseId || recoveredAsset.asset.caseId === savedId)) addAsset(recoveredAsset.asset);
            } catch (failure) {
              if (aborted(failure) || !current(scope)) throw failure;
            }
          }
          recovery.current.assetIds = [];
        }
        const archive = await api.get(`/api/assets?caseId=${savedId}&limit=100`, {
          signal: timeout(controller.signal)
        });
        requireCurrent(scope);
        let archiveAssets = Array.isArray(archive.assets) ? archive.assets : [];
        if (archive.total > 100) {
          const next = await api.get(`/api/assets?caseId=${savedId}&limit=100&offset=100`, {
            signal: timeout(controller.signal)
          });
          requireCurrent(scope);
          if (Array.isArray(next.assets)) archiveAssets = [...archiveAssets, ...next.assets];
        }
        if (readOperation.current === controller) updateAssets(existing => [...archiveAssets, ...existing.filter(asset => !asset.caseId && !archiveAssets.some(item => item.id === asset.id))]);
      } catch (failure) {
        if (!aborted(failure) && current(scope)) setError(failureFor(failure));
      }
    } catch (failure) {
      if (!aborted(failure) && current(scope) && readOperation.current === controller) setError(failureFor(failure));
    } finally {
      if (current(scope) && readOperation.current === controller) {
        readOperation.current = null;
        setReading(false);
      }
    }
  }
  useEffect(() => {
    if (caseId === caseRef.current) {
      if (adoption.current?.id === caseId) adoption.current = null;
      return;
    }
    if (adoption.current?.id === caseId) {
      caseRef.current = caseId;
      adoption.current = null;
      return;
    }
    if (!caseRef.current && caseId) {
      // App keeps visited pages mounted when another page first binds this workspace.
      epoch.current++;
      operation.current?.abort();
      readOperation.current?.abort();
      operation.current = null;
      readOperation.current = null;
      busyRef.current = false;
      caseRef.current = caseId;
      pendingBinding.current = true;
      recovery.current = null;
      setPhase('idle');
      setReading(true);
      setAiConsent(false);
      return;
    }
    epoch.current++;
    operation.current?.abort();
    readOperation.current?.abort();
    operation.current = null;
    readOperation.current = null;
    busyRef.current = false;
    caseRef.current = caseId;
    adoption.current = null;
    editVersion.current = 0;
    recovery.current = null;
    recovered.current = false;
    pendingBinding.current = false;
    updateWork(caseWork(), false);
    updateBase(null);
    updateQueue([]);
    updateAssets([]);
    setWorkbook(null);
    setLatest(null);
    setConflict(false);
    setError(null);
    setNotice('');
    setAiConsent(false);
    setPhase('idle');
    setReading(Boolean(caseId));
  }, [caseId]);
  useEffect(() => {
    if (active && caseRef.current && !adoption.current) readCurrent();
  }, [active, caseId, api]);
  useEffect(() => {
    if (caseRef.current || !recovery.current?.assetIds?.length) return;
    const controller = new AbortController(),
      scope = scoped();
    const ids = recovery.current.assetIds.filter(isUuid).slice(0, 10);
    Promise.all(ids.map(async assetId => {
      try {
        const result = await api.get(`/api/assets/${assetId}`, {
          signal: timeout(controller.signal)
        });
        if (current(scope) && isUuid(result.asset?.id) && !result.asset.caseId) addAsset(result.asset);
      } catch {/* A missing original never blocks text recovery. */}
    })).then(() => {
      if (current(scope) && !controller.signal.aborted && recovery.current) recovery.current.assetIds = [];
    });
    return () => controller.abort();
  }, []);
  function addFiles(files) {
    if (busyRef.current) return;
    const additions = [...files];
    if (additions.length + queueRef.current.filter(item => item.file).length > LIMITS.queue) {
      setError(new IntakeError('QUEUE_FULL'));
      return;
    }
    const items = additions.map(file => {
      try {
        fileType(file);
        return {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          state: 'pending'
        };
      } catch (failure) {
        return {
          id: crypto.randomUUID(),
          name: file.name,
          file: null,
          state: 'error',
          error: failure
        };
      }
    });
    updateQueue(previous => [...previous.filter(item => !item.file).slice(-20), ...previous.filter(item => item.file), ...items]);
    setNotice('');
  }
  useEffect(() => {
    if (!importMatches(importRequest, status.userId, caseRef.current) || handledImports.current.has(importRequest.id) || busyRef.current) return;
    handledImports.current.add(importRequest.id);
    addFiles(importRequest.files);
    callbacks.current.onImportHandled?.(importRequest.id);
  }, [importRequest, status.userId, caseId, phase]);
  async function processFiles() {
    const token = begin('processing');
    if (!token) return;
    try {
      for (const item of queueRef.current.filter(entry => entry.file)) {
        requireCurrent(token.scope);
        if (token.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        let asset = item.asset;
        try {
          const type = fileType(item.file);
          updateItem(item.id, {
            state: 'processing',
            error: null,
            notice: ''
          });
          if (!asset) {
            const path = `/api/assets${token.scope.caseId ? `?caseId=${token.scope.caseId}` : ''}`;
            const result = await api.upload(path, item.file, {
              contentType: type.mime,
              filename: item.name,
              assetConsent: true,
              signal: timeout(token.controller.signal, 60000)
            });
            requireCurrent(token.scope);
            if (!isUuid(result.asset?.id)) throw new IntakeError('INVALID_RESPONSE');
            asset = result.asset;
            addAsset(asset);
            updateItem(item.id, {
              asset,
              state: 'saved'
            });
          }
          if (type.workbook) {
            const result = validateWorkbook(await api.upload('/api/workbook', item.file, {
              contentType: type.mime,
              documentConsent: true,
              signal: timeout(token.controller.signal, 60000)
            }));
            requireCurrent(token.scope);
            setWorkbook({
              ...result,
              filename: item.name,
              queueId: item.id,
              assetId: asset.id
            });
            updateItem(item.id, {
              state: 'mapping'
            });
            break;
          }
          if (asset.textStatus === 'unavailable' || type.image) {
            updateItem(item.id, {
              file: null,
              state: 'saved',
              notice: 'unavailable'
            });
            continue;
          }
          if (type.extension === 'csv') {
            let text;
            try {
              text = parseCSV(new TextDecoder('utf-8', {
                fatal: true
              }).decode(await item.file.arrayBuffer()));
            } catch {
              throw new IntakeError('CSV_INVALID');
            }
            requireCurrent(token.scope);
            markSource(appendSource(workRef.current.sourceText, text));
            updateItem(item.id, {
              file: null,
              state: 'ready',
              notice: 'textAdded'
            });
            setNotice('textAdded');
            continue;
          }
          const result = await api.get(`/api/assets/${asset.id}/text`, {
            signal: timeout(token.controller.signal)
          });
          requireCurrent(token.scope);
          if (result.asset?.textTruncated || asset.textTruncated) {
            updateItem(item.id, {
              file: null,
              state: 'saved',
              notice: 'truncated'
            });
            continue;
          }
          if (result.asset?.textStatus === 'unavailable') {
            updateItem(item.id, {
              file: null,
              state: 'saved',
              notice: 'unavailable'
            });
            continue;
          }
          if (typeof result.text !== 'string') throw new IntakeError('INVALID_RESPONSE');
          const text = result.text;
          const sourceText = appendSource(workRef.current.sourceText, text);
          markSource(sourceText);
          updateItem(item.id, {
            file: null,
            state: 'ready',
            notice: 'textAdded'
          });
          setNotice('textAdded');
        } catch (failure) {
          if (aborted(failure) || !current(token.scope)) throw failure;
          updateItem(item.id, {
            state: 'error',
            error: failureFor(failure),
            notice: asset ? 'savedParseError' : 'uploadError'
          });
          // Stop on a failed file so the operator can inspect its exact saved state.
          break;
        }
      }
    } catch (failure) {
      if (current(token.scope)) setNotice(aborted(failure) ? 'cancelNote' : 'uploadError');
    } finally {
      finish(token);
    }
  }
  function closeMapping() {
    if (workbook) updateItem(workbook.queueId, {
      file: null,
      state: 'saved'
    });
    setWorkbook(null);
  }
  function applyMapping(result) {
    const sourceText = appendSource(workRef.current.sourceText, result.text);
    const next = applySuggestions({
      ...workRef.current,
      sourceText
    }, result.fields, 'manual');
    updateWork(next);
    setAiConsent(false);
    updateItem(workbook.queueId, {
      file: null,
      state: 'ready',
      notice: 'mappingDone'
    });
    setWorkbook(null);
    setNotice('mappingDone');
  }
  function manualExtract() {
    try {
      if (!workRef.current.sourceText.trim()) throw new IntakeError('SOURCE_EMPTY');
      if (workRef.current.sourceText.length > LIMITS.source) throw new IntakeError('TEXT_TOO_LARGE');
      updateWork(applySuggestions(workRef.current, extract(workRef.current.sourceText), 'manual'));
      setNotice('extracted');
      setError(null);
    } catch (failure) {
      setError(failure);
    }
  }
  async function liveExtract() {
    if (!aiConsent) {
      setError(new IntakeError('CONSENT_REQUIRED'));
      return;
    }
    if (!status.liveEnabled) {
      setError(new IntakeError('LIVE_DISABLED'));
      return;
    }
    if (!workRef.current.sourceText.trim()) {
      setError(new IntakeError('SOURCE_EMPTY'));
      return;
    }
    const token = begin('extracting');
    if (!token) return;
    const sourceText = workRef.current.sourceText;
    try {
      const result = await api.post('/api/extract', {
        text: sourceText,
        consent: true
      }, {
        signal: timeout(token.controller.signal, 65000)
      });
      requireCurrent(token.scope);
      if (!Array.isArray(result.fields) || result.fields.length !== FIELDS.length || result.fields.some((field, index) => field?.key !== FIELDS[index] || typeof field.value !== 'string' || typeof field.source !== 'string')) throw new IntakeError('INVALID_RESPONSE');
      updateWork(applySuggestions(workRef.current, validateSuggestions(result.fields, sourceText), 'live'));
      setNotice('extracted');
      setAiConsent(false);
    } catch (failure) {
      if (!aborted(failure) && current(token.scope)) setError(failureFor(failure));else if (current(token.scope)) setNotice('cancelNote');
    } finally {
      finish(token);
    }
  }
  function editField(key, patch) {
    updateWork(previous => ({
      ...previous,
      namesVerified: false,
      fields: previous.fields.map(field => field.key === key ? {
        ...field,
        ...patch
      } : field)
    }));
    setNotice('');
  }
  async function linkAssets(savedId, token) {
    let failed = false;
    for (const asset of assetsRef.current.filter(item => !item.caseId)) {
      try {
        const result = await api.patch(`/api/assets/${asset.id}`, {
          caseId: savedId,
          expectedVersion: asset.version
        }, {
          signal: timeout(token.controller.signal)
        });
        requireCurrent(token.scope);
        addAsset(result.asset);
      } catch (failure) {
        if (aborted(failure) || !current(token.scope)) throw failure;
        if (failure.code === 'ASSET_CONFLICT') {
          try {
            const latestAsset = await api.get(`/api/assets/${asset.id}`, {
              signal: timeout(token.controller.signal)
            });
            requireCurrent(token.scope);
            if (latestAsset.asset?.caseId === savedId) {
              addAsset(latestAsset.asset);
              continue;
            }
            if (latestAsset.asset && !latestAsset.asset.caseId) addAsset(latestAsset.asset);
          } catch (readFailure) {
            if (aborted(readFailure) || !current(token.scope)) throw readFailure;
          }
        }
        failed = true;
      }
    }
    return !failed;
  }
  async function retryLinks() {
    const token = begin('saving');
    if (!token) return;
    try {
      setNotice((await linkAssets(caseRef.current, token)) ? 'linkSuccess' : 'linkFailed');
    } catch (failure) {
      if (current(token.scope)) setError(failure);
    } finally {
      finish(token);
    }
  }
  async function saveCase(openDocuments = false) {
    if (conflict) return;
    const token = begin('saving');
    if (!token) return;
    try {
      const savedRevision = editVersion.current;
      const payload = casePayload(workRef.current, words.untitled);
      // The backend atomically archives any invalidated carried-forward draft.
      // Never clear it here or attempt a separate non-transactional artifact write.
      const oldId = caseRef.current;
      const result = oldId ? await api.put(`/api/cases/${oldId}`, {
        ...payload,
        expectedVersion: baseRef.current.version
      }, {
        signal: timeout(token.controller.signal)
      }) : await api.post('/api/cases', payload, {
        signal: timeout(token.controller.signal)
      });
      requireCurrent(token.scope);
      if (!validRecord(result.case) || oldId && result.case.id !== oldId) throw new IntakeError('INVALID_RESPONSE');
      const newerEdits = editVersion.current !== savedRevision;
      updateBase(result.case);
      if (!newerEdits) updateWork(caseWork(result.case), false);
      else updateWork(previous => ({ ...previous, draftText: previous.draftText === payload.draftText ? result.case.draftText : previous.draftText }), false);
      setLatest(null);
      setConflict(false);
      if (!oldId) {
        adoption.current = {
          id: result.case.id,
          previous: incomingCase.current
        };
        caseRef.current = result.case.id;
        token.scope.caseId = result.case.id;
        callbacks.current.onCaseChange?.(result.case.id);
      }
      const linked = await linkAssets(result.case.id, token);
      requireCurrent(token.scope);
      const stillCurrentEdits = editVersion.current === savedRevision;
      if (linked && stillCurrentEdits) clearDraft();
      setNotice(!linked ? 'linkFailed' : !stillCurrentEdits ? result.archivedLegacyDraft ? 'archivedNewerEdits' : 'savedNewerEdits' : result.archivedLegacyDraft ? 'archived' : 'saved');
      if (openDocuments && stillCurrentEdits) callbacks.current.onOpenDocuments?.(result.case.id);
    } catch (failure) {
      if (!aborted(failure) && current(token.scope)) {
        setError(failureFor(failure));
        if (failure.status === 409 || failure.code === 'CASE_CONFLICT') setConflict(true);
      }
    } finally {
      finish(token);
    }
  }
  function reconcile() {
    try {
      const next = reconcileWork(baseRef.current, workRef.current, latest);
      updateBase(latest);
      updateWork(next);
      setLatest(null);
      setConflict(false);
      setError(null);
      setNotice('reconcileDone');
      setAiConsent(false);
    } catch (failure) {
      setError(failure);
    }
  }
  function useLatest() {
    if (!window.confirm(words.replaceAsk)) return;
    updateBase(latest);
    updateWork(caseWork(latest));
    setLatest(null);
    setConflict(false);
    setError(null);
    setNotice('');
    setAiConsent(false);
  }
  const sourceTooLong = work.sourceText.length > LIMITS.source;
  const reviewed = work.fields.filter(field => field.confirmed && !field.conflict).length;
  const hasLegacyChange = Boolean(work.draftText && changedFacts(base, work));
  return <section className="space-y-7 py-8" aria-labelledby={`${id}-title`}>
    <header className="space-y-3"><p className="font-mono text-xs tracking-widest text-muted-foreground">{words.eyebrow}</p><div className="flex flex-wrap items-center justify-between gap-3"><h1 id={`${id}-title`} className="paper-title text-3xl font-bold tracking-tight">{words.title}</h1><Badge variant="outline">{base ? `${words.version} ${base.version}` : words.notSaved}</Badge></div><p className="max-w-2xl text-sm leading-7 text-muted-foreground">{words.intro}</p></header>
    {error && <Alert variant="destructive"><AlertDescription>{errorText(error, words)}</AlertDescription></Alert>}
    {notice && <Alert><Check className="size-4" aria-hidden="true" /><AlertDescription>{words[notice] || notice}</AlertDescription></Alert>}
    {cacheStatus === 'unavailable' && <p role="status" className="text-sm text-destructive">{words.cacheUnavailable}</p>}
    {reading && <p role="status" className="text-sm text-muted-foreground">{words.loading}</p>}
    {!reading && caseRef.current && !base && <Button variant="outline" onClick={() => readCurrent()}><RotateCcw aria-hidden="true" />{words.retry}</Button>}
    {conflict && <Card className="border-destructive/40"><CardHeader><CardTitle>{words.changedElsewhere}</CardTitle><CardDescription>{words.compareHelp}</CardDescription></CardHeader><CardContent className="space-y-4"><Button variant="outline" disabled={busy || reading} onClick={() => readCurrent({
          compare: true
        })}>{words.readLatest}</Button>{latest && <><p className="text-sm">{words.latest} · {words.version} {latest.version} · {latest.title}</p><dl className="grid gap-2 text-sm sm:grid-cols-2">{caseWork(latest).fields.map(field => <div key={field.key}><dt className="text-muted-foreground">{words.fieldLabels[field.key]}</dt><dd className="break-words">{field.value || words.unknown}</dd></div>)}</dl><details><summary className="cursor-pointer text-sm">{words.remoteSource}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs">{latest.sourceText || words.unknown}</pre></details><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={reconcile}>{words.reconcile}</Button><Button variant="ghost" disabled={busy} onClick={useLatest}>{words.replaceLatest}</Button></div></>}</CardContent></Card>}
    <div className="space-y-2"><Label htmlFor={`${id}-case-title`}>{words.caseTitle}</Label><Input id={`${id}-case-title`} maxLength={120} value={work.title} placeholder={words.untitled} disabled={blocked} onChange={event => updateWork(previous => ({
        ...previous,
        title: event.target.value
      }))} /></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="size-4" aria-hidden="true" />{words.materialTitle}</CardTitle><CardDescription>{words.materialHelp}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="paper-note flex gap-3 rounded-md p-4 text-sm leading-6"><ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" /><p>{words.safeOnly}</p></div><div className="rounded-lg border border-dashed border-input bg-background p-5"><Label htmlFor={`${id}-files`} className="mb-3 block">{words.chooseFiles}</Label><Input id={`${id}-files`} type="file" multiple accept=".txt,.csv,.pdf,.xlsx,.xls,.png,.jpg,.jpeg" disabled={blocked || Boolean(workbook)} aria-describedby={`${id}-formats`} onChange={event => {
            addFiles(event.target.files);
            event.target.value = '';
          }} /><p id={`${id}-formats`} className="mt-3 text-xs text-muted-foreground">{words.formats}</p></div>
      {queue.length ? <ul className="space-y-2" aria-label={words.queue}>{queue.map(item => <li key={item.id} className="rounded-md border p-3 text-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-medium">{item.name}</p>{item.asset && <p className="mt-1 text-xs text-muted-foreground">{words.savedAsset}</p>}</div><Button variant="ghost" size="icon-sm" aria-label={`${words.remove}: ${item.name}`} disabled={busy || item.id === workbook?.queueId} onClick={() => updateQueue(previous => previous.filter(entry => entry.id !== item.id))}><X aria-hidden="true" /></Button></div>{item.notice && <p className="mt-2 leading-6 text-muted-foreground">{words[item.notice]}</p>}{item.error && <p className="mt-2 text-destructive" role="alert">{errorText(item.error, words)}</p>}</li>)}</ul> : <p className="text-sm text-muted-foreground">{words.queueEmpty}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={blocked || Boolean(workbook) || !queue.some(item => item.file)} onClick={processFiles}>{phase === 'processing' ? words.processing : words.saveFiles}</Button>{busy && phase !== 'saving' && <Button variant="outline" onClick={() => operation.current?.abort()}>{words.cancel}</Button>}</div>
      {!base && assets.some(asset => !asset.caseId) && <p className="text-xs text-muted-foreground">{words.standalone}</p>}
    </CardContent></Card>
    {workbook && <WorkbookMapping key={workbook.queueId} workbook={workbook} words={words} disabled={blocked} onApply={result => {
      try {
        applyMapping(result);
      } catch (failure) {
        setError(failure);
      }
    }} onClose={closeMapping} />}
    <Card><CardHeader><CardTitle>{words.sourceTitle}</CardTitle><CardDescription>{words.sourceHelp}</CardDescription></CardHeader><CardContent className="space-y-4"><Label className="sr-only" htmlFor={`${id}-source`}>{words.sourceTitle}</Label><Textarea id={`${id}-source`} className="min-h-64 resize-y font-mono text-sm leading-7" value={work.sourceText} placeholder={words.sourcePlaceholder} disabled={blocked} aria-invalid={sourceTooLong} aria-describedby={`${id}-source-count`} onChange={event => markSource(event.target.value)} /><p id={`${id}-source-count`} className={`text-right font-mono text-xs ${sourceTooLong ? 'text-destructive' : 'text-muted-foreground'}`}>{work.sourceText.length.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')} / 50,000 {words.chars}</p>{sourceTooLong && <p role="alert" className="text-sm text-destructive">{words.sourceTooLong}</p>}<div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={blocked || sourceTooLong || !work.sourceText.trim()} onClick={manualExtract}>{words.manual}</Button><p className="max-w-lg text-xs leading-5 text-muted-foreground">{words.manualHelp}</p></div><Separator /><div className="space-y-3"><h3 className="text-sm font-medium">{words.aiTitle}</h3><p className="text-xs leading-6 text-muted-foreground">{words.aiHelp}</p>{!status.liveEnabled && <p className="text-sm text-muted-foreground">{words.aiUnavailable}</p>}<div className="flex items-start gap-3"><Checkbox id={`${id}-ai-consent`} checked={aiConsent} disabled={blocked || !status.liveEnabled} onCheckedChange={value => setAiConsent(value === true)} /><Label htmlFor={`${id}-ai-consent`} className="text-sm leading-6">{words.aiConsent}</Label></div><Button disabled={blocked || !status.liveEnabled || !aiConsent || sourceTooLong || !work.sourceText.trim()} onClick={liveExtract}>{phase === 'extracting' ? words.extracting : words.aiExtract}</Button></div></CardContent></Card>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{words.factsTitle}</CardTitle><Badge variant="secondary">{reviewed} / 5 {words.reviewed}</Badge></div><CardDescription>{words.factsHelp}</CardDescription></CardHeader><CardContent className="space-y-6">{work.fields.map((field, index) => <div key={field.key} className="space-y-3 border-b pb-6 last:border-0 last:pb-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span><Label className="text-base font-medium" htmlFor={`${id}-${field.key}`}>{words.fieldLabels[field.key]}</Label><Badge variant={field.conflict ? 'destructive' : 'outline'}>{field.conflict ? words.conflict : field.confirmed ? words.reviewed : words.needsReview}</Badge>{field.edited && <span className="text-xs text-muted-foreground">{words.edited}</span>}</div><Input id={`${id}-${field.key}`} value={field.value} maxLength={3000} placeholder={words.unknown} disabled={blocked} onChange={event => editField(field.key, {
            value: event.target.value,
            confirmed: false,
            edited: true
          })} />{field.key === 'rent' && <p className="text-xs text-muted-foreground">{words.rentNote}</p>}<div className="space-y-2"><Label htmlFor={`${id}-${field.key}-source`} className="text-xs text-muted-foreground">{words.fieldSource}</Label><Textarea id={`${id}-${field.key}-source`} className="min-h-20 text-xs leading-6" value={field.source} maxLength={50000} placeholder={words.sourceNone} disabled={blocked} onChange={event => editField(field.key, {
              source: event.target.value,
              confirmed: false,
              edited: true
            })} /></div>{field.conflict ? <div className="space-y-3 rounded-md bg-muted p-4"><p className="text-sm leading-6">{words.conflictHelp}</p><Button size="sm" variant="outline" disabled={blocked} onClick={() => editField(field.key, {
              conflict: false,
              confirmed: true,
              edited: true
            })}>{words.resolve}</Button></div> : <div className="flex items-start gap-3"><Checkbox id={`${id}-${field.key}-confirm`} checked={field.confirmed} disabled={blocked} onCheckedChange={checked => editField(field.key, {
              confirmed: checked === true
            })} /><Label htmlFor={`${id}-${field.key}-confirm`} className="text-sm leading-6">{words.confirm}</Label></div>}</div>)}</CardContent></Card>
    {assets.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" aria-hidden="true" />{words.assets}</CardTitle></CardHeader><CardContent><ul className="space-y-3">{assets.map(asset => <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm last:border-0"><span className="min-w-0 break-all">{asset.originalFilename}</span><div className="flex gap-3"><a className="text-accent-foreground underline underline-offset-4" href={`/api/assets/${asset.id}/preview`} target="_blank" rel="noopener noreferrer">{words.preview}</a><a className="text-accent-foreground underline underline-offset-4" href={`/api/assets/${asset.id}/download`}>{words.download}</a></div></li>)}</ul>{base && assets.some(asset => !asset.caseId) && <Button className="mt-4" variant="outline" disabled={blocked} onClick={retryLinks}>{words.archiveLink}</Button>}</CardContent></Card>}
    <footer className="space-y-3 rounded-xl border bg-card p-5">{hasLegacyChange && <p className="text-sm leading-6 text-muted-foreground">{words.draftNotice}</p>}<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground" role="status">{localDirty ? words.unsaved : base ? words.caseSaved : words.notSaved}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={blocked || conflict || sourceTooLong} onClick={() => saveCase(false)}>{phase === 'saving' ? words.saving : words.save}</Button><Button disabled={blocked || conflict || sourceTooLong || Boolean(workbook) || queue.some(item => item.file)} onClick={() => localDirty || !base ? saveCase(true) : onOpenDocuments?.(base.id)}>{localDirty || !base ? words.saveDocuments : words.documents}<ArrowRight aria-hidden="true" /></Button></div></div></footer>
  </section>;
}
