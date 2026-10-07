import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { useSuspendedDraft } from '@/lib/suspended-draft';
import { confirmationBody, currentValue, issueChange, printableFilename, fillPrintDocument, hasUnreviewedCJK } from './helpers.js';
import { validDocumentRecovery, documentDraftSnapshot } from './draft-state.js';

const initial = () => ({record:null, source:'', kind:'followup', readiness:null, readinessLoading:false, artifacts:[], conversations:[],
  selected:null, content:'', artifactTitle:'', saveStatus:'draft', answers:{}, namesVerified:false, issueForm:null, issueBaseline:'',
  detailForm:{key:'recipientOrganization',value:'',notApplicable:false,touched:false}, recoveryBaseVersion:null,
  busy:'', loading:true, error:null, notice:'', keptEdits:false});
const failure = code => new ApiError(code);
const isAbort = error => error?.name === 'AbortError';

export function useDocuments(lang, caseId, onDirtyChange, visible = true) {
  const {status, api} = useSession();
  const {restored,saveDraft,clearDraft,cacheStatus} = useSuspendedDraft('documents');
  const restorationApplied = useRef(false), restoring = useRef(false);
  const identity = status.authenticated && status.userId && caseId ? `${status.userId}:${caseId}` : null;
  const identityRef = useRef(identity); identityRef.current = identity;
  const epoch = useRef(0), controller = useRef(null), lock = useRef(false), readinessSequence = useRef(0), urls = useRef(new Set()), popups = useRef(new Set()), editorRevision = useRef(0);
  const [state, setState] = useState(initial);
  const latest = useRef(state); latest.current = state;
  const callback = useRef(onDirtyChange); callback.current = onDirtyChange;
  const contentDirty = Boolean(state.record && (state.content !== (state.selected?.content ?? state.record.draftText) || state.artifactTitle !== (state.selected?.title || '')));
  const dirty = Boolean(state.detailForm.touched) || contentDirty || Object.keys(state.answers).length > 0 || Boolean(state.record && state.namesVerified !== state.record.namesVerified) || Boolean(state.issueForm && JSON.stringify(state.issueForm) !== state.issueBaseline);
  useEffect(() => {callback.current?.(dirty);}, [dirty]);
  useEffect(() => () => callback.current?.(false), []);
  useEffect(() => {
    const beforeUnload = event => {if (dirty) {event.preventDefault(); event.returnValue = '';}};
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const patch = values => setState(previous => ({...previous, ...values}));
  const editArtifact = values => {editorRevision.current++; patch({...values, saveStatus:'draft'});};
  const ticket = () => ({identity, epoch:epoch.current, signal:controller.current?.signal});
  const active = current => Boolean(current.identity && current.identity === identityRef.current && current.epoch === epoch.current && !current.signal?.aborted);
  const verify = current => {if (!active(current)) throw new DOMException('Case context changed', 'AbortError');};
  const json = async (current, method, path, body) => {
    verify(current);
    const value = method === 'get' ? await api.get(path, {signal:current.signal}) : await api[method](path, body, {signal:current.signal});
    verify(current); return value;
  };

  function applyRecord(record, snapshot, extra = {}) {
    setState(previous => ({...previous, record,
      source: previous.source === snapshot.source ? record.sourceText : previous.source,
      namesVerified: previous.namesVerified !== snapshot.record.namesVerified ? previous.namesVerified : record.namesVerified === true,
      ...extra}));
  }
  async function extras(current) {
    const [versions, conversations] = await Promise.all([
      json(current, 'get', `/api/cases/${caseId}/artifacts`), json(current, 'get', `/api/cases/${caseId}/conversations`),
    ]);
    patch({artifacts:versions.artifacts || [], conversations:conversations.conversations || []});
    setState(previous => ({...previous, selected: previous.selected ? {...previous.selected, ...(versions.artifacts || []).find(item => item.id === previous.selected.id)} : null}));
  }
  async function reload(keepEdits = true, reconcile = true) {
    if (!identity || lock.current) return;
    const current = ticket(), snapshot = latest.current;
    lock.current = true; patch({busy:'reload', error:null});
    try {
      const result = await json(current, 'get', `/api/cases/${caseId}`);
      if (!result.case || result.case.id !== caseId) throw failure('INVALID_RESPONSE');
      const record = result.case;
      setState(previous => ({...previous, record, loading:false, kind: keepEdits && snapshot.record ? previous.kind : record.draftType,
        source: keepEdits && snapshot.record && previous.source !== snapshot.record.sourceText ? previous.source : record.sourceText,
        content: keepEdits && snapshot.record && (previous.selected || previous.content !== snapshot.record.draftText) ? previous.content : record.draftText || '',
        namesVerified:keepEdits && snapshot.record && previous.namesVerified !== snapshot.record.namesVerified ? previous.namesVerified : record.namesVerified === true,
        recoveryBaseVersion:reconcile ? null : previous.recoveryBaseVersion,
        keptEdits:Boolean(keepEdits && snapshot.record), notice:keepEdits && snapshot.record ? 'reloadNotice' : ''}));
      await extras(current);
    } catch (error) {if (active(current) && !isAbort(error)) patch({error, loading:false});}
    finally {if (active(current)) {lock.current = false; patch({busy:''});}}
  }
  useEffect(() => {
    controller.current?.abort(); controller.current = new AbortController(); epoch.current++; lock.current = false; readinessSequence.current++;
    setState(initial());
    restorationApplied.current = false; restoring.current = false;
    if (identity) reload(false,false); else patch({loading:false});
    return () => {controller.current?.abort(); for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); for (const popup of popups.current) popup.close(); popups.current.clear();};
    // Identity, rather than changing form state, owns this lifetime.
  }, [identity, api]);
  useEffect(() => {
    if (!identity || !state.record) return;
    const current = ticket(), sequence = ++readinessSequence.current, kind = state.kind;
    patch({readinessLoading:true});
    json(current, 'get', `/api/cases/${caseId}/readiness?kind=${encodeURIComponent(kind)}&locale=${lang === 'en' ? 'en' : 'zh'}`)
      .then(readiness => {if (active(current) && sequence === readinessSequence.current) patch({readiness,readinessLoading:false});})
      .catch(error => {if (active(current) && sequence === readinessSequence.current && !isAbort(error)) patch({error,readinessLoading:false});});
  }, [identity, state.record?.version, state.kind, lang, api]);

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current && identity) reload(true,false);
    wasVisible.current = visible;
  }, [visible, identity]);

  useEffect(() => {
    if (!identity || !state.record || state.busy || restorationApplied.current) return;
    restorationApplied.current = true;
    if (!validDocumentRecovery(restored,caseId)) return;
    const current = ticket(), saved = restored;
    restoring.current = true;
    lock.current = true; patch({busy:'restore'});
    (async () => {
      let selected = null;
      if (saved.selectedArtifactId) {
        try {
          const result = await json(current,'get',`/api/artifacts/${saved.selectedArtifactId}`);
          if (result.artifact?.caseId === caseId && typeof result.artifact.content === 'string') selected = result.artifact;
        } catch (error) {if (isAbort(error) || !active(current)) throw error;}
      }
      verify(current);
      setState(previous => ({...previous, kind:saved.kind, answers:{...(saved.answers || {}),...previous.answers},
        selected:selected || previous.selected,
        content:saved.content ?? selected?.content ?? previous.content,
        artifactTitle:saved.artifactTitle ?? selected?.title ?? previous.artifactTitle,
        saveStatus:saved.saveStatus || 'draft', namesVerified:saved.namesVerified ?? previous.namesVerified,
        issueForm:saved.issueForm || previous.issueForm, issueBaseline:saved.issueBaseline ?? previous.issueBaseline,
        detailForm:saved.detailForm || previous.detailForm,
        recoveryBaseVersion:saved.baseVersion !== previous.record.version ? saved.baseVersion : null,
        ...(saved.baseVersion !== previous.record.version ? {error:failure('CASE_CONFLICT')} : {}),
        notice:'draftRestored', keptEdits:true}));
    })().catch(error => {if (active(current) && !isAbort(error)) patch({error});})
      .finally(() => {if (active(current)) {restoring.current = false; lock.current = false; patch({busy:''});}});
  }, [identity,state.record?.id,state.busy,restored,caseId]);
  useEffect(() => {
    if (!identity || !state.record || !restorationApplied.current || restoring.current || state.busy === 'restore') return;
    if (dirty) {const snapshot = documentDraftSnapshot(state); if (snapshot) saveDraft(snapshot);}
    else clearDraft();
  }, [identity,state,dirty,saveDraft,clearDraft]);

  async function perform(name, work) {
    if (lock.current || !identity || !latest.current.record) return;
    const current = ticket(), snapshot = {...latest.current, editorRevision:editorRevision.current};
    lock.current = true; patch({busy:name, error:null, notice:''});
    try {
      if (snapshot.recoveryBaseVersion !== null && !['copy','open','download','print'].includes(name)) throw failure('CASE_CONFLICT');
      await work(current, snapshot);
    }
    catch (error) {if (active(current) && !isAbort(error)) patch({error, ...(error.code === 'DOCUMENT_DETAILS_REQUIRED' && error.details ? {readiness:error.details} : {})});}
    finally {if (active(current)) {lock.current = false; patch({busy:''});}}
  }
  async function generateUsing(current, record, kind, expectedEditorRevision) {
    const readiness = await json(current, 'get', `/api/cases/${caseId}/readiness?kind=${kind}&locale=${lang === 'en' ? 'en' : 'zh'}`);
    patch({readiness}); if (!readiness.ready) return;
    const {artifact} = await json(current, 'post', `/api/cases/${caseId}/artifacts/generate`, {kind, status:'final', expectedCaseVersion:record.version});
    if (!artifact || artifact.caseId !== caseId || typeof artifact.content !== 'string') throw failure('INVALID_RESPONSE');
    if (expectedEditorRevision !== editorRevision.current) {await extras(current); throw failure('LOCAL_CHANGED');}
    patch({selected:artifact, content:artifact.content, artifactTitle:artifact.title, saveStatus:artifact.status, notice:'generated'});
    await extras(current);
  }
  const generate = () => perform('generate', async (current, snapshot) => {
    if (snapshot.content !== (snapshot.selected?.content ?? snapshot.record.draftText)) throw failure('UNSAVED_ARTIFACT');
    await generateUsing(current, snapshot.record, snapshot.kind, snapshot.editorRevision);
  });
  const confirmAnswers = (andGenerate = false) => perform('confirm', async (current, snapshot) => {
    if (andGenerate && snapshot.content !== (snapshot.selected?.content ?? snapshot.record.draftText)) throw failure('UNSAVED_ARTIFACT');
    const shownAnswers = {...Object.fromEntries((snapshot.readiness?.missing || []).map(item => [item.key, currentValue(snapshot.record, item.key)])), ...snapshot.answers};
    const body = confirmationBody(shownAnswers, snapshot.record, snapshot.namesVerified !== snapshot.record.namesVerified ? snapshot.namesVerified : undefined);
    if (!body) {if (andGenerate) await generateUsing(current, snapshot.record, snapshot.kind, snapshot.editorRevision); return;}
    const result = await json(current, 'patch', `/api/cases/${caseId}/document-context`, body);
    applyRecord(result.case, snapshot, {notice:result.archivedLegacyDraft ? 'archived' : 'saved'});
    setState(previous => ({...previous, answers:JSON.stringify(previous.answers) === JSON.stringify(snapshot.answers) ? {} : previous.answers,
      content:!previous.selected && previous.content === snapshot.record.draftText ? result.case.draftText || '' : previous.content}));
    await extras(current);
    if (andGenerate && editorRevision.current === snapshot.editorRevision) await generateUsing(current, result.case, snapshot.kind, snapshot.editorRevision);
  });
  const saveIssue = () => perform('issue', async (current, snapshot) => {
    const change = issueChange(snapshot.issueForm || {}); if (!change) throw failure('INVALID_ISSUE');
    const result = await json(current, 'patch', `/api/cases/${caseId}/issues`, {changes:[change], expectedVersion:snapshot.record.version});
    applyRecord(result.case, snapshot, {issueForm:null, issueBaseline:'', notice:'saved'}); await extras(current);
  });
  const openArtifact = id => perform('open', async (current) => {
    const {artifact} = await json(current, 'get', `/api/artifacts/${id}`);
    if (!artifact || artifact.caseId !== caseId || typeof artifact.content !== 'string') throw failure('INVALID_RESPONSE');
    patch({selected:artifact, content:artifact.content, artifactTitle:artifact.title, saveStatus:artifact.status});
  });
  const saveArtifact = () => perform('save-version', async (current, snapshot) => {
    if (hasUnreviewedCJK(snapshot.content, snapshot.record)) throw failure('DOCUMENT_ENGLISH_REQUIRED');
    const {artifact} = await json(current, 'post', `/api/cases/${caseId}/artifacts`, {kind:snapshot.selected?.kind || snapshot.kind,
      title:snapshot.artifactTitle || snapshot.kind, status:snapshot.saveStatus, content:snapshot.content, expectedCaseVersion:snapshot.record.version});
    if (!artifact || artifact.caseId !== caseId) throw failure('INVALID_RESPONSE');
    setState(previous => ({...previous, selected:artifact,
      content:previous.content === snapshot.content ? artifact.content : previous.content,
      artifactTitle:previous.artifactTitle === snapshot.artifactTitle ? artifact.title : previous.artifactTitle,
      saveStatus:previous.content === snapshot.content ? artifact.status : 'draft', notice:'saved'}));
    await extras(current);
  });
  const copy = () => perform('copy', async (current, snapshot) => {
    if (hasUnreviewedCJK(snapshot.content, snapshot.record)) throw failure('DOCUMENT_ENGLISH_REQUIRED');
    try {await navigator.clipboard.writeText(snapshot.content);} catch {throw failure('CLIPBOARD_FAILED');}
    verify(current); patch({notice:'copied'});
  });
  async function exactSavedText(current, snapshot) {
    if (!snapshot.selected || snapshot.content !== snapshot.selected.content || snapshot.artifactTitle !== snapshot.selected.title) throw failure('UNSAVED_ARTIFACT');
    const response = await fetch(`/api/artifacts/${snapshot.selected.id}/download`, {credentials:'same-origin', cache:'no-store', signal:current.signal});
    verify(current);
    if (!response.ok) {const body = await response.json().catch(() => ({})); verify(current); throw new ApiError(body.code || 'REQUEST_FAILED', response.status);}
    const content = await response.text(); verify(current);
    if (content !== snapshot.content) throw failure('INVALID_RESPONSE');
    return content;
  }
  const download = () => perform('download', async (current, snapshot) => {
    const content = await exactSavedText(current, snapshot);
    const url = URL.createObjectURL(new Blob([content], {type:'text/plain;charset=utf-8'})); urls.current.add(url);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = printableFilename(snapshot.selected); document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => {URL.revokeObjectURL(url); urls.current.delete(url);}, 1000);
  });
  const print = () => {
    if (lock.current || !identity || !latest.current.selected) return;
    const popup = window.open('', '_blank'); if (!popup) {patch({error:failure('PRINT_BLOCKED')}); return;}
    popups.current.add(popup);
    popup.document.title = 'Preparing document';
    return perform('print', async (current, snapshot) => {
      try {
        const content = await exactSavedText(current, snapshot);
        const link = fillPrintDocument(popup, content, `${window.location.origin}/next/index.css`, printableFilename(snapshot.selected));
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(failure('PRINT_FAILED')), 10000);
          link.onload = () => {clearTimeout(timeout); resolve();}; link.onerror = () => {clearTimeout(timeout); reject(failure('PRINT_FAILED'));};
        });
        verify(current); if (popup.closed) return;
        popup.focus(); popup.print();
      } catch (error) {popup.close(); popups.current.delete(popup); throw error;}
    });
  };
  const sourceMessages = async (conversationId, signal) => {
    const current = ticket(); const result = await api.get(`/api/conversations/${conversationId}`, {signal:signal || current.signal}); verify(current);
    if (result.conversation?.caseId !== caseId) throw failure('INVALID_RESPONSE'); return result.messages || [];
  };
  return {state, status, cacheStatus, dirty, contentDirty, patch, editArtifact, reload, generate, confirmAnswers, saveIssue, openArtifact, saveArtifact, copy, download, print,
    sourceMessages};
}
