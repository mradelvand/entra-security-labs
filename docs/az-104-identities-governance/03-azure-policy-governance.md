---
id: 03-azure-policy-governance
title: Azure Policy & Governance — Enforcing Tags, Locations, and Standards
sidebar_label: "[03] · Azure Policy & Governance"
---

# Azure Policy & Governance — Enforcing Tags, Locations, and Standards

**Series:** AZ-104 · Identities & Governance  
**Format:** Concept + Lab  
**Difficulty:** Intermediate  
**Exam alignment:** AZ-104 · AZ-500  

---

## The Scenario

The CTO of Contoso Ltd. just got back from a cloud security conference, and now they're worried: *"I heard a company accidentally deployed production workloads in the wrong region and got hit with data sovereignty violations. Can that happen to us?"*

Your job: build guardrails so nobody can deploy resources without proper tags, outside approved regions, or without following company standards.

Azure Policy is the enforcement engine for exactly this. Think of it as **Group Policy for the cloud** — instead of controlling desktop settings, it controls what resources can be created and how they must be configured.

---

## Exam Skills Covered

- Create and manage Azure Policy assignments
- Create and manage policy definitions and initiatives
- Manage resource locks
- Manage resource tags
- Manage resource groups
- Manage subscriptions and management groups
- Configure and manage Azure Advisor recommendations
- Configure and manage budgets and cost alerts

---

## Sysadmin ↔ Azure Reference

If you're coming from an on-prem admin background, most of this already has a mental model you know:

| On-Prem / Sysadmin | Azure Equivalent | Notes |
|---|---|---|
| Group Policy Objects (GPO) | Azure Policy | Enforce rules on resources |
| GPO "Deny" settings | Policy with `Deny` effect | Block non-compliant deployments |
| GPO auditing | Policy with `Audit` effect | Report non-compliance without blocking |
| Mandatory file metadata | Resource tags | Key-value pairs on resources |
| WSUS / SCCM compliance | Azure Advisor | Recommendations for best practices |
| Read-only file system | `ReadOnly` resource lock | Prevent modifications |
| "Cannot delete" protection | `CanNotDelete` resource lock | Prevent accidental deletion |
| OU hierarchy in AD | Management groups | Hierarchical organization of subscriptions |
| Budget tracking spreadsheet | Azure Budgets | Automated cost alerts |

---

## Before You Start

This post assumes you already have:
- A lab tenant with the RBAC post's identities available (see the [previous post in this series](./02-rbac-access-management))
- Owner or Resource Policy Contributor at subscription scope
- Azure CLI familiarity from earlier posts

**New to this series?** Start with the [RBAC & Access Management post](./02-rbac-access-management) first — Policy assumes you already understand scope inheritance.

---

## The Concept

### Policy answers a different question than RBAC

Azure Policy evaluates whether a resource's **properties** comply with a rule, independent of who made the change or what permissions they hold. A user can have full Contributor rights and still be blocked from creating a resource, because Policy governs *state*, not *identity*.

### The three objects: definition, initiative, assignment

| Object | What it is |
|---|---|
| **Policy definition** | A single rule: an `if` condition and a `then` effect |
| **Initiative (policy set)** | A named group of policy definitions bundled toward one goal, managed and assigned together |
| **Assignment** | Applying a definition or initiative to a scope, with parameter values filled in |

### Effects — the full set you'll actually see on the exam

| Effect | Behavior |
|---|---|
| **Deny** | Blocks the resource creation or modification if it doesn't comply. Hard enforcement. |
| **Audit** | Allows the resource but creates a compliance entry. Soft enforcement — you see violations but don't block them. |
| **Append** | Automatically adds fields to the resource during creation — for example, adding a tag that's missing. |
| **AuditIfNotExists** | Audits when a related resource doesn't exist (e.g., no diagnostic setting on a VM). |
| **DeployIfNotExists** | Auto-remediates by deploying a related resource when it's missing. Requires a managed identity. |
| **Modify** | Adds, updates, or removes properties on an existing resource. Also requires a managed identity. |
| **Disabled** | The definition exists but isn't evaluated — useful for staged rollout inside an initiative. |

