// Linear, conservative guard before parsing untrusted streamed model output.
// Crossing a budget changes presentation only; the full raw string is retained.
export const MARKDOWN_BUDGET = Object.freeze({characters:16000, syntax:2048, lines:400, repeatedDelimiter:32});
const syntaxCharacters = '*_~`[]()<>!|#\\-+';
export function withinMarkdownBudget(content) {
  if (typeof content !== 'string' || content.length > MARKDOWN_BUDGET.characters) return false;
  let syntax=0, lines=1, run=0, previous='';
  for (const char of content) {
    if (char === '\n' && ++lines > MARKDOWN_BUDGET.lines) return false;
    if (syntaxCharacters.includes(char)) {
      if (++syntax > MARKDOWN_BUDGET.syntax) return false;
      run=char === previous ? run+1 : 1;
      if (run > MARKDOWN_BUDGET.repeatedDelimiter) return false;
    } else run=0;
    previous=char;
  }
  return true;
}
