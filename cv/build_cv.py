"""Builds docs/Ali-Alzahrani-CV.pdf, the public CV, in the master CV design.

Needs the private CV builder in ../../tmp/cv-builder and ReportLab.
Keep the titles, dates and qualifications here in step with content/*.json.
The portrait, phone number and exact city are deliberately left out of this public copy.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILDER = os.path.normpath(os.path.join(HERE, '..', '..', 'tmp', 'cv-builder', 'build'))
sys.path.insert(0, BUILDER)
# Load the master CV layout, applying public-copy changes in memory only.
import types  # noqa: E402
_path = os.path.join(BUILDER, 'cvlib.py')
_src = open(_path, encoding='utf-8').read()
_phone = "('+966 546 288 844', WHITE), "
assert _phone in _src
_src = _src.replace(_phone, '').replace('3 * sw(sep', '2 * sw(sep').replace("('Dammam, Saudi Arabia', PALE)", "('Eastern Province, Saudi Arabia', PALE)")
# Remove the portrait and its border, then use the full header width.
# The private master builder and original CVs remain unchanged.
_header_start = _src.index('    def header(self, d):')
_header_end = _src.index('        # stats band', _header_start)
_public_header = _src[_header_start:_header_end]
_photo_draw = "        c.drawImage(PHOTO, 46, Y(134), 92, 92, mask='auto')\n"
_photo_border = '        c.setStrokeColor(GOLD); c.setLineWidth(1.5); c.circle(92, Y(88), 49.4, stroke=1, fill=0)\n'
assert _photo_draw in _public_header and _photo_border in _public_header
assert _public_header.count('self.text(168,') == 3
_public_header = _public_header.replace(_photo_draw, '').replace(_photo_border, '')
_public_header = _public_header.replace('self.text(168,', 'self.text(LX,')
_public_header = _public_header.replace('self.line(168, 88, 308, 88,', 'self.line(LX, 88, LX + 140, 88,')
_src = _src[:_header_start] + _public_header + _src[_header_end:]
cvlib = types.ModuleType('cvlib')
cvlib.__file__ = _path
exec(compile(_src, _path, 'exec'), cvlib.__dict__)
LOGO_VALLOUREC, LOGO_TARGET = cvlib.LOGO_VALLOUREC, cvlib.LOGO_TARGET

D = dict(
    pdf_title='Ali Alzahrani - CV',
    subject='Curriculum Vitae',
    headline='Middle East IT Leader',
    tagline=['Enterprise IT', 'Industrial Operations', 'Practical AI Adoption', 'Cybersecurity Coordination'],
    stats=[('12', 'Years in IT'), ('7', 'Years in Leadership'), ('4', 'International Sites'), ('300', 'Employees Trained on AI')],
    profile="Technology leader with twelve years across industrial, construction and corporate environments, seven of them in leadership. Leads IT for Vallourec's four international sites as the regional focal point between the business and the global Business Applications, Infrastructure, Endpoint and Security functions. Led regional AI adoption with around 300 employees trained on Microsoft Copilot and working applications delivered from a use-case initiative. Took the Saudi operation through Aramco Cyber Security certification ahead of schedule, led the two-year programme to define the full factory network, and spent three years at an Aramco contractor delivering IT across head office and nine remote project sites. Saudi national, certified practitioner across five ISO standards.",
    comp_title='Core Capabilities',
    competencies=[
        ('AI Adoption & Innovation', 'Leads regional AI adoption: around 300 employees trained on Microsoft Copilot, high-value use cases identified across departments and working applications delivered. ISO 42001 Practitioner. Personal projects direct AI coding agents to build and test real software, each with a stated status.'),
        ('Enterprise Infrastructure', 'Microsoft 365, Azure / Entra ID, Intune, SharePoint, Windows Server, virtualisation, backup and disaster recovery, Cisco and N-Tron switching, firewalls and IP telephony, across offices, plants and remote sites.'),
        ('Industrial IT & Operations', 'IT/OT connectivity from the automation layer to core switching, real-time product tracking and material management (PSI) with supplier interfaces, shop-floor digital workflows, cycle-time monitoring and shutdown analysis.'),
        ('Security & Resilience', 'Principal lead for Aramco Cyber Security Certification, ahead of schedule, then a twelve-month programme securing every connected device. Certified practitioner in ISO 27001, 27701, 22301, 31000 and 42001.'),
        ('Solution Delivery', 'Three years in a dedicated project management role. Requirements, design, build, testing, cutover and handover to support, including a new regional office delivered in six months.'),
        ('Leadership & Business Partnering', 'Leads the regional IT team and partners with site management and global functions across time zones. Coordinated nine IT support and technical teams at an Aramco contractor, working directly with clients.'),
        ('Commercial Ownership', 'Owns regional IT procurement, contracts, leasing and licensing, including vendor selection, negotiation and consolidation, with Procurement and Finance.'),
    ],
    experience=[
        dict(name='VALLOUREC', desc='Industrial — Saudi Arabia & Middle East', dates='Oct 2017 — Present', logo=(LOGO_VALLOUREC, 56.1), roles=[
            dict(title='Middle East IT Leader', dates='Jan 2024 — Present', sub='IT team across four international sites · corporate offices, plants and remote locations', bullets=[
                'Regional focal point for the global shared services functions — Business Applications, Infrastructure, Endpoint and Security — collaborating across multiple time zones to translate group programmes into local execution.',
                'Leads regional AI adoption: around 300 employees trained on Microsoft Copilot, with a use-case initiative that identified high-value opportunities and delivered working applications.',
                'Directs the digitalisation programme — SharePoint migration with automated workflows and digital signatures, digital quality log sheets, digital procurement, and cycle-time and shutdown analytics.',
                'Owns regional IT procurement, contracts, leasing and licensing, consolidating suppliers and reducing overhead.',
                'Defines the IT procedures, standards and cybersecurity practices adopted across the sites, and provides IT consultancy and escalation support to site management.']),
            dict(title='Infrastructure Expert & Project Manager', dates='Jan 2021 — Jan 2024', bullets=[
                'Secured Aramco Cyber Security Certification for Vallourec Saudi Arabia with an authorised third party, delivered ahead of the expected schedule.',
                'Led the two-year programme to recover and define the complete factory network architecture, from the automation layer (IT/OT) through to core group switching.',
                'Migrated on-premises Active Directory to Entra ID with Intune, lowering operating cost and centralising device compliance and application policy.',
                'Delivered a new regional office’s infrastructure end to end within six months.',
                'Deployed 20+ physical and virtual servers with backup and disaster recovery, and re-architected 100+ Cisco and N-Tron switches across interlinked locations.',
                'Supported the NDT project replacement, adapting production-line IT tracking systems through each phase of the changeover.']),
            dict(title='IT Specialist', dates='Oct 2017 — Jan 2021', bullets=[
                'Built an automated QR-code processing system with an interactive GUI, reducing manual handling errors.',
                'Maintained real-time product tracking and Optimised Material Management (PSI) systems across integrated supplier interfaces.',
                'Managed the 200+ PC, 100+ CCTV, IP telephony and access control estate, applying group antivirus and security agent standards.',
                'As part of the COVID-19 crisis cell, moved seven departments and about 100 people to remote work with one technician.'],
                awards=['Excellence Leader Award, 2020', 'Creativity Award, Vallourec Group, 2019']),
        ]),
        dict(name='TARGET CONSTRUCTION', desc='Construction & contracting — Aramco contractor', dates='Jan 2014 — Sep 2017', logo=(LOGO_TARGET, 14.2), roles=[
            dict(title='Head of IT Department', dates='Jan 2015 — Sep 2017', sub='Admin & IT procurement advisor · 699 users across head office and remote project sites', bullets=[
                'Built and operated the IT support network serving 699 users across head office and remote construction sites, and migrated accounts and email to Microsoft Exchange Online with zero downtime.',
                'Initiated departmental IT procedures and standards, unified asset models with registered lifespans, and regained control of more than 1,000 devices.',
                'Established Active Directory, file sharing and unified group policy, with daily incremental backups on Windows Server 2012 R2 with RAID 5, and monitored security through Cyberoam controls.',
                'Deployed biometric attendance systems across every site to improve payroll accuracy, and managed the corporate telecommunications profile.']),
            dict(title='Project Engineer', dates='Jan 2014 — Jan 2015', bullets=[
                'Directed IT and construction contractors to establish nine remote project sites with full infrastructure and IT assets, connecting more than 500 users.',
                'Coordinated nine IT support and technical teams delivering on time and within budget, resolving 79% of reported issues remotely as first line.',
                'Collaborated with clients to design and implement IT systems across customer sites, and built two isolated site networks.',
                'Led vendor interfacing and negotiation for IT procurement, and conducted site audits every two to three months.']),
        ]),
    ],
    selected=[
        ('Regional AI Adoption Programme', 'Around 300 employees', 'Trained employees on Microsoft Copilot and ran a use-case discovery initiative that converted findings into working applications.'),
        ('Aramco Cyber Security Certification', '3 months, then 1 year', 'Principal lead certifying Vallourec Saudi Arabia with an authorised third party, ahead of schedule, then securing every device.'),
        ('Factory Network Architecture, IT/OT', '2-year programme', 'Recovered and defined the entire plant topology, from the automation layer through to core group switching.'),
    ],
    certs=[
        ('TRECCERT Digital Trust Fellowship', 'ISO 27001, 27701, 22301, 31000 & 42001 Practitioner, 91.7%, 2026', None),
        ('Project Management Professional (PMP)', 'Project Management Institute, exam booked', 'EXPECTED 2026'),
        ('Applied Generative AI for Digital Transformation', 'MIT Professional Education, enrolled', 'EXPECTED 2026'),
        ('Aramco Cyber Security Certification', 'achieved for Vallourec Saudi Arabia via authorised third party', None),
        ('Leadership Development Programme', 'Cranfield School of Management / HRDF, 2020', None),
        ('Microsoft Azure Fundamentals (AZ-900) Course', 'A Cloud Guru, 2024', None),
        ('Power BI Application Workshop', 'Rows & Columns, led by Microsoft MVP Mohammed Alfan, 1 day, Feb 2025', None),
    ],
    extra=[
        'Introduction to SAP Navigation and Basics (KFUPM, 2023)',
        'Microsoft 365 Copilot for IT (Microsoft, 2026)',
        'Azure Virtual Desktop Immersion Workshop (Microsoft, 2022)',
        'Fundamentals of Digital Governance and Trust (2026)',
        'Journey to AI World Bootcamp (Arab Open University, 2025)',
        'Introduction to Cybersecurity (IAU, 2022)',
        'Claude 101 (Anthropic Academy, 2026)',
        'Advanced MS Excel (Adflex)',
        'Management of People (Leoron Institute, 2022)',
        'Emotional Intelligence (Nayel Institute, 2021)',
        'Accelerated Leadership Training Program (Leoron Institute, 2021)',
        'Summer School Leadership Programme (Newcastle University, 2009)',
        'Firefighting Systems in Data Centres',
        'Saudi Aramco Safety Orientation (2015)',
    ],
    skills=[
        ('AI & Automation', 'Microsoft Copilot, AI adoption and enablement, AI use-case discovery, AI governance, workflow automation, directing AI coding agents'),
        ('Infrastructure & Cloud', 'Microsoft 365, Azure / Entra ID, Intune, SharePoint, Windows Server, VMware ESXi, Data Domain, Acronis, backup and disaster recovery'),
        ('Networking & OT', 'Cisco, Cisco Meraki and N-Tron, IT/OT connectivity, factory network topology, firewalls, MES, BioTime, Avaya and Cisco IP telephony'),
        ('Security & Governance', 'ISO 27001 / 27701 / 22301 / 31000 / 42001, Aramco Cyber Security certification, NCA and PDPL alignment, IT policies and procedures, audit readiness, risk analysis'),
        ('Delivery & Commercial', 'Scope, cost and risk planning, testing and cutover, Jira, Confluence, Agile and hybrid delivery, procurement, contracts, licensing, vendor negotiation'),
    ],
)

OUT = os.path.join(HERE, '..', 'docs')
os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(OUT, 'Ali-Alzahrani-CV.pdf')
d = cvlib.build_cv(TMP, D)
print('pages', d.page, 'last_y %.1f' % d.last_y, d.overflow)