**Exam tip:** know when to reach for `Deny` vs. `Audit` vs. `DeployIfNotExists`. `Deny` blocks non-compliant requests outright; `Audit` reports without blocking (useful for testing a new rule before enforcing it); `DeployIfNotExists` doesn't block the original request at all — it lets the resource through, then deploys something alongside it to close the gap.

Two built-in policies can look almost identical by name and do completely different things:

- **"Require a tag on resource groups"** evaluates the resource group object itself — does *the resource group* carry the tag?
- **"Require a tag and its value on resources"** evaluates every resource created *inside* that scope — does *each resource* carry the tag and the exact value?

Assign the wrong one and nothing obviously breaks — the assignment succeeds, the portal shows it as active, and it just quietly enforces the wrong thing. This is the exact mistake the lab below walks through.

### Management group hierarchy

Governance at real organizational scale usually sits one level above subscriptions entirely:

- Every subscription belongs to **exactly one** management group.
- Policies and RBAC assigned at a management group are **inherited by all child management groups and subscriptions** beneath it — the same additive inheritance model from the [RBAC post](./02-rbac-access-management), just one rung higher on the ladder.
- Maximum depth is **6 levels**, not counting the root.
- The **root management group** can't be moved or deleted.

---

## The Lab

### Part 1 — Resource Groups & Tags

Create two resource groups for this challenge:

```bash
az group create --name rg-az104-challenge03-prod --location eastus \
  --tags Environment=Production CostCenter=IT-001

az group create --name rg-az104-challenge03-dev --location eastus \
  --tags Environment=Development CostCenter=IT-002
```

Add the remaining tag to both:

```bash
az group update --name rg-az104-challenge03-prod --set tags.Owner="<your-name>"
az group update --name rg-az104-challenge03-dev --set tags.Owner="<your-name>"
```

Each resource group should end up with:
- `Environment` = `Production` or `Development`
- `CostCenter` = `IT-001` or `IT-002`
- `Owner` = your name

Practice bulk tag queries — list every **resource** (not resource group) carrying a specific tag:

```bash
az resource list --tag Environment=Production -o table
```

**Fundamental concept:** `az resource list --tag Key=Value` lists resources — VMs, storage accounts, and so on — that carry that tag. It does **not** list resource groups, even if the resource group itself has that exact tag.

**Tags on a resource group ≠ tags on the resources inside it. They are two completely separate metadata surfaces.** A resource group tagged `CostCenter=IT-001` doesn't propagate that tag to anything created inside it — each resource needs its own tag, set explicitly or enforced by policy.

**Inherited tag confusion:** if you tag `rg-az104-challenge03-prod` with `Environment=Production` and then create a VM inside it, the VM does **not** show that tag. This is expected — tags are not inherited from resource group to resource by default. If you want that propagation to happen automatically, assign the built-in **"Inherit a tag from the resource group if missing"** policy (effect: `Append`). It doesn't block anything; it just copies the tag onto new or updated resources that don't already have it.

---

### Part 2 — Enforce a Required Tag on Resources (and the mistake that teaches the real lesson)

**Goal:** force every resource created inside `rg-az104-challenge03-prod` to carry a `CostCenter` tag, or be blocked.

**How to assign it (portal):**
1. **Policy** → **Assignments** → **Assign policy**
2. **Basics** tab:
   - **Scope:** `rg-az104-challenge03-prod`
   - **Policy definition:** search for the policy — see the warning below before picking a result
3. **Parameters** tab:
   - Tag name: `CostCenter`
   - Tag value: `IT-001`
   - Effect: `Deny`
4. **Non-compliance message:** `All resources in this resource group have to have a tag called CostCenter.`

#### The mistake

