import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AGENCY_OPTIONS, GUIDANCE_COPY, getAgencyGuidance } from '../../public/agency-guidance.js';

/** A reference choice, never a case fact, readiness gate, or official-form validator. */
export function AgencyGuidance({ lang = 'zh', agency, onAgencyChange }) {
  const id = useId(), language = lang === 'en' ? 'en' : 'zh';
  const copy = GUIDANCE_COPY[language], guidance = getAgencyGuidance(agency, language);
  return <details className="mb-6 rounded-lg border border-border bg-card px-4 py-3" data-testid="agency-guidance">
    <summary className="cursor-pointer text-sm font-medium">
      {copy.title}<span className="ml-2 font-normal text-muted-foreground">· {guidance.label}</span>
      <span className="ml-2 text-xs font-normal text-muted-foreground">{language === 'zh' ? '是否适用待确认' : 'Applicability unconfirmed'}</span>
    </summary>
    <div className="mt-4 space-y-4 text-sm">
      <div className="space-y-2">
        <Label htmlFor={id}>{copy.selectLabel}</Label>
        <NativeSelect id={id} value={guidance.id} onChange={event => onAgencyChange(event.target.value)} className="w-full sm:w-80">
          {AGENCY_OPTIONS.map(option => <NativeSelectOption key={option.id} value={option.id}>{option.label[language]}</NativeSelectOption>)}
        </NativeSelect>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{copy.scope}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{language === 'zh' ? '仅用于当前工作区和后续对话。\n不会存为事项信息。' : 'Used in this workspace and subsequent chat requests; not saved as a case fact.'}</p>
      </div>
      <p className="whitespace-pre-line text-xs font-medium">{copy.acceptance}</p>
      <ul className="space-y-3">
        {guidance.links.map(link => <li key={link.id} className="min-w-0 space-y-1">
          <a className="break-words underline underline-offset-4" href={link.url} target="_blank" rel="noreferrer noopener" lang="en">{link.title} ↗</a>
          <p className="whitespace-pre-line text-xs text-muted-foreground">{copy.editionLabel}: {link.edition}</p>
        </li>)}
      </ul>
      {guidance.links.some(link => link.printedOMBExpiration) && <p className="whitespace-pre-line text-xs text-muted-foreground">{copy.versionCaution}</p>}
      <details>
        <summary className="cursor-pointer text-sm font-medium">{copy.conditionsLabel}</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">{guidance.notes.map(note => <li key={note}>{note}</li>)}</ul>
      </details>
      <p className="whitespace-pre-line text-xs text-muted-foreground">{copy.checkedLabel}: {guidance.checkedAt}</p>
    </div>
  </details>;
}
