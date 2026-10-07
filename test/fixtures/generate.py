from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from pypdf import PdfReader, PdfWriter
from pathlib import Path
p=Path('/tmp/nestlet-pdf-fixtures')
p.mkdir(parents=True, exist_ok=True)
lines=['SYNTHETIC DEMO - NOT A REAL CASE','Property: 128 Example Lane, Unit B','Owner: Example Property LLC','PHA: Example Housing Agency','Case reference: DEMO-104','Proposed rent: $2,100 per month']
c=canvas.Canvas(str(p/'text.pdf'),pagesize=letter)
for i,line in enumerate(lines): c.drawString(54,740-24*i,line)
c.save()
c=canvas.Canvas(str(p/'blank.pdf'),pagesize=letter);c.rect(54,54,504,684);c.showPage();c.save()
w=PdfWriter();w.append(PdfReader(p/'text.pdf'));w.encrypt('synthetic-test-password',algorithm='AES-256');w.write(p/'encrypted.pdf')
c=canvas.Canvas(str(p/'large-text.pdf'),pagesize=letter)
for page in range(40):
 for line in range(55): c.drawString(36,755-line*13,'Synthetic fixture content only - no personal data. Row %03d.' % line)
 c.showPage()
c.save()
(p/'expected.txt').write_text('\n'.join(lines)+'\n')
