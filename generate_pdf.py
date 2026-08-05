import re
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted, KeepTogether
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_elements(num_pages)
            super().showPage()
        super().save()

    def draw_page_elements(self, page_count):
        self.saveState()
        
        # Suppress headers/footers on the cover page
        if self._pageNumber == 1:
            # Draw beautiful background decoration on cover page
            self.setFillColor(colors.HexColor("#0f172a")) # Dark Slate
            self.rect(0, 0, 18, 792, fill=True, stroke=False)
            self.setFillColor(colors.HexColor("#3b82f6")) # Accent Blue
            self.rect(18, 0, 6, 792, fill=True, stroke=False)
            self.restoreState()
            return
            
        # Draw Header
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#475569"))
        self.drawString(54, 745, "LIVEDESK — TECHNICAL PLATFORM DOCUMENTATION")
        
        self.setLineWidth(0.5)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.line(54, 737, 558, 737)
        
        # Draw Footer
        self.line(54, 52, 558, 52)
        self.setFont("Helvetica", 8)
        self.drawString(54, 38, "Confidential — Internal Technical Document")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 38, page_text)
        
        self.restoreState()

def md_to_html_markup(text):
    # Escape XML entities first
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Convert markdown bold **bold** to <b>bold</b>
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Convert markdown backticks `code` to Courier font
    text = re.sub(r'`(.*?)`', r'<font face="Courier" color="#1e3a8a"><b>\1</b></font>', text)
    
    # Convert simple markdown links [text](url) to ReportLab standard links (skip anchors)
    def link_repl(match):
        label, url = match.group(1), match.group(2)
        if url.startswith('#'):
            return label
        return f'<a href="{url}" color="#2563eb"><u>{label}</u></a>'
        
    text = re.sub(r'\[(.*?)\]\((.*?)\)', link_repl, text)
    return text



def parse_markdown(md_content):
    lines = md_content.split('\n')
    flowables = []
    
    # Styles
    styles = getSampleStyleSheet()
    
    # Modify/Add Custom Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=32,
        leading=38,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=15
    )
    
    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#475569"),
        spaceAfter=40
    )
    
    metadata_style = ParagraphStyle(
        'CoverMetadata',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748b")
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=22,
        spaceAfter=10,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'Heading3_Custom',
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=8
    )
    
    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=6
    )
    
    code_style = ParagraphStyle(
        'Code_Custom',
        fontName='Courier',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f8fafc"),
        borderColor=colors.HexColor("#e2e8f0"),
        borderWidth=0.5,
        borderPadding=8,
        spaceBefore=8,
        spaceAfter=12
    )
    
    # State tracking
    in_code_block = False
    code_lines = []
    
    in_table = False
    table_headers = []
    table_rows = []
    
    # Generate Cover Page First
    flowables.append(Spacer(1, 150))
    flowables.append(Paragraph("LIVEDESK", title_style))
    flowables.append(Paragraph("Self-Hosted Live Chat Platform", subtitle_style))
    
    desc_text = (
        "Complete technical system documentation outlining system architecture, "
        "technology stack, real-time message routing protocols, data schema models, "
        "and REST API reference endpoints."
    )
    desc_style = ParagraphStyle(
        'CoverDesc',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#334155"),
        spaceAfter=150
    )
    flowables.append(Paragraph(desc_text, desc_style))
    
    flowables.append(Paragraph("<b>Version:</b> 1.0.0", metadata_style))
    flowables.append(Paragraph("<b>Database:</b> MongoDB", metadata_style))
    flowables.append(Paragraph("<b>Runtime:</b> Node.js / Express / Socket.io", metadata_style))
    flowables.append(Paragraph("<b>Date:</b> August 2026", metadata_style))
    
    flowables.append(PageBreak())
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Handle code blocks
        if line.strip().startswith('```'):
            if in_code_block:
                # End of code block
                code_text = '\n'.join(code_lines)
                flowables.append(Preformatted(code_text, code_style))
                in_code_block = False
                code_lines = []
            else:
                in_code_block = True
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue
            
        # Handle tables
        if line.strip().startswith('|'):
            # Read table row
            row_cells = [cell.strip() for cell in line.split('|')[1:-1]]
            
            # Check if this is the separator line (e.g. |---|---|)
            if all(re.match(r'^:?-+:?$', cell) for cell in row_cells):
                i += 1
                continue
                
            if not in_table:
                in_table = True
                table_headers = row_cells
            else:
                table_rows.append(row_cells)
                
            i += 1
            continue
        else:
            if in_table:
                # End of table, compile it
                flowables.append(create_pdf_table(table_headers, table_rows, body_style))
                flowables.append(Spacer(1, 10))
                in_table = False
                table_headers = []
                table_rows = []
                
        # Skip empty lines
        if not line.strip():
            flowables.append(Spacer(1, 4))
            i += 1
            continue
            
        # Handle headers
        if line.startswith('# '):
            text = md_to_html_markup(line[2:])
            flowables.append(Paragraph(text, h1_style))
        elif line.startswith('## '):
            text = md_to_html_markup(line[3:])
            flowables.append(Paragraph(text, h2_style))
        elif line.startswith('### '):
            text = md_to_html_markup(line[4:])
            flowables.append(Paragraph(text, h3_style))
        # Handle list items
        elif line.strip().startswith('- ') or line.strip().startswith('* '):
            # Clean list symbol
            cleaned_line = line.strip()[2:]
            text = md_to_html_markup(cleaned_line)
            flowables.append(Paragraph(f"&bull; {text}", bullet_style))
        # Handle blockquotes
        elif line.strip().startswith('> '):
            text = md_to_html_markup(line.strip()[2:])
            quote_style = ParagraphStyle(
                'Quote_Custom',
                fontName='Helvetica-Oblique',
                fontSize=10,
                leading=14,
                textColor=colors.HexColor("#475569"),
                backColor=colors.HexColor("#f1f5f9"),
                borderPadding=8,
                leftIndent=10,
                spaceAfter=10
            )
            flowables.append(Paragraph(text, quote_style))
        else:
            # Regular paragraph
            text = md_to_html_markup(line)
            flowables.append(Paragraph(text, body_style))
            
        i += 1
        
    return flowables

