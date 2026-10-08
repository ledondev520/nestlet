import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const permissionCopy = lang => lang === 'en' ? {
  title: 'Use your saved library?',
  detail: 'Allow Nestlet to search your saved customers, cases, files and documents and send relevant excerpts to DeepSeek to answer your requests. This applies to future chats on this account until you turn it off in Account and settings.',
  boundary: 'Read-only suggestions and English drafts still need your review before saving or applying. Only synthetic or de-identified material is supported.',
  ordinary: 'Sending a message shares its text, attached images and the selected case’s bounded context and conversation history with DeepSeek. Saved-library search is optional.',
  allow: 'Allow saved-library search', deny: 'Continue without library', cancel: 'Cancel', saving: 'Saving choice…', error: 'Could not confirm your choice. Retry or continue without library for this message.', once: 'Send without library this time',
  settings: 'AI data sharing', enabled: 'Saved-library search is allowed for DeepSeek.', disabled: 'Saved-library search is off.', unset: 'No saved-library permission has been granted.', revoke: 'Turn off saved-library search', refresh: 'Refresh permission', loading: 'Checking permission…', unavailable: 'Library permission is unavailable. Ordinary chat remains available.',
} : {
  title: '允许使用已保存的资料库吗？',
  detail: '允许巢小秘检索您保存的客户、案例、文件和文书，并将相关摘录发送给 DeepSeek，用于回答您的请求。选择适用于此账户之后的对话，可随时在「账户与设置」中关闭。',
  boundary: '只读建议和英文草稿仍需您核对后才能保存或应用。目前仅支持模拟或去标识化材料。',
  ordinary: '发送消息会将消息文字、附图，以及当前案例的有限上下文和对话记录交给 DeepSeek 处理。资料库检索为可选项。',
  allow: '允许资料库检索', deny: '不使用资料库，继续对话', cancel: '取消', saving: '正在保存选择…', error: '暂时无法确认您的选择。请重试，或仅本次不使用资料库。', once: '本次不使用资料库发送',
  settings: 'AI 数据共享', enabled: '已允许向 DeepSeek 提供相关资料库摘录。', disabled: '资料库检索已关闭。', unset: '尚未授权资料库检索。', revoke: '关闭资料库检索', refresh: '刷新授权状态', loading: '正在检查授权…', unavailable: '暂时无法读取资料库授权，普通对话仍可使用。',
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
  const t=permissionCopy(lang);
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto" showCloseButton={false} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onPointerDownOutside={event=>{if(busy)event.preventDefault();}}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.detail}</DialogDescription></DialogHeader>
      <p className="text-sm text-muted-foreground">{t.ordinary}</p>
      <p className="text-sm text-muted-foreground">{t.boundary}</p>
      {error&&<p role="alert" className="text-sm text-destructive">{t.error}</p>}
      {busy&&<p role="status">{t.saving}</p>}
      <DialogFooter className="flex-wrap">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t.cancel}</Button>
        <Button type="button" variant="outline" disabled={busy||!ready} onClick={()=>onChoose('deny')}>{t.deny}</Button>
        <Button type="button" disabled={busy||!ready} onClick={()=>onChoose('allow')}>{t.allow}</Button>
        {error&&onRetry&&<Button type="button" variant="outline" disabled={busy} onClick={onRetry}>{t.refresh}</Button>}
        {error&&onWithoutLibrary&&<Button type="button" variant="outline" disabled={busy} onClick={onWithoutLibrary}>{t.once}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
