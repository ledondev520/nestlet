import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LibraryPermissionDialog, permissionCopy, useLibraryPermission } from '../chat/library-permission.jsx';

export function LibraryPermissionSettings({session,lang='zh',active=true}) {
  const {api,status}=session, t=permissionCopy(lang);
  const permission=useLibraryPermission({api,userId:status.userId,authenticated:status.authenticated});
  const [open,setOpen]=useState(false), [notice,setNotice]=useState('');
  const identity=useRef(status.userId);identity.current=status.userId;
  useEffect(()=>{if(active&&status.authenticated)permission.load().catch(()=>{});},[api,status.userId,status.authenticated,active]);
  useEffect(()=>{setOpen(false);setNotice('');},[status.userId,status.authenticated,active]);
  async function choose(decision){
    const userId=status.userId;setNotice('');
    try{
      await permission.choose(decision);
      if(identity.current!==userId)return;
      setOpen(false);setNotice(decision==='allow'?t.enabled:t.disabled);
    }catch(failure){if(failure.code==='LIBRARY_PERMISSION_CONFLICT')permission.load().catch(()=>{});}
  }
  return <Card><CardHeader><CardTitle>{t.settings}</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">{t.ordinary}</p>
    <p className="text-sm">{permission.view?.decision==='allow'?t.enabled:permission.view?.decision==='deny'?t.disabled:permission.view?.decision==='unset'?t.unset:t.unavailable}</p>
    <p className="text-sm text-muted-foreground">{t.detail}</p>
    {permission.busy&&<p role="status">{t.loading}</p>}
    {permission.error&&<p role="alert" className="text-sm text-destructive">{t.unavailable}</p>}
    {notice&&<p role="status">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      {permission.view?.decision==='allow'?<Button type="button" variant="outline" disabled={permission.busy} onClick={()=>choose('deny')}>{t.revoke}</Button>:<Button type="button" disabled={permission.busy||!permission.view} onClick={()=>setOpen(true)}>{t.allow}</Button>}
      <Button type="button" variant="ghost" disabled={permission.busy} onClick={()=>{setNotice('');permission.load().catch(()=>{});}}>{t.refresh}</Button>
    </div>
    <LibraryPermissionDialog lang={lang} open={open&&active} busy={permission.busy} ready={Boolean(permission.view)} error={permission.error} onChoose={choose} onClose={()=>{if(!permission.busy)setOpen(false);}} onRetry={()=>permission.load().catch(()=>{})} />
  </CardContent></Card>;
}
