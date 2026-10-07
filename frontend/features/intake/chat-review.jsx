import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
export function ChatReview({ request, lang, disabled, onAppend, onCancel }) {
  const en = lang === 'en';
  return <Card className="border-primary/30" data-testid="chat-material-review">
    <CardHeader><CardTitle>{en ? 'Review this conversation text' : '核对这段对话文字'}</CardTitle><CardDescription>{en ? 'This text is unreviewed. Append it to your existing material, then review any facts before saving. Nothing has been added or confirmed yet.' : '这段文字尚未核实。可追加至现有材料，再核对事实并保存；目前没有追加文字或确认事实。'}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-xs text-muted-foreground">{en ? 'Conversation / message source' : '对话 / 消息来源'}: {request.conversationId.slice(0, 8)} / {request.messageId.slice(0, 8)}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-sm">{request.content}</pre>
      <div className="flex flex-wrap gap-2"><Button disabled={disabled} onClick={onAppend}>{en ? 'Append unreviewed text' : '追加待核实文字'}</Button><Button variant="ghost" onClick={onCancel}>{en ? 'Cancel text handoff' : '取消追加'}</Button></div>
    </CardContent>
  </Card>;
}
