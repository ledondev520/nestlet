import { useEffect, useState } from 'react';
import { ApplicationShell } from '@/components/application-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Integration checkpoint only. Business modules replace this explicit preview;
// it is not reported as a migrated customer, conversation, or document page.
export default function ComponentPreview() {
  const [lang, setLang] = useState('zh');
  const [label, setLabel] = useState('');
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; }, [lang]);
  const zh = lang === 'zh';
  return <ApplicationShell lang={lang} onLanguageChange={() => setLang(zh ? 'en' : 'zh')}
    migrationNotice={zh ? '组件接入预览：业务页面正在逐步迁移，现有工作区仍可使用。' : 'Component integration preview. Business pages are being migrated; the existing workspace remains available.'}>
    <Card className="paper-card">
      <CardHeader><CardTitle className="paper-title text-2xl">{zh ? '同一张工作纸，新的组件基础' : 'The same working paper, a new component foundation'}</CardTitle><CardDescription>{zh ? '保留暖纸、墨色与朱砂配色，使用真正的 shadcn/ui 组件。' : 'Warm paper, ink, and cinnabar with real shadcn/ui components.'}</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="preview-label">{zh ? '组件测试名称' : 'Component test label'}</Label><Input id="preview-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={120} autoComplete="off" placeholder={zh ? '此处输入不会保存' : 'This input is not saved'} /></div>
        <div className="flex flex-wrap gap-3">
          <Dialog><DialogTrigger asChild><Button>{zh ? '检查对话框' : 'Check dialog'}</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>{zh ? '组件检查' : 'Component check'}</DialogTitle><DialogDescription>{zh ? '可使用 Escape 关闭，Tab 焦点留在对话框内。关闭后焦点回到打开按钮。' : 'Escape closes the dialog, Tab stays inside, and focus returns to the trigger on dismissal.'}</DialogDescription></DialogHeader><p className="break-words text-sm">{label || (zh ? '尚未输入名称' : 'No label entered')}</p></DialogContent>
          </Dialog>
          <Button variant="outline" asChild><a href="/">{zh ? '打开现有工作区' : 'Open existing workspace'}</a></Button>
        </div>
      </CardContent>
    </Card>
  </ApplicationShell>;
}