The Azure Policy search box returns two built-in definitions with almost identical names:

- **Require a tag on resource groups**
- **Require a tag and its value on resources**

It's easy to click the first result without reading it carefully — and that's exactly what happened here. The compliance dashboard after assignment showed:

| Name | Scope | Compliance state | Resource compliance |
|---|---|---|---|
| Require a tag on resource groups | `rg-az104-challenge03-prod` | ✅ Compliant | 100% (1 out of 1) |
| Require a tag and its value on resources | `rg-az104-challenge03-prod` | ⛔ Not started | 100% (0 out of 0) |

The first row looked healthy — 100% compliant — which is exactly why the mistake went unnoticed at first. But "Require a tag on resource groups" only evaluates the resource group object itself. Since the resource group was already tagged in Part 1, it reported compliant immediately. It has no opinion whatsoever about what gets created *inside* that resource group.

**Test it:**

```bash
# Expected: FAIL, because no CostCenter tag is set
az storage account create \
  --name stpolicytest$RANDOM \
  --resource-group rg-az104-challenge03-prod \
  --location eastus \
  --sku Standard_LRS
```

**Actual result: the storage account was created successfully — no denial, no error.**

That's the tell. If "Require a tag and its value on resources" had actually been assigned with a `Deny` effect, this command would have failed immediately — `Deny` evaluates at request time, it doesn't wait for a compliance scan. The fact that it succeeded means the *resource-level* enforcement was never actually in place; only the resource-group-level check was.

#### The fix

Go back to **Assign policy**, and this time don't just search a keyword — search the **exact policy name** and open the definition to confirm its description before assigning:

> **Require a tag and its value on resources** — *"Enforces a required tag and its value. Does not apply to resource groups."*

That last sentence in the description is the whole lesson. Assign it properly:
- Tag name: `CostCenter`
- Tag value: `IT-001`
- Effect: `Deny`
- Version: `1.0.*`
- Non-compliance message: `All resources in this resource group have to have a tag called CostCenter.`

**Re-test:**

```bash
# Expected: FAIL
az storage account create \
  --name stpolicytest$RANDOM \
  --resource-group rg-az104-challenge03-prod \
  --location eastus \
  --sku Standard_LRS
```

```bash
# Expected: SUCCEED
az storage account create \
  --name stpolicytest$RANDOM \
  --resource-group rg-az104-challenge03-prod \
  --location eastus \
  --sku Standard_LRS \
  --tags CostCenter=IT-001
```

#### One tag value per assignment — what to do about dev vs. prod

The tag *value* field is a required parameter on this built-in definition — it can't be left blank, and one assignment enforces exactly one value. That raises the obvious question: does `rg-az104-challenge03-dev` (which needs `CostCenter=IT-002`) need a brand-new **policy definition**?

**No.** You reuse the same built-in **definition** and create a second **assignment** against it, scoped to the dev resource group, with the `Tag value` parameter set to `IT-002` instead of `IT-001`. One definition, two assignments — this is exactly the reusability the assignment/definition split is designed for (see the [RBAC post](./02-rbac-access-management) for the same "one object, multiple scopes" pattern applied to roles instead of policies).

---

### Part 3 — Allowed Locations

**Assign** the built-in policy **Allowed locations** to `rg-az104-challenge03-prod`:
- Allowed locations: `East US`, `West US 2`

**Test** with a disallowed location:

```bash
az storage account create \
  --name teststoragewesteurope \
  --resource-group rg-az104-challenge03-prod \
  --location westeurope \
  --sku Standard_LRS
```

**Result:**

```
(RequestDisallowedByPolicy) Resource 'teststoragewesteurope' was disallowed by policy.
Reasons: 'All resources in this resource group have to have a tag called CostCenter.',
'Allowed locations: East US, West US 2'.
See error details for policy resource IDs.
Code: RequestDisallowedByPolicy
```

