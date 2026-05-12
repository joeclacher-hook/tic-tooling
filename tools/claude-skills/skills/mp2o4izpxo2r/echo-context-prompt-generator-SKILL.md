---
name: echo-context-prompt-generator
description: Generates the four organisation-specific context prompts used to configure Hook's Echo AI agent for a new customer. Use this skill whenever a user asks to set up Echo for a new organisation, create Echo prompts, generate Hook AI context for a customer, onboard a new org onto Echo, or write the business context / competition / churn-upsell / playbook prompts that feed into Echo's signal detection. Always trigger this skill when the user names a company and asks for Echo configuration, even if they phrase it casually like "can you set up Echo prompts for Acme Corp?".
---

# Echo Context Prompt Generator

Generates the four customer-specific context prompts that configure Hook's Echo AI signal detection agent for a new organisation. Echo uses these prompts to identify churn risks and upsell opportunities from customer interaction data (emails, meetings, support tickets, Slack messages).

---

## Background

Hook's Echo agent detects signals using two prompt types injected at runtime:

- **`get_organization_information`** — consumed when Echo fetches org-level context. Contains Prompts 1 and 2.
- **`$customer_specific_user_prompt`** — injected directly into Echo's user prompt per-customer analysis run. Contains Prompts 3 and 4.

Each prompt must be tight, precise, and additive — Echo already has a default system prompt and user prompt (see `references/echo-default-prompts.md`). Do **not** repeat logic already covered there.

---

## Your Workflow

### Step 1 — Gather inputs

You need the following before writing any prompts. Collect from the conversation, attached documents, or ask the user:

| Input | Source |
|---|---|
| Organisation name and website | User or conversation |
| Organisation-specific CS materials | User attachment (e.g. playbooks, onboarding docs, tier definitions) — **required for Prompts 3 & 4** |
| Any known competitors | User or online research |

If CS materials are not attached, tell the user: _"Prompts 3 and 4 will be much stronger with your internal CS materials — e.g. playbooks, renewal workflows, segment definitions. Can you attach any? Otherwise I'll use online sources as a best-effort fallback."_

If the user wants to proceed without them, do so and flag assumptions clearly.

---

### Step 2 — Research

Use **web search** to find:

1. **LinkedIn "About" page** — primary source for Prompt 1 (company description, employee count, product type)
2. **Company website** — products, pricing model, customer types, value proposition
3. **G2 / Capterra / Trustpilot** — competitor positioning, comparison pages
4. **Competitor websites / battle cards** — differentiation angles

Search efficiently: start with `[company name] LinkedIn`, `[company name] competitors`, `[company name] pricing model`, `[company name] customer success`.

---

### Step 3 — Write the four prompts

Write all four prompts sequentially. Each has specific rules below.

---

#### Prompt 1 — About Your Business

**Length:** 3–4 sentences  
**Purpose:** Gives Echo foundational company context to inform signal calibration  
**Must include:**
- Industry / product category (e.g. "cloud-based HR workflow automation")
- Company size (use employee count or bracket: SME / mid-market / large enterprise)
- How the product is sold (licenses, seats, API usage, usage-based, etc.)
- Type of customers they serve (enterprise, SMBs, developers, content creators, etc.)
- Core value proposition — the primary problem the product solves

**Tone:** Factual, neutral, third-person. No marketing language.

**Example output:**
> Acme Corp is a mid-market B2B SaaS company (~200 employees) that provides AI-powered contract management software to legal and procurement teams at enterprise organisations. The product is sold as an annual per-seat subscription, typically to companies with 500–5,000 employees. Acme's core value is reducing contract review time and legal risk exposure by automating clause extraction and approval workflows.

---

#### Prompt 2 — Your Competition

**Length:** 3–4 sentences  
**Purpose:** Helps Echo recognise when a customer is evaluating or considering switching to a competitor  
**Must include:**
- Names of the top 2–4 direct competitors
- Acme's competitive differentiators (what they win on)
- Common objections or reasons customers might switch away
- One sentence on positioning (how CSMs should frame the org vs. alternatives)

**Tone:** Battlecard style — clear, confident, honest about weaknesses if relevant.

