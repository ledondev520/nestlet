import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FIELDS, columnName, mapSpreadsheetRow } from './logic.js';
export function WorkbookMapping({
  workbook,
  words,
  disabled,
  onApply,
  onClose
}) {
  const id = useId();
  const first = workbook.sheets.findIndex(sheet => sheet.hidden === false && sheet.rows.length);
  const [sheetIndex, setSheetIndex] = useState(first);
  const [rowIndex, setRowIndex] = useState(workbook.sheets[first].rows.length > 1 ? 1 : 0);
  const [mapping, setMapping] = useState(() => Object.fromEntries(FIELDS.map(key => [key, null])));
  const [invalid, setInvalid] = useState(false);
  const sheet = workbook.sheets[sheetIndex],
    row = sheet.rows[rowIndex] || [];
  const blocked = column => sheet.blockedCells?.some(cell => cell.row === rowIndex && cell.column === column);
  function selectSheet(value) {
    const index = Number(value);
    setSheetIndex(index);
    setRowIndex(workbook.sheets[index].rows.length > 1 ? 1 : 0);
    setMapping(Object.fromEntries(FIELDS.map(key => [key, null])));
    setInvalid(false);
  }
  function apply() {
    try {
      onApply(mapSpreadsheetRow(sheet, {
        rowIndex,
        mapping
      }));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  return <Card className="border-primary/30" aria-labelledby={`${id}-title`}>
    <CardHeader><CardTitle id={`${id}-title`}>{words.workbookTitle}</CardTitle><CardDescription className="whitespace-pre-line">{workbook.filename} · {words.workbookHelp}</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap gap-5">
        <div className="space-y-2"><Label htmlFor={`${id}-sheet`}>{words.sheet}</Label><NativeSelect id={`${id}-sheet`} value={sheetIndex} disabled={disabled} onChange={event => selectSheet(event.target.value)}>{workbook.sheets.map((item, index) => <NativeSelectOption key={index} value={index} disabled={item.hidden || !item.rows?.length}>{item.name}{item.hidden ? ` (${words.blocked})` : ''}</NativeSelectOption>)}</NativeSelect></div>
        <div className="space-y-2"><Label htmlFor={`${id}-row`}>{words.row}</Label><NativeSelect id={`${id}-row`} value={rowIndex} disabled={disabled} onChange={event => {
            setRowIndex(Number(event.target.value));
            setInvalid(false);
          }}>{sheet.rows.map((_, index) => <NativeSelectOption key={index} value={index}>{index + 1}</NativeSelectOption>)}</NativeSelect></div>
      </div>
      {sheet.truncated && <p className="whitespace-pre-line text-sm text-muted-foreground">{words.truncatedSheet}</p>}
      <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-xs"><caption className="p-3 text-left text-muted-foreground">{sheet.name} · {words.row} {rowIndex + 1}</caption><thead><tr>{row.map((_, column) => <th key={column} scope="col" className="border-b bg-muted px-3 py-2 font-mono">{columnName(column)}</th>)}</tr></thead><tbody><tr>{row.map((value, column) => <td key={column} className="max-w-64 border-r px-3 py-3 break-words align-top">{blocked(column) ? words.blocked : value || '—'}</td>)}</tr></tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2">{FIELDS.map(key => <div key={key} className="space-y-2"><Label htmlFor={`${id}-${key}`}>{words.fieldLabels[key]} · {words.mapColumn}</Label><NativeSelect id={`${id}-${key}`} value={mapping[key] ?? ''} disabled={disabled} onChange={event => {
            setMapping(previous => ({
              ...previous,
              [key]: event.target.value === '' ? null : Number(event.target.value)
            }));
            setInvalid(false);
          }}><NativeSelectOption value="">{words.unmapped}</NativeSelectOption>{row.map((value, column) => <NativeSelectOption key={column} value={column} disabled={blocked(column)}>{columnName(column)} · {blocked(column) ? words.blocked : value.slice(0, 65) || '—'}</NativeSelectOption>)}</NativeSelect></div>)}</div>
      {invalid && <Alert variant="destructive"><AlertDescription className="whitespace-pre-line">{words.errors.MAPPING_INVALID}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled} onClick={apply}>{words.mapApply}</Button><Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>{words.mapCancel}</Button></div>
    </CardContent>
  </Card>;
}