**Read the `Reasons` array carefully — it's not just reporting one violation.** This request was missing the required tag *and* targeting a disallowed region, and both policy assignments fired independently. `RequestDisallowedByPolicy` aggregates **every** violated assignment scoped to that request into a single error, not just the first one it hits. On the exam and in real troubleshooting, don't stop reading after the first reason listed — the second (or third) one is often the one that actually matters for the fix.

---

### Part 4 — Policy Initiative (Contoso-Governance)

Create a policy initiative (policy set) called `Contoso-Governance` that bundles:
- Require `CostCenter` tag on resources
- Require `Environment` tag on resources
- Allowed locations (East US, West US 2)

**Create the initiative:**
1. **Policy** → **Definitions** → **+ Policy initiative**
2. **Name:** `Contoso-Governance`
3. **Description:** a short summary of what the initiative enforces (optional but recommended for anyone else who has to maintain it)
4. **Subscription:** select your subscription (this is the initiative's definition location — where it's allowed to later be assigned)
5. **Category:** choose an existing category or create a new one (e.g., `Contoso Custom`)
6. Add the three policy definitions to the initiative and set their parameters (`CostCenter`/`Environment` tag names, `East US`/`West US 2` allowed locations)

**Clean up the individual assignments first.** Before assigning the initiative, remove the three separate assignments created in Parts 2 and 3 (the two tag assignments and the Allowed locations assignment). Leaving both in place means the same rule gets enforced twice by two unrelated objects — harmless functionally, since both would agree on the same Deny outcome, but it defeats the entire point of consolidating into one thing to manage, and it leaves a confusing trail of duplicate assignments in the compliance dashboard.

**Assign the initiative** to `rg-az104-challenge03-prod`, filling in the same parameter values used in Parts 2–3 (`CostCenter`, `Environment`, and the two allowed regions).

**Test it** — try creating a resource with a *valid* location but *no* tags at all:

```bash
az storage account create \
  --name stpolicyinittest$RANDOM \
  --resource-group rg-az104-challenge03-prod \
  --location eastus \
  --sku Standard_LRS
```

**Result: denied**, even though the location was correct. This confirms the initiative is enforcing all three underlying rules as a single unit — the location check passed, but the missing `CostCenter` and `Environment` tags still triggered the Deny. One assignment, three rules, and the compliance dashboard now shows one initiative to check instead of three unrelated assignments.

---

### Part 5 — Resource Locks

**Concept (fundamental):** resource locks are Azure management tools that **prevent accidental deletion or modification** of critical resources. They apply a restriction at the resource, resource group, or subscription level — and unlike RBAC, they apply to **everyone**, including Owners. An Owner can't bypass a lock; they can only remove it first (which itself requires `Microsoft.Authorization/locks/*` permission — granted by default only to **Owner** and **User Access Administrator**, the same two roles from the [RBAC post](./02-rbac-access-management) that can assign roles to others).

| Lock type | Allows | Blocks |
|---|---|---|
| **CanNotDelete** | Read, modify | Delete |
| **ReadOnly** | Read only | Modify, delete |

**Locks inherit downward.** A lock applied at a resource group (or subscription) is automatically inherited by every resource inside it — including resources created *after* the lock was applied. If more than one lock applies to the same resource through inheritance, the most restrictive one wins.

#### Step 1 — Create a CanNotDelete lock on the resource group

**Portal:** Resource groups → `rg-az104-challenge03-prod` → **Settings** → **Locks** → **+ Add** → Lock name `PreventDeletion`, Lock type `CanNotDelete`, Notes `Production resources - do not delete` → **OK**.

**CLI:**

```bash
az lock create --name "PreventDeletion" \
  --lock-type CanNotDelete \
  --resource-group rg-az104-challenge03-prod \
  --notes "Production resources - do not delete"
```

#### Step 2 — Try to delete the resource group (expected: fail)

