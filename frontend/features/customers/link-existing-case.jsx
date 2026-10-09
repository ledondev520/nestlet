import {useId} from 'react';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select';
import {useApiResource} from './hooks';
export function LinkExistingCase({api,clientId,lang,onSelect,onCancel,disabled=false}){
 const en=lang==='en',id=useId(),list=useApiResource(api,'/api/cases','cases');
 const available=(list.data||[]).filter(record=>record.clientId!==clientId);
 return <div className="space-y-3 rounded border p-3">
  {list.loading&&<p role="status">{en?'Loading cases…':'正在加载事项…'}</p>}
  {list.error&&<p role="alert">{en?'Could not load cases. Close and try again.':'无法加载事项，请关闭后重试。'}</p>}
  {list.data&&<><Label htmlFor={id}>{en?'Existing case':'已有事项'}</Label><NativeSelect id={id} value="" disabled={disabled} onChange={event=>{if(event.target.value)onSelect(event.target.value,clientId,event.currentTarget);}}><NativeSelectOption value="">{en?'Choose a case':'选择事项'}</NativeSelectOption>{available.map(record=><NativeSelectOption key={record.id} value={record.id}>{record.title} · {record.displayId||record.id}</NativeSelectOption>)}</NativeSelect>{!available.length&&<p>{en?'No other cases to link.':'没有其他可关联事项。'}</p>}</>}
  <Button type="button" variant="ghost" onClick={onCancel}>{en?'Close linking':'关闭关联'}</Button>
 </div>;
}
