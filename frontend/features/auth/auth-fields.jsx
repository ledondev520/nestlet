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
export function PasswordFields({ id, t, onChange, confirm = true, disabled = false, error, current = false }) {
  const [visible, setVisible] = useState(false);
  return <><AuthField id={`${id}-password`} label={current ? t.currentPassword : t.password} help={t.passwordHint} name={current ? 'currentPassword' : 'password'} type={visible ? 'text' : 'password'} autoComplete={current || !confirm ? 'current-password' : 'new-password'} defaultValue="" onChange={onChange} minLength={6} maxLength={256} required readOnly={disabled} error={error?.field === 'password'} />
    <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={visible ? t.hidePassword : t.showPassword} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{visible ? t.hidePassword : t.showPassword}</Button>
    {confirm && <AuthField id={`${id}-confirmation`} label={t.confirmPassword} name="passwordConfirmation" type="password" autoComplete="new-password" defaultValue="" onChange={onChange} minLength={6} maxLength={256} required readOnly={disabled} error={error?.field === 'passwordConfirmation'} />}</>;
}
