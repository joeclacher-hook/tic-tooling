---
name: technical-requirements-generator
description: >
  Generates a Hook technical requirements spreadsheet (.xlsx) for a specific customer, mapping their CS processes
  to supported Hook functionality. Use this skill whenever a user wants to produce a technical requirements doc for
  a new or existing Hook customer, asks what Hook can support for a given customer, wants to map a success plan to
  Hook features, or shares customer documents (PDFs, slides, playbooks) and asks what can be built in Hook. Always
  trigger this skill when a success planning deck or CS playbook is shared alongside any request about Hook
  requirements, implementation scoping, or what Hook can do for a customer.
---

# Hook Technical Requirements Generator

Produces a formatted `.xlsx` file mapping a customer's CS processes to Hook functionality, based on their success
plan deck and any other documents they share.

---

## Inputs

The user will provide:
1. **A Success Planning deck** (PDF or slide export) — always required. Contains the customer's goals (north star,
   Goal 1, Goal 2, Goal 3, etc.) and strategies.
2. **Additional documents** (optional): CS playbooks, QBR templates, sales handover notes, Vitally/Gainsight
   workflow exports, onboarding process docs — anything that describes how the CS team works today.
3. **Plain text context** (optional): background on the customer, their product, their team, key metrics.

---

## Output

A single `.xlsx` file (saved to `/mnt/user-data/outputs/`) named `[CustomerName]_Hook_Technical_Requirements.xlsx`
with **one sheet** called `Hook Requirements`.

### Columns

| Column | Description |
|---|---|
| **CS Process** | A plain-English description of the CS activity (e.g. "CSM identifies low usage and takes action to increase adoption"). Be specific to the customer — use their product name, metric names, and segment names where known. |
| **Requirement in Hook** | The specific Hook feature/automation that fulfils the process. Reference real Hook features only (see Hook Functionality Reference below). **Leave blank if unsure** — never invent or assume functionality. |
| **Priority** | High / Medium / Low — inferred from the customer's goals and strategies |
| **Goal** | The goal from the success plan this maps to. Use the exact goal label from the deck (e.g. "Goal 1: Onboarding Velocity"). |
| **Source** | Name of the document this requirement came from (e.g. "Success Plan", "CS Playbook", "Sales Handover") |

---

## Step-by-step Process

### Step 1 — Read all uploaded documents

Use `view /mnt/user-data/uploads/` to list files. Then read each one using the appropriate method:
- PDFs: use the pdf-reading skill (bash `pdftotext` or `pdf2image` if needed)
- XLSX: use `python3 -c "import pandas as pd; ..."` to extract all sheets
- The success plan PDF is usually visible directly in the context window as a document block — read it there if so

Extract:
- The customer's **north star objective**
- Each **goal** (label + strategies + measures) — these become the Goal column values
- Any **specific metrics, segments, data sources, or workflows** mentioned
- Any **current tooling** referenced (Gainsight, Vitally, Salesforce, HubSpot, Zendesk, Gong, Slack, etc.)

### Step 2 — Identify CS processes

For each goal and strategy in the success plan, derive one or more concrete CS processes. Think about:
- What would a CSM *do* in response to this strategy?
- What signals or events would trigger action?
- What recurring workflows are implied (renewals, QBRs, onboarding, health reviews)?
- What expansion/upsell motions are described?

Also extract processes from any other uploaded documents (playbooks, handover notes).

Use customer-specific language throughout — reference their actual product, metrics, and segments.

### Step 3 — Map to Hook functionality

For each CS process, identify the relevant Hook feature(s). Consult the **Hook Functionality Reference** section
below. Only map to features you are confident exist. If it's unclear whether Hook supports something, leave
Requirement in Hook **blank**.

### Step 4 — Assign priority

- **High**: Directly enables the north star metric, addresses a top-priority goal strategy, or is mentioned
  explicitly as critical
- **Medium**: Supports a goal but is not the primary lever, or is a "nice to have" efficiency gain
- **Low**: Mentioned in passing, or is a workflow enhancement with low urgency

### Step 5 — Build the spreadsheet

Use `openpyxl` to produce the `.xlsx`. Apply the following formatting:
- **Header row**: bold, white text, dark background (`1A1A2E` or similar dark navy)
- **Column widths**: CS Process ~60, Requirement in Hook ~55, Priority ~12, Goal ~30, Source ~20
- **Row height**: set to ~30pt for readability; wrap text in all cells
- **Priority colour coding**:
  - High → light red fill (`FFCCCC`)
  - Medium → light amber fill (`FFF2CC`)
  - Low → light green fill (`CCFFCC`)
- **Font**: Arial, size 10 for data; size 11 bold for headers
- Freeze the top row

Save to `/mnt/user-data/outputs/[CustomerName]_Hook_Technical_Requirements.xlsx`.

Do **not** run `recalc.py` — there are no formulas in this file.

---

## Hook Functionality Reference

Use this as your source of truth for what Hook can and cannot do. Do not invent features.

### Echo (AI Signal Detection)
- Scans conversational data (emails, Gong meeting transcripts, support tickets, Slack) to detect risk and
  expansion signals
- Configurable with customer-specific context prompts (business context, competitors, churn signals, upsell signals)
- Lookback window: configurable (typically 180 days)
- Detected signals are surfaced on the account and can trigger Conductor automations
- Signal types include: churn risk, expansion opportunity, stakeholder departure, sentiment shift
- Docs: https://help.hook.co/en/articles/11598830-echo-use-ai-to-identify-risk-and-expansion-opportunities-at-scale