**Portal:** open the resource group → **Delete resource group** → confirm the name → **Delete**. Result: *"Failed to delete resource group 'rg-az104-challenge03-prod'. Error: The resource group is locked and cannot be deleted."*

**CLI:**

```bash
az group delete --name rg-az104-challenge03-prod --yes --no-wait
```

Fails with `(ResourceGroupLocked) The resource group is locked and cannot be deleted.`

#### Step 3 — Create a ReadOnly lock on a specific resource

**Portal:** open a specific resource inside the group (e.g., a storage account) → **Settings** → **Locks** → **+ Add** → Lock name `ReadOnlyLock`, Lock type `ReadOnly`, Notes `Critical resource - read only` → **OK**.

**CLI:**

```bash
STORAGE_ID=$(az storage account show \
  --name mystorageaccount \
  --resource-group rg-az104-challenge03-prod \
  --query id -o tsv)

az lock create --name "ReadOnlyLock" \
  --lock-type ReadOnly \
  --resource $STORAGE_ID \
  --notes "Critical resource - read only"
```

**Result:** any attempt to modify or delete that specific resource fails until the lock is removed — and because it's inherited from the resource group's `CanNotDelete` lock as well, this resource is now protected by *two* overlapping locks. The `ReadOnly` lock set directly on it is more restrictive, so it's the one that governs.

---

## Key Takeaways

**Policy governs state, RBAC governs actions.**  
A user can have full Contributor rights and still be denied by Policy — the two systems don't override each other, they answer different questions.

**Read the exact policy definition name and its description before assigning — don't trust the search result you clicked first.**  
"Require a tag on resource groups" and "Require a tag and its value on resources" sound almost identical and target completely different objects. The assignment for the wrong one still succeeds and still shows up in the portal — it just silently enforces nothing useful.

**A "compliant" dashboard doesn't mean the policy you intended is doing anything.**  
The wrong policy reported 100% compliant immediately, because it was evaluating an object (the resource group) that already happened to satisfy it — not because the actual goal (tagged resources) was being enforced.

**`Deny` evaluates at request time — it doesn't wait for a compliance scan.**  
If a `Deny`-effect assignment is genuinely active, a violating `create` command fails immediately. If the command succeeds instead, the assignment isn't doing what you think it's doing.

**Tags on a resource group don't cascade to resources created inside it.**  
They're two separate metadata surfaces, checked by two separate built-in policies.

**One assignment enforces one tag value — reuse the definition, add another assignment for the next value.**  
You don't need a new policy definition for `CostCenter=IT-002`; you need a second assignment of the same definition, scoped to the dev resource group, with a different parameter value.

**`RequestDisallowedByPolicy` reports every violated assignment in one error, not just the first.**  
A single blocked request can list multiple independent reasons — missing tag and disallowed region, in this case — and all of them need addressing.

**An initiative consolidates enforcement, but you have to remove the old individual assignments yourself.**  
Nothing does that automatically when you create the initiative — leaving both in place just means the same rule is checked twice by two different objects.

**Resource locks apply outside RBAC entirely.**  
Even Owner can't delete a locked resource without removing the lock first — and removing a lock itself requires `Microsoft.Authorization/locks/*`, which only Owner and User Access Administrator get by default.

**Locks inherit downward, the same way RBAC and Policy assignments do.**  
A `CanNotDelete` lock on a resource group protects every resource inside it automatically, including ones created after the lock existed. The most restrictive lock in the chain always wins.

**Tags never inherit from resource group to resource by default.**  
If you want that behavior, it has to be explicitly enforced with the built-in "Inherit a tag from the resource group if missing" policy (`Append` effect) — it isn't automatic.

---

## Exam Alignment

**AZ-104:**
- Create and manage Azure Policy assignments, definitions, and initiatives
- Manage resource groups, tags, and resource locks
- Manage subscriptions and management group hierarchy
- Configure and manage Azure Advisor recommendations and budgets/cost alerts