def create_pdf_table(headers, rows, body_style):
    # Determine the widths based on the column sizes to fit exactly 504 points width (612 - 54*2)
    col_count = len(headers)
    
    # Custom widths for specific tables
    if col_count == 3:
        # Check if first cell is Layer/Method/Field
        h0 = headers[0].lower()
        if 'layer' in h0:
            col_widths = [110, 130, 264] # Tech stack
        elif 'method' in h0:
            col_widths = [70, 200, 234] # API endpoints
        elif 'field' in h0:
            col_widths = [140, 140, 224] # Data schemas
        else:
            col_widths = [504 / col_count] * col_count
    elif col_count == 2:
        h0 = headers[0].lower()
        if 'postgresql' in h0:
            col_widths = [252, 252] # Concept mapping
        else:
            col_widths = [150, 354]
    else:
        col_widths = [504 / col_count] * col_count
        
    # Styles for table cell headers
    header_style = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white
    )
    
    # Style for table cells
    cell_style = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#334155")
    )
    
    # Formatted data
    formatted_data = []
    
    # Add Header Row
    formatted_data.append([Paragraph(md_to_html_markup(h), header_style) for h in headers])
    
    # Add Data Rows
    for r in rows:
        row_cells = []
        for cell in r:
            # Wrap in Paragraph so it wraps within the specified width
            row_cells.append(Paragraph(md_to_html_markup(cell), cell_style))
        formatted_data.append(row_cells)
        
    t = Table(formatted_data, colWidths=col_widths, repeatRows=1)
    
    # Build Table Style
    t_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0f172a")), # Dark header
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ])
    
    # Alternating row background
    for idx in range(1, len(formatted_data)):
        if idx % 2 == 0:
            t_style.add('BACKGROUND', (0, idx), (-1, idx), colors.HexColor("#f8fafc"))
            
    t.setStyle(t_style)
    return t

def generate_pdf():
    # Read documentation
    doc_path = 'c:/Users/ACER/Project/bl/live-desk/DOCUMENTATION.md'
    if not os.path.exists(doc_path):
        print(f"Error: Documentation file not found at {doc_path}")
        return
        
    with open(doc_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
        
    # Clean documentation:
    # 1. Remove Built by Sanjay (replace with generic)
    md_content = md_content.replace('Built by Sanjay', 'LiveDesk Platform Documentation Team')
    # 2. Omit or clean user-specific info
    # The passwords/usernames in the file are default credentials for testing (admin / password123), 
    # which is not user-specific but rather default seed behavior, but we can make it sound generic.
    md_content = md_content.replace('Default Admin Account', 'Default Seeding Account')
    
    # Generate flowables
    flowables = parse_markdown(md_content)
    
    # Create PDF document
    pdf_path = 'c:/Users/ACER/Project/bl/live-desk/LiveDesk_Documentation.pdf'
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54, # 0.75 in
        rightMargin=54,
        topMargin=72,  # 1.0 in
        bottomMargin=72
    )
    
    print("Building PDF...")
    doc.build(flowables, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully at {pdf_path}")

if __name__ == '__main__':
    generate_pdf()
