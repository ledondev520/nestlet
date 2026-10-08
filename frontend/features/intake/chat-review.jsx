import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
export function ChatReview({ request, lang, disabled, onAppend, onCancel }) {
  const en = lang === 'en';
  return <Card className="border-primary/30" data-testid="chat-material-review">
    <CardHeader><CardTitle>{en ? 'Review this conversation text' : '核对文字'}</CardTitle><CardDescription className="whitespace-pre-line">{en ? 'This text is unreviewed. Append it to your existing material, then review any facts before saving. Nothing has been added or confirmed yet.' : '这段文字尚未核实，也还未加入材料。\n加入后，请核对信息再保存。'}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="whitespace-pre-line text-xs text-muted-foreground">{en ? 'Conversation / message source' : '消息来源'}: {request.conversationDisplayId||(en?'Saved conversation':'已保存对话')} / {request.messageDisplayId||(en?'Saved message':'已保存消息')}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-sm">{request.content}</pre>
      <div className="flex flex-wrap gap-2"><Button disabled={disabled} onClick={onAppend}>{en ? 'Append unreviewed text' : '追加文字'}</Button><Button variant="ghost" onClick={onCancel}>{en ? 'Cancel text handoff' : '取消追加'}</Button></div>
    </CardContent>
  </Card>;
}