**AZ-500:**
- Implement and manage governance via Azure Policy, including Deny, Audit, Append, AuditIfNotExists, DeployIfNotExists, and Modify effects, and initiative-based compliance management

---

## Practice Questions

### Multiple Choice

**1.** Which effect blocks a non-compliant request at creation time and requires no managed identity?
A. `DeployIfNotExists`  B. `Modify`  C. `Deny`  D. `Audit`
<details><summary>Answer</summary>C — Deny. Audit also needs no identity, but it doesn't block anything; DeployIfNotExists and Modify both require a managed identity.</details>

**2.** Which two effects require a managed identity to remediate non-compliant resources? (Choose 2.)
A. Audit  B. Modify  C. Deny  D. DeployIfNotExists
<details><summary>Answer</summary>B and D — Modify and DeployIfNotExists both alter resources on Azure's behalf, which needs an identity with an actual role grant at the target scope.</details>

**3.** What is the maximum depth of the management group hierarchy, not counting the root management group?
A. 3  B. 5  C. 6  D. Unlimited
<details><summary>Answer</summary>C — 6 levels beneath the root.</details>

**4.** Which built-in roles can create or delete a management lock by default?
A. Contributor only  B. Reader and Contributor  C. Owner and User Access Administrator  D. Any role with write access to the resource
<details><summary>Answer</summary>C. Managing locks requires `Microsoft.Authorization/locks/*`, which only Owner and User Access Administrator hold by default — the same pair that can grant role assignments, and for the same reason: Contributor's NotActions explicitly exclude the Microsoft.Authorization namespace.</details>

**5.** A `ReadOnly` lock is applied to a storage account. Which of the following is blocked as a result?
A. Reading blob data  B. Listing the storage account access keys  C. Querying table data  D. Reading account metadata
<details><summary>Answer</summary>B. Listing access keys is a POST operation under the hood, and a ReadOnly lock blocks POST requests to the management plane — even though it looks like a harmless "read" action.</details>

---

### Drag & Drop (match the effect to its behavior)

Match each effect on the left to its behavior on the right.

**Effects:** Deny · Audit · Append · AuditIfNotExists · DeployIfNotExists · Disabled · Modify

**Behaviors:**
- Blocks the request outright
- Allows the request, logs a compliance warning
- Adds fields to the request before it's processed
- Audits whether a related resource exists
- Deploys a related resource if it's missing (needs identity)
- Skips evaluation of this definition entirely
- Adds, updates, or removes properties on an existing resource (needs identity)

<details><summary>Answer key</summary>Deny → Blocks the request outright. Audit → Allows the request, logs a compliance warning. Append → Adds fields to the request before it's processed. AuditIfNotExists → Audits whether a related resource exists. DeployIfNotExists → Deploys a related resource if it's missing (needs identity). Disabled → Skips evaluation of this definition entirely. Modify → Adds, updates, or removes properties on an existing resource (needs identity).</details>

**Second drag-and-drop — order the scope hierarchy from broadest to narrowest:**

Resource · Management Group · Resource Group · Subscription

<details><summary>Answer key</summary>Management Group → Subscription → Resource Group → Resource</details>

---

### Short Answer

**1.** You tag `rg-az104-challenge03-prod` with `Environment=Production`. A VM created inside it doesn't show that tag. Is this expected, and how would you make it happen automatically going forward?
<details><summary>Answer</summary>Yes, expected — tags aren't inherited from resource group to resource by default. Assign the built-in "Inherit a tag from the resource group if missing" policy (effect: Append) to copy it automatically onto new or updated resources that don't already have it.</details>

**2.** Why did compliance reporting change after consolidating three separate policy assignments into one Contoso-Governance initiative assignment?
<details><summary>Answer</summary>All three underlying policy definitions now roll up under a single initiative assignment — one object to check in the compliance dashboard instead of three separate, unrelated assignments.</details>