**Example output:**
> Acme's main competitors are ContractPodAi, Ironclad, and Docusign CLM. Acme differentiates on ease of implementation (average go-live in 3 weeks vs. 3+ months for Ironclad) and its native Salesforce integration. Customers at risk of switching typically cite missing advanced redlining features or pricing concerns at renewal. CSMs should position Acme on time-to-value and sales team adoption rather than enterprise feature depth.

---

#### Prompt 3 — Additional Business Context for Churn and Upsell Detection

**Length:** ~200–400 words  
**Purpose:** Org-specific guidance for Echo's signal identification logic — supplements (does not repeat) the default Echo prompt  
**Structure:** Use XML tags as shown below. Cover only what is genuinely additive.

```xml
<products>
List the main products, tiers, or packages. Include names and any relevant identifiers. 
Note how customers typically start (land) and expand (grow).
</products>

<upsell_signals>
Describe signals that genuinely indicate upsell readiness:
- Usage patterns that typically precede expansion
- Relationship signals (e.g. new executive sponsor, team growing)
- Contract signals (approaching capacity, renewal approaching with multi-year potential)
- Signals that LOOK like upsell but should be ignored (e.g. trial requests that are just price fishing)
</upsell_signals>

<churn_signals>
Describe signals that represent genuine churn risk:
- Usage/product signals (e.g. login drop-off, feature abandonment, integration failures)
- Relationship signals (champion leaving, procurement changes, budget freeze language)  
- Strategic signals (M&A, cost-cutting initiatives, vendor consolidation)
- Signals to ignore (e.g. standard procurement friction, routine ticket escalations that resolve quickly)
</churn_signals>

<ignore>
Anything that looks concerning but should NOT trigger a signal for this specific org.
</ignore>
```

Draw content from: CS materials, playbooks, onboarding docs, and online sources. Be specific — vague guidance like "watch for disengagement" is already in the default prompt. Write things Echo wouldn't know without org-specific context.

---

#### Prompt 4 — Additional Instructions for Playbooks (Actions)

**Length:** Only as long as the available evidence warrants — do not pad  
**Purpose:** Guides Echo to generate CSM actions that match the org's actual workflows  
**Rule:** Only include a section if there is clear, specific information available from the org's CS materials. Do not invent or assume content. If no CS materials are provided and nothing relevant is found online, this prompt may be very short or even empty — that is fine.

Use XML tags for any sections you do have content for. The available sections are:

```xml
<segments>
<!-- Include only if segment definitions and how actions differ by segment are documented -->
</segments>

<journey_milestones>
<!-- Include only if customer journey stages, timelines, or milestones are documented -->
</journey_milestones>

<escalation_workflows>
<!-- Include only if escalation paths, SLAs, or comms sequences are documented -->
</escalation_workflows>

<stakeholder_playbooks>
<!-- Include only if specific stakeholder scenarios (e.g. champion leaving) are documented -->
</stakeholder_playbooks>

<qbr_guidance>
<!-- Include only if QBR/EBR cadence, format, or content is documented -->
</qbr_guidance>
```

Only include the tags that have content to fill them. If none of the above are documented, return a brief note explaining that no org-specific playbook guidance was available and no assumptions have been made.

---

### Step 4 — Present the output

Present all four prompts clearly labelled, in order. Use this format:

```
## Prompt 1: About Your Business
[content]

## Prompt 2: Your Competition
[content]

## Prompt 3: Additional Business Context for Echo
[content]

## Prompt 4: Additional Instructions for Playbooks
[content]
```

After presenting, offer: _"Would you like me to refine any of these, or do you have CS materials I can use to make Prompts 3 and 4 more specific?"_

---

## Quality Checklist

Before finalising, verify:

- [ ] Prompt 1 covers: industry, size, selling model, customer type, value prop
- [ ] Prompt 2 names specific competitors and includes differentiation + switching risk context
- [ ] Prompt 3 uses XML tags and contains org-specific content NOT already in Echo's default prompt
- [ ] Prompt 4 reflects actual CS workflows (from docs or flagged as assumed defaults)
- [ ] No prompt repeats logic from the default Echo system/user prompts
- [ ] No marketing fluff or vague generalities

---

## Reference Files

- `references/echo-default-prompts.md` — the default Echo system and user prompts; read this to avoid duplicating existing logic when writing Prompts 3 and 4.
