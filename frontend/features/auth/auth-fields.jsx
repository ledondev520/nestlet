import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export function AuthField({ id, label, help, error, ...props }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} aria-invalid={error || undefined} aria-describedby={help ? `${id}-help` : undefined} {...props} />{help && <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">{help}</p>}</div>;
}
export function clearNativePasswords(form) {
  for (const name of ['password', 'passwordConfirmation', 'currentPassword']) {
    const field = form?.elements?.namedItem(name); if (field) field.value = '';
  }
}
function PasswordField({ id, label, help, showLabel, hideLabel, disabled, error, ...props }) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hideLabel : showLabel;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input {...props} id={id} type={visible ? 'text' : 'password'} className="h-11 pr-12" readOnly={disabled} aria-invalid={error || undefined} aria-describedby={help ? `${id}-help` : undefined} />
      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-11 text-muted-foreground" disabled={disabled} aria-label={toggleLabel} title={toggleLabel} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
      </Button>
    </div>
    {help && <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
  </div>;
}
export function PasswordFields({ id, t, onChange, confirm = true, disabled = false, error, current = false }) {
  return <><PasswordField id={`${id}-password`} label={current ? t.currentPassword : t.password} help={t.passwordHint} showLabel={t.showPassword} hideLabel={t.hidePassword} name={current ? 'currentPassword' : 'password'} autoComplete={current || !confirm ? 'current-password' : 'new-password'} defaultValue="" onChange={onChange} minLength={6} maxLength={256} required disabled={disabled} error={error?.field === 'password'} />
    {confirm && <PasswordField id={`${id}-confirmation`} label={t.confirmPassword} showLabel={t.showConfirmation} hideLabel={t.hideConfirmation} name="passwordConfirmation" autoComplete="new-password" defaultValue="" onChange={onChange} minLength={6} maxLength={256} required disabled={disabled} error={error?.field === 'passwordConfirmation'} />}</>;
}
