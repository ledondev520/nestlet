import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const permissionCopy = lang => lang === 'en' ? {
  title: 'Use your saved library?',
  detail: 'Allow Nestlet to search your saved customers, cases, files and documents and send relevant excerpts to DeepSeek to answer your requests. This applies to future chats on this account until you turn it off in Account and settings.',
  boundary: 'Read-only suggestions and English drafts still need your review before saving or applying. Only synthetic or de-identified material is supported.',
  ordinary: 'Sending a message shares its text, attached images and the selected case’s bounded context and conversation history with DeepSeek. Saved-library search is optional.',
  allow: 'Allow saved-library search', deny: 'Continue without library', cancel: 'Cancel', saving: 'Saving choice…', error: 'Could not confirm your choice. Retry or continue without library for this message.', once: 'Send without library this time', onceHint: 'Send this message without using your saved library.',
  settings: 'AI data sharing', enabled: 'Saved-library search is allowed for DeepSeek.', disabled: 'Saved-library search is off.', unset: 'No saved-library permission has been granted.', revoke: 'Turn off saved-library search', refresh: 'Refresh permission', loading: 'Checking permission…', unavailable: 'Library permission is unavailable. Ordinary chat remains available.',
} : {
  title: "使用资料？",
  detail: "允许查找你保存的以下资料：\n客户、事项、文件和文档。\n相关文字会发给DeepSeek。\n仅用于回答你的请求。\n此选择适用于账号之后的对话。\n可随时在「设置」中关闭。",
  boundary: "建议和英文草稿仍需你核对。\n核对后才能保存或使用。\n仅支持虚构或已去除身份信息的材料。",
  ordinary: "消息文字和附图会发给DeepSeek。\n还包括部分当前事项资料和对话记录。\n是否使用资料库，由你选择。",
  allow: "允许使用", deny: "不用资料", cancel: '取消', saving: '正在保存选择…', error: "暂时无法确认选择，请重试。\n也可选择这次不使用资料库。", once: "仅此一次", onceHint: "这次不使用资料库，直接发送。",
  settings: "资料授权", enabled: "已允许将相关文字发给DeepSeek。", disabled: "已停用资料库。", unset: "尚未允许使用资料库。", revoke: "停用授权", refresh: "刷新授权", loading: '正在检查授权…', unavailable: "暂时无法读取资料授权。\n普通对话仍可使用。",
};

export function checkedPermission(value) {
  if (!value || !['unset','allow','deny'].includes(value.decision) || !Number.isSafeInteger(value.version) || value.version < 0 ||
    value.provider?.id !== 'deepseek' || value.provider?.model !== 'deepseek-flash' || value.provider?.endpoint !== 'https://api.deepseek.com/chat/completions' ||
    value.policyVersion !== 'library-retrieval-v1' || value.category !== 'saved-library-excerpts') throw {code:'INVALID_RESPONSE'};
  return {decision:value.decision,version:value.version,provider:{id:value.provider.id,endpoint:value.provider.endpoint,model:value.provider.model},policyVersion:value.policyVersion,category:value.category};
}

/** No browser persistence: server policy and verified account identity own every grant. */
export function useLibraryPermission({api,userId,authenticated}) {
  const [view,setView] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState(null);
  const owner = useRef({userId,authenticated}), generation = useRef(0), active = useRef(null);
  owner.current = {userId,authenticated};
  useEffect(() => { generation.current++;active.current?.abort();active.current=null;setView(null);setBusy(false);setError(null);
    return () => {generation.current++;active.current?.abort();active.current=null;};
  },[userId,authenticated]);
  async function run(body) {
    if (!owner.current.authenticated || active.current) throw {code:'PERMISSION_BUSY'};
    const identity=owner.current.userId, token=++generation.current, controller=new AbortController();active.current=controller;setBusy(true);setError(null);
    const valid=()=>token===generation.current&&owner.current.authenticated&&identity===owner.current.userId&&!controller.signal.aborted;
    try {
      const options={signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),telemetry:false};
      const next=checkedPermission(await (body?api.put('/api/library-permission',body,options):api.get('/api/library-permission',options)));
      if(!valid())throw new DOMException('Account changed','AbortError');
      setView(next);return next;
    } catch(failure){if(valid()){setError(failure);setView(null);}throw failure;}
    finally{if(token===generation.current){active.current=null;setBusy(false);}}
  }
  const load=()=>run();
  const choose=(decision,snapshot=view)=> {
    const checked=checkedPermission(snapshot);
    return run({decision,expectedVersion:checked.version,provider:checked.provider,policyVersion:checked.policyVersion,category:checked.category});
  };
  return {view,busy,error,load,choose};
}

export function LibraryPermissionDialog({lang,open,busy,error,onChoose,onClose,onWithoutLibrary,onRetry,ready=true}) {
  const t=permissionCopy(lang), onceHintId=useId();
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}>
    <DialogContent aria-modal="true" className="max-h-[85dvh] overflow-y-auto" showCloseButton={false} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onPointerDownOutside={event=>{if(busy)event.preventDefault();}}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription className="whitespace-pre-line">{t.detail}</DialogDescription></DialogHeader>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{t.ordinary}</p>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{t.boundary}</p>
      {error&&<p role="alert" className="whitespace-pre-line text-sm text-destructive">{t.error}</p>}
      {busy&&<p className="whitespace-pre-line" role="status">{t.saving}</p>}
      <DialogFooter className="flex-wrap">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t.cancel}</Button>
        <Button type="button" variant="outline" disabled={busy||!ready} onClick={()=>onChoose('deny')}>{t.deny}</Button>
        <Button type="button" disabled={busy||!ready} onClick={()=>onChoose('allow')}>{t.allow}</Button>
        {error&&onRetry&&<Button type="button" variant="outline" disabled={busy} onClick={onRetry}>{t.refresh}</Button>}
        {error&&onWithoutLibrary&&<div className="space-y-1"><Button type="button" variant="outline" disabled={busy} aria-describedby={onceHintId} onClick={onWithoutLibrary}>{t.once}</Button><p id={onceHintId} className="whitespace-pre-line text-xs text-muted-foreground">{t.onceHint}</p></div>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