### Conductor (Automations)
- Build rule-based automations triggered by: metric thresholds, date conditions (e.g. X days before renewal),
  signal creation, engagement level changes, or manual triggers
- Actions include: create a signal, send a Slack notification, send an email, add account to cadence, update
  a field
- Supports conditional branching and multi-step sequences
- Docs: https://help.hook.co/en/articles/11747327-conductor-build-automations-in-hook

### Signals
- Manual or automated flags on accounts (risk or expansion type)
- Can be assigned to a CSM/AE and tracked to resolution
- Visible in Customers table views and Actions Panel
- Docs: https://help.hook.co/en/articles/10534620-signals-flag-warnings-or-opportunities-for-accounts

### Briefs (AI Pre-call Context)
- Auto-generated account summaries shown before calls
- Customisable sections: open signals, recent support activity, usage trends, outstanding action items
- Custom Briefs can be configured per customer with specific data sections
- Works with Hook Chat for post-call summarisation
- Docs: https://help.hook.co/en/articles/12629105-briefs-instant-context-for-every-customer-interaction

### Engagement Levels
- AI-generated health scores based on product usage, conversational data, and CRM signals
- Used to segment accounts and trigger automations
- Docs: https://help.hook.co/en/collections/10977131-engagement-levels

### Cadences
- Add accounts or users to outreach sequences (email or task-based)
- Supports renewal outreach, onboarding follow-ups, re-engagement workflows
- Docs: https://help.hook.co/en/articles/10534766-add-accounts-to-a-cadence

### Emails
- Send automated emails from Conductor automations or manually from the Contacts table
- Create reusable email templates
- Connect a CSM's email inbox to Hook for tracking
- Docs: https://help.hook.co/en/articles/13561793-send-automated-emails

### Customers Table & Saved Views
- Filterable/sortable table of all accounts with metrics, signals, and renewal dates
- Save and share custom views (e.g. "All accounts with active churn signals")
- Useful for weekly manager reviews and CSM book-of-business management
- Docs: https://help.hook.co/en/collections/11548157-reporting-on-your-book-of-business

### Contacts Table
- View and manage contacts/users within accounts
- Filter by activity level, last login, etc.
- Send individual or bulk emails directly from the table

### Goals (Account-level)
- Set and track objectives against specific accounts
- Can be used for onboarding tracking or success milestones
- Docs: https://help.hook.co/en/articles/10534975-goals-set-and-track-objectives-for-accounts

### Actions Panel
- Centralised view of all AI-recommended actions across the book of business
- Aggregates signals, Echo alerts, and at-risk accounts
- Docs: https://help.hook.co/en/articles/13563681-hook-actions-panel-bringing-all-hook-s-ai-recommendations-in-one-place

### Plaibooks
- AI-powered playbook guidance tailored to specific accounts
- Surfaces next-best-action recommendations based on account context
- Docs: https://help.hook.co/en/articles/11840857-plaibooks-ai-powered-guidance-tailored-to-accounts

### Hook Chat
- AI assistant for querying customer data and generating insights
- Useful for post-call summarisation, account Q&A, and drafting emails
- Docs: https://help.hook.co/en/articles/11960173-chat-ai-assistant-for-customer-insights

### Key Metrics & Custom Fields
- Hook can ingest metrics from data integrations (BigQuery, Snowflake, Redshift, S3, CRM)
- Metrics power Conductor automations (e.g. "when metric X < threshold → trigger action")
- Custom account fields can be imported from Salesforce or HubSpot CRM

### Slack Notifications
- Conductor can send Slack messages to channels or individuals as an automation action
- Docs: https://help.hook.co/en/articles/12147234-stay-ahead-with-slack-notifications

### What Hook does NOT do (do not map requirements to these):
- It is not a project management tool (no Gantt charts, no complex task dependencies)
- It does not have a native video conferencing integration — Gong transcripts are ingested, not live calls
- It does not replace a CRM — it reads from CRM data but is not a system of record for deals/contacts
- It does not have a built-in NPS survey tool
- It cannot send SMS

---

## Example rows (for reference — do not copy verbatim, always customise to the customer)

| CS Process | Requirement in Hook | Priority | Goal | Source |
|---|---|---|---|---|
| CSM identifies low usage and takes action to increase adoption | Conductor automation: trigger when usage metric falls below threshold → create a churn risk signal on the account | High | Goal 1: Onboarding Velocity | Success Plan |
| CSM is alerted when a customer champion departs | Echo signal detection from conversational data. Conductor: when stakeholder departure signal is created → alert assigned CSM | High | Goal 2: Risk Visibility and Action | Success Plan |
| CSM prepares for QBR with account context and open action items | Configure Briefs with custom sections: open signals, usage trends, outstanding action items | Medium | Goal 1: Onboarding Velocity | CS Playbook |
| Manager reviews full book of business for at-risk accounts weekly | Customers table saved view filtered by active churn risk signals, sortable by ARR and renewal date | Medium | Goal 2: Risk Visibility and Action | Success Plan |

---

## Quality checks before saving

- Every row has a CS Process entry — no blanks in that column
- Requirement in Hook is blank (not guessed) if Hook clearly doesn't support it
- Goal values match exactly what's in the success plan deck
- No generic/templated language — all rows are specific to this customer
- At least one row per goal from the success plan
- Priority distribution is reasonable (not everything is High)
