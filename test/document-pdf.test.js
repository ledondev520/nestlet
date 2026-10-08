// Real local PDF generation + Poppler parsing; synthetic content only, no provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createDocumentPdf} from '../document-pdf.js';
const artifact = content => ({content,id:'00000000-0000-4000-8000-000000000001',version:4,status:'final'});
async function inspect(content, work) {
  const dir = await mkdtemp(join(tmpdir(),'nestlet-export-pdf-'));
  try {
    const bytes = await createDocumentPdf(artifact(content)), file = join(dir,'document.pdf');
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    await writeFile(file,bytes);
    await work(file,bytes);
  } finally {await rm(dir,{recursive:true,force:true});}
}
test('real PDF embeds Unicode font and preserves literal English/CJK/Latin text without controls or executable markup',async()=>{
  const content = 'Dear 张伟 / 李明 / 山田 / 김민수,\n\nCafé — résumé £2,100 (requested rent); Cafe\u0301.\nLiteral <script>alert(1)</script> & <img src=x>\nPrepared by Synthetic Operator.';
  await inspect(content, file=>{
    const extracted=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}).replace(/\f/g,'').trim();
    assert.equal(extracted.replace(/\n{2,}/g,'\n\n'),content); // Poppler derives blank-line count from font metrics.
    const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});
    assert.match(info,/Pages:\s+1/);assert.match(info,/JavaScript:\s+no/);assert.match(info,/Saved artifact 00000000/);
    assert.match(execFileSync('pdffonts',[file],{encoding:'utf8'}),/NotoSansCJKsc-Regular\s+CID Type 0C\s+Identity-H\s+yes\s+yes\s+yes/);
    assert.doesNotMatch(extracted,/Download PDF|Print \/ Save PDF|Save new version/);
  });
});
test('multipage output preserves first/last lines and long unbroken tokens without truncation',async()=>{
  const token='ABCDEFGH'.repeat(180), lines=Array.from({length:160},(_,i)=>`Synthetic line ${String(i).padStart(3,'0')}: reviewed text.`);
  const content=lines.join('\n')+'\n'+token+'\nEND OF SAVED DOCUMENT';
  await inspect(content,file=>{
    const extracted=execFileSync('pdftotext',['-raw',file,'-'],{encoding:'utf8'});
    assert.equal(extracted.replace(/\s/g,''),content.replace(/\s/g,''));
    const pages=Number(execFileSync('pdfinfo',[file],{encoding:'utf8'}).match(/Pages:\s+(\d+)/)[1]);
    assert.ok(pages>=4 && pages<100);
  });
});
test('unsupported emoji, malformed surrogate, and excess pages fail closed; later requests recover',async()=>{
  for(const content of ['Synthetic 😀','Synthetic \ud800','\n'.repeat(49000)]) {
    await assert.rejects(createDocumentPdf(artifact(content)),error=>['PDF_EXPORT_UNSUPPORTED_TEXT','PDF_EXPORT_TOO_LARGE'].includes(error.code));
  }
  assert.ok((await createDocumentPdf(artifact('Recovered export.'))).length>1000);
});
test('input bounds and concurrent rendering bound resource usage',async()=>{
  await assert.rejects(createDocumentPdf(artifact('x'.repeat(50001))),{code:'PDF_EXPORT_FAILED'});
  const first=createDocumentPdf(artifact('First.')),second=createDocumentPdf(artifact('Second.'));
  await assert.rejects(createDocumentPdf(artifact('Third.')),{code:'PDF_EXPORT_BUSY'});
  await Promise.all([first,second]);
});

test('unreadable local font fails clearly instead of producing a substituted PDF',()=>{
  // Child permission model denies the font directory while allowing code/dependencies.
  const root=new URL('../',import.meta.url).pathname;
  const script="import('./document-pdf.js').then(async({createDocumentPdf})=>{try{await createDocumentPdf({content:'Synthetic',id:'fixture',version:1,status:'draft'});process.exitCode=1}catch(error){console.log(error.code)}})";
  const result=execFileSync(process.execPath,['--permission',`--allow-fs-read=${root}`,'--allow-worker','-e',script],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(result.trim(),'PDF_EXPORT_UNAVAILABLE');
});