**3.** In one sentence, what's the practical difference between what a `CanNotDelete` lock and a `ReadOnly` lock each allow?
<details><summary>Answer</summary>CanNotDelete allows reads and modifications and blocks only deletion; ReadOnly allows reads only, blocking both modification and deletion.</details>

---

### Scenario-Based

**1.** A teammate with the Contributor role on `rg-az104-challenge03-prod` tries to delete a VM inside that resource group after you've applied a `CanNotDelete` lock at the resource-group scope. What happens, and why?
<details><summary>Answer</summary>The deletion fails. Locks inherit downward from the scope they're applied at, so every resource inside the resource group — including ones added after the lock existed — is covered by the same CanNotDelete lock, regardless of the teammate's RBAC role. Locks apply outside RBAC entirely.</details>

**2.** The Contoso-Governance initiative is assigned to `rg-az104-challenge03-prod`. A teammate creates a storage account in `eastus` (an allowed location) with no tags at all. What happens?
<details><summary>Answer</summary>Denied. The initiative bundles the CostCenter and Environment tag requirements together with the allowed-locations rule. The location check passes, but the request still fails the two tag checks — satisfying one of three bundled rules isn't enough.</details>

---

### Case Study: Contoso's Governance Rollout

*Contoso Ltd. is rolling out governance across two resource groups: `rg-az104-challenge03-prod` (East US, CostCenter=IT-001) and `rg-az104-challenge03-dev` (East US, CostCenter=IT-002). The Contoso-Governance initiative — bundling required tags and allowed locations — is assigned only to the prod resource group. A CanNotDelete lock protects the prod resource group, and a ReadOnly lock protects one specific storage account inside it.*

**1.** A developer tries to create an untagged VM in `rg-az104-challenge03-dev` in `westeurope`. What happens, and why?
<details><summary>Answer</summary>It succeeds. The Contoso-Governance initiative was only assigned to the prod resource group — nothing scoped to dev is enforcing tags or location restrictions there, regardless of what's configured on prod.</details>

**2.** The same developer then tries the identical command against `rg-az104-challenge03-prod`. What happens?
<details><summary>Answer</summary>It's denied, for two independent reasons reported in the same RequestDisallowedByPolicy error: the resource is untagged (violating both the CostCenter and Environment requirements in the initiative) and westeurope isn't in the allowed locations list.</details>

**3.** An administrator with the Owner role wants to delete the ReadOnly-locked storage account inside `rg-az104-challenge03-prod`. What's the correct sequence of steps?
<details><summary>Answer</summary>Remove the ReadOnly lock first (Owner has the `Microsoft.Authorization/locks/*` permission needed to do this), then delete the storage account. Owner does not bypass the lock — it only has permission to remove it.</details>

**4.** Six months later, Contoso wants every subscription across three departments to inherit the same tag and location rules automatically, without reassigning the initiative to each subscription individually. What's the correct governance structure to use?
<details><summary>Answer</summary>A management group above the three departments' subscriptions, with the Contoso-Governance initiative assigned once at the management group level. Policy assignments at a management group are inherited by every child management group and subscription beneath it, the same way RBAC role assignments are.</details>

---

## References

- [Microsoft Learn — Overview of Azure Policy](https://learn.microsoft.com/en-us/azure/governance/policy/overview)
- [Microsoft Learn — Azure Policy definitions effect basics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics)
- [Microsoft Learn — Details of the initiative definition structure](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/initiative-definition-structure)
- [Microsoft Learn — Tutorial: Build policies to enforce compliance](https://learn.microsoft.com/en-us/azure/governance/policy/tutorials/create-and-manage)
- [Microsoft Learn — Manage tag governance](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-policies)
- [Microsoft Learn — Lock your Azure resources to protect your infrastructure](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources)
- [Microsoft Learn — Organize your resources with management groups](https://learn.microsoft.com/en-us/azure/governance/management-groups/overview)
- [azurecertprep — AZ-104 challenge series](https://azurecertprep.github.io/docs/az-104/overview)
