---
id: 01-arm-templates-bicep-iac
title: "ARM Templates & Bicep — Deploying, Previewing, and Troubleshooting Infrastructure as Code"
sidebar_label: "[01] · ARM Templates & Bicep"
---

# ARM Templates & Bicep — Deploying, Previewing, and Troubleshooting Infrastructure as Code

**Series:** AZ-104 · Compute & Deployment  
**Format:** Concept + Lab  
**Difficulty:** Intermediate  
**Exam alignment:** AZ-104 · AZ-500

---

## The Scenario

Alice, your manager at Contoso Ltd., forwards you an email from the CTO with one line added on top: *"This is now your problem. Fix it."*

The email is short. A junior admin, clicking through the Portal to spin up a storage account for a demo, fat-fingered the resource group dropdown and deleted a production storage account instead. Nobody caught it until a client called asking why their files were gone.

The mandate that comes out of the incident is blunt: **no more portal clicks for provisioning.** Every resource Contoso deploys from now on has to be defined in code, checked into source control, and reproducible on demand — the exact opposite of a junior admin free-clicking through blades under deadline pressure.

Alice's ask is specific: "Take our first storage account and prove this actually works. I don't want a slide deck, I want something Legal can point to and say *this is how we deploy things now.*"

---

## Exam Skills Covered

- Automate deployment of resources by using ARM templates or Bicep files
- Interpret and modify an existing ARM template
- Interpret and modify an existing Bicep file
- Deploy resources by using ARM templates or Bicep files
- Export a deployment as an ARM template
- Convert an ARM template to a Bicep file
- Preview changes to your infrastructure by using what-if

> This is skill area **3.1** under **Deploy and manage Azure compute resources (20–25%)** on the current AZ-104 outline — a different domain than Azure Policy and RBAC, which is why this lives in its own series rather than folded into [Identities & Governance](../az-104-identities-governance/overview).

---

## Sysadmin ↔ Azure Reference

| Traditional / Sysadmin | Azure Equivalent | Notes |
|---|---|---|
| PowerShell/Bash provisioning scripts | ARM templates / Bicep files | Declarative, not imperative — you describe the end state |
| Ansible playbooks | Bicep modules | Reusable, composable units of infrastructure |
| Manual install documentation | The template itself | The code *is* the documentation |
| Shell script positional args (`$1`, `$2`) | ARM/Bicep parameters | `--parameters environment=prod` |
| `echo $RESULT` / script return values | ARM/Bicep outputs | Returned after deployment, consumable by the next step |
| `dry-run` / `terraform plan` | `az deployment group what-if` | Preview before you commit |
| `git diff` against the last known-good state | Exported ARM template | A snapshot of what's actually live, independent of source |

---

## Before You Start

This post assumes you already have:
- Azure CLI installed and `az login` working
- The Bicep CLI available (`az bicep install`, then `az bicep version` to confirm)
- Contributor or Owner on the subscription you're labbing in

**New to Azure administration?** Complete the [Resource Manager domain challenges on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first, then come back here.

**Completed the [Azure Policy & Governance post](../az-104-identities-governance/03-azure-policy-governance)?** Keep `rg-az104-challenge03-prod` around — Part 8 below deploys directly into it on purpose.

> **Cost Callout — What This Whole Lab Actually Costs:** the only billable resource in this entire post is a single empty `Standard_LRS` storage account — everything else (resource groups, deployments, what-if, export, policy, compilation) is free. Run through every part below and delete the resource group at the end (see Cleanup) and the total cost is effectively **$0**, not "cheap" — genuinely negligible fractions of a cent for an account holding no data. Each Part below flags the specific cost mechanics as they come up, and the [Cost Cheat Sheet](#cost-cheat-sheet) at the end consolidates all of them in one table.

---

## The Concept

### What is an ARM template?

An ARM (Azure Resource Manager) template is a JSON file that defines the infrastructure and configuration for your project. It uses **declarative syntax** — you state what you want to exist, not the sequence of commands to create it. You hand Azure a description of the end state; Resource Manager works out what to create, update, or leave alone to get there.

Every ARM template you'll meet on the exam is built from the same five sections: `$schema`, `parameters`, `variables`, `resources`, and `outputs`. `resources` is the only one that's mandatory — everything else exists to make that section reusable instead of hardcoded.

### What is Bicep?

Bicep is a domain-specific language that uses declarative syntax to deploy Azure resources — you write the infrastructure you want in a `.bicep` file, and that file becomes the reusable source of truth for every future deployment of it. Functionally, it's not a competitor to ARM templates — it's an authoring layer *on top of* the same engine: during deployment, the Bicep CLI converts a Bicep file into a Resource Manager JSON template. Nothing is lost or reinterpreted; the JSON that comes out is exactly what would have been hand-written.

What Bicep actually buys you over raw JSON:
- **No bracket-expression syntax.** `resourceGroup().location` instead of `"[resourceGroup().location]"`
- **Automatic dependency ordering.** Reference one resource's property from another and Bicep infers the `dependsOn` for you
- **Symbolic names.** Reference a resource by a name you chose, not by re-typing its full type string
- **The same what-if, validation, and deployment history** as ARM, because underneath it *is* ARM

For AZ-104, the expectation is that you can read and modify both — plenty of production environments still have ARM JSON they haven't migrated yet.

### Two "conversions" and one "snapshot" — don't mix them up

This is the single most common mix-up in this whole domain, and it's an easy trap on the exam:

| Command | What it actually does | Direction |
|---|---|---|
| `az bicep build` | Compiles a Bicep **source file you wrote** into ARM JSON | Bicep → ARM |
| `az bicep decompile` | Converts an **existing ARM JSON template** into Bicep | ARM → Bicep (best-effort) |
| `az group export` | Snapshots the **live resources currently running** in a resource group into ARM JSON | Live resources → ARM |

The first two are lossless round-trips between two representations of the *same source*. The third is fundamentally different — it doesn't know about your Bicep file at all. It reads whatever's actually deployed right now and reverse-engineers a template from it, which is why exported templates come back with hardcoded names, missing parameters, and none of your comments.

### Deployment modes: the one setting that can delete things you didn't touch

Every deployment runs in one of two modes:

- **Incremental** (the default): adds or updates resources defined in the template but **leaves everything else in the resource group untouched**.
- **Complete**: deploys the resources in the template, then **deletes every resource in the resource group that isn't defined in that template.**

If a resource group has a VM and you deploy a storage-account-only Bicep file in Incremental mode, the VM is left alone. Deploy that same file in Complete mode, and the VM gets deleted — not because anything about the VM was wrong, but because the template simply never mentioned it. This is the single most consequential switch in the entire ARM/Bicep vocabulary, and Part 9 below deliberately triggers it.

---

## The Lab

### Part 1 — Resource group and the Bicep skeleton

```bash
az group create --name rg-az104-challenge07 --location eastus
```

Save this as `storage.bicep`:

```bicep
@description('Prefix for the storage account name')
@minLength(3)
@maxLength(11)
param storagePrefix string

param location string = resourceGroup().location

@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storagePrefix // placeholder — Part 2 fixes this
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
  }
}
```

Two parameters, one resource, nothing fancy yet. This is deliberately incomplete — the name is a raw pass-through of `storagePrefix`, which Part 2 is about to break on purpose.

> **Cost Callout — Resource Groups Are Free:** `az group create` never touches your bill. A resource group is a management-plane container, not a billable resource — you can create, leave empty, and delete resource groups all day without any cost implication. Nothing in this lab starts costing anything until Part 3 actually succeeds at deploying the storage account.

---

### Part 2 — The name collision nobody expects

Alice, reviewing the file over your shoulder: *"Just make it work, I don't have time for the details — call it `contoso`."*

Deploy it exactly as she asked:

```bash
az deployment group create \
  --resource-group rg-az104-challenge07 \
  --template-file storage.bicep \
  --parameters storagePrefix=contoso environment=dev \
  --name deploy-storage-v1
```

**This fails.** Storage account names are a shared, global namespace across every Azure customer on the planet — not just your subscription. `contoso` is exactly the kind of short, obvious name someone else already took years ago. You'll see one of two errors depending on what's already taken:

```text
Code=StorageAccountAlreadyTaken
Message=The storage account named contoso is already taken.
```

or, if the string itself is malformed (uppercase letters, hyphens, too short):

```text
Code=AccountNameInvalid
Message=Storage account name must be between 3 and 24 characters
in length and use numbers and lower-case letters only.
```

Storage account names must be globally unique across Azure, between 3–24 characters, lowercase letters and numbers only — and critically, the fix isn't "pick a fancier name," because any fixed string eventually collides. The real fix is to stop hardcoding it:

```bicep
var uniqueStorageName = '${storagePrefix}${uniqueString(resourceGroup().id)}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: uniqueStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
  }
}
```

`uniqueString()` generates a deterministic 13-character hash from whatever you feed it — here, the resource group's ID. Deterministic means redeploying the same template to the same resource group always produces the same name, which is exactly the idempotence Alice actually asked for, even if she didn't phrase it that way.

> **⚠️ Gotcha:** deterministic also means it's *not* an escape hatch if the collision happens again — the same prefix in the same resource group always hashes to the same name. If that specific name is ever taken by someone outside your subscription, you have to change the prefix, not just retry the deployment.

> **Cost Callout — Failed Deployments Are Free, Every Time:** both failed attempts above — `StorageAccountAlreadyTaken` and `AccountNameInvalid` — happen during Resource Manager's validation pass, *before* anything is actually provisioned. You can iterate through naming collisions as many times as it takes without a single billable resource ever being created. The meter only starts on the deployment that actually succeeds.

---

### Part 3 — Tag it and deploy

Add the tag parameter and redeploy:

```bicep
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: uniqueStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  tags: {
    environment: environment
  }
  properties: {
    supportsHttpsTrafficOnly: true
  }
}

output storageEndpoint string = storageAccount.properties.primaryEndpoints.blob
output storageName string = storageAccount.name
```

```bash
az deployment group create \
  --resource-group rg-az104-challenge07 \
  --template-file storage.bicep \
  --parameters storagePrefix=contoso environment=dev \
  --name deploy-storage-v2

az deployment group show \
  --resource-group rg-az104-challenge07 \
  --name deploy-storage-v2 \
  --query "properties.outputs"
```

**Portal check:** Resource group `rg-az104-challenge07` → the storage account → **Overview**. The name is the hashed `contosoXXXXXXXXXXXXX` string, and under **Tags** you'll see `environment: dev`.

> **Cost Callout — The Only Real Line Item in This Lab, and Why Tags Aren't One:** an empty `Standard_LRS` StorageV2 account in the Hot tier runs roughly **$0.018/GB/month** at current East US rates — with zero data uploaded, that's a fraction of a cent, not a meaningful cost. Tags themselves never carry a charge regardless of how many you attach; they're metadata on the resource, not a billable property. What *would* start costing real money is the SKU choice: stepping from `Standard_LRS` up to `Standard_GRS` or `RA-GRS` roughly doubles the per-GB rate, since it adds a second replica in a paired region — worth knowing before you copy this template into a production parameter file and default everything to geo-redundant "to be safe."

---

### Part 4 — Preview before you touch anything real

Before promoting to `prod`, or before any change to a resource group with real resources in it, run what-if:

```bash
az deployment group what-if \
  --resource-group rg-az104-challenge07 \
  --template-file storage.bicep \
  --parameters storagePrefix=contoso environment=prod
```

What-if compares your template against the live resource group and shows which resources it would create, update, or delete, and which properties would change — without deploying anything. In the output here, expect a `Modify` line for the `environment` tag (`dev` → `prod`) and nothing else, since the name and SKU don't change. That's the entire value proposition of the command: you know exactly what's about to happen before it happens.

> **Cost Callout — The Cheapest Cost Control You'll Ever Run:** `az deployment group what-if` provisions nothing — it's a pure evaluation against Resource Manager, so it's as free as the failed deployments in Part 2. It's also your earliest warning for a cost-impacting change: if a teammate's next commit bumps the SKU from `Standard_LRS` to `Standard_GRS`, what-if surfaces that as a `Modify` line on the `sku.name` property *before* it deploys and roughly doubles your storage bill — not after you notice it on next month's invoice.

---

### Part 5 — Export what's actually running

Alice wants proof for the audit trail: *"If someone asks what's actually deployed right now, what do you show them?"*

**Portal walkthrough:**
1. Resource group `rg-az104-challenge07` → left nav, under **Settings** → **Export template**
2. Review the **Template** and **Parameters** tabs — notice the storage account name is hardcoded here, not parameterized
3. Select **Download** to save both files locally

**Same result from the CLI:**

```bash
az group export --name rg-az104-challenge07 --output json > exported-template.json
cat exported-template.json | python3 -m json.tool | head -40
```

> **⚠️ Gotcha:** this is a snapshot, not your source. It has no `uniqueString()` call, no `environment` parameter, and none of your comments — just whatever the resource looks like right now, hardcoded. Treat it as evidence of current state, not something to redeploy as-is.

> **Cost Callout — Reads Don't Bill:** both the Portal's Export template blade and `az group export` are read-only operations against the management plane — they inspect what's deployed, they don't touch it. Export as often as you want for audit purposes; it has exactly the same (zero) cost implication as looking at the Overview blade.

---

### Part 6 — Convert back to ARM

Two separate operations both produce ARM JSON, and it's easy to conflate them:

```bash
# Compile YOUR Bicep source into ARM JSON
az bicep build --file storage.bicep
# produces storage.json — this IS your source, just in JSON form
```

Compare that to what `az bicep decompile` would do in the other direction — useful if you inherit a legacy ARM JSON template with no Bicep source at all:

```bash
az bicep decompile --file exported-template.json
# best-effort — review the output for warnings before trusting it
```

`decompile` is explicitly best-effort; the CLI prints warnings for constructs it couldn't cleanly translate, and those need manual cleanup. `build` has no such caveat — it's a deterministic, lossless compile of code you already control.

**For Jamie, the developer** who wants to redeploy this without re-typing three `--parameters` flags every time, hand off a `.bicepparam` file instead of a JSON one:

```bicep
// storage.bicepparam
using 'storage.bicep'

param storagePrefix = 'contoso'
param environment = 'dev'
```

```bash
az deployment group create \
  --resource-group rg-az104-challenge07 \
  --parameters storage.bicepparam
```

The `using` statement ties the parameter file to a specific Bicep source, and Bicep parameter files are supported in Bicep CLI 0.18.4+, Azure CLI 2.47.0+, and Azure PowerShell 9.7.1+ — worth checking if a deployment mysteriously doesn't recognize the file.

> **Cost Callout — Compilation Happens on Your Machine, Not Azure's:** `az bicep build`, `az bicep decompile`, and authoring a `.bicepparam` file are all local operations — the Bicep CLI compiles on whatever machine or Cloud Shell session you're running it from and never calls a billing-relevant Azure API. Convert between formats as many times as you like; none of it shows up on an invoice.

---

### Part 7 — Reference an existing resource without redeploying it

Suppose you need the storage account's blob endpoint in a *different* Bicep file — one that doesn't create the account, just needs to read a property from it. Use the `existing` keyword:

```bicep
resource existingStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'contosoXXXXXXXXXXXXX' // the actual deployed name from Part 2/3
}

output blobEndpoint string = existingStorage.properties.primaryEndpoints.blob
```

The resource doesn't get redeployed when the `existing` keyword references it — this block is read-only. You're pulling data out, not pushing config in.

> **⚠️ Gotcha:** this is the trap that catches almost everyone the first time. If you add a `tags` or `sku` block inside an `existing` declaration expecting it to update the real resource, it's silently ignored — `existing` never issues a write. And if the name or scope doesn't match anything real, you don't get a helpful warning; you get a hard `NotFound` error and the whole deployment fails. Double-check the name and resource group before assuming the reference is correct.

> **Cost Callout — Deployment Operations Are Never Billed, Only the Resources They Create:** worth knowing generally, not just here — Azure Resource Manager doesn't charge for the act of deploying, full stop. Whether a deployment creates a resource, updates one, or (as in this Part) just reads a property through an `existing` block, the deployment operation itself is free. You only ever pay for the resources a deployment actually provisions.

---

### Part 8 — When governance says no: `RequestDisallowedByPolicy`

Alice, a week later: *"Didn't we already block untagged resources with Policy? Try deploying this into the prod governance group and see what happens."*

She's talking about `rg-az104-challenge03-prod` from the [Azure Policy & Governance post](../az-104-identities-governance/03-azure-policy-governance) — which has a `Deny`-effect policy requiring a `CostCenter` tag with a specific value. Your Bicep file doesn't set that tag at all. Deploy into it:

```bash
az deployment group create \
  --resource-group rg-az104-challenge03-prod \
  --template-file storage.bicep \
  --parameters storagePrefix=contoso environment=prod \
  --name deploy-storage-governed
```

**This is denied.** You get a `RequestDisallowedByPolicy` error identifying the specific policy assignment and definition that blocked the request — and if more than one assignment is violated at once, all of them are listed in the same error, not just the first one found. This is Policy evaluating your Bicep deployment exactly the same way it evaluates a Portal click or a raw `az storage account create` — Policy doesn't know or care which tool made the request.

The fix is the same lesson as Post 03: add the required tag as an actual property, not an afterthought:

```bicep
tags: {
  environment: environment
  CostCenter: 'IT-001'
}
```

Redeploy, and it succeeds — proof that ARM/Bicep deployments are subject to the exact same governance guardrails as everything else in the tenant, which is precisely the point of putting them there in the first place.

If you haven't completed Post 03 and don't have that resource group, you can reproduce the same failure in two commands:

```bash
az policy assignment create \
  --name require-costcenter-tag \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-az104-challenge07 \
  --policy "1e30110a-5ceb-460c-a204-c1c3969c6d62" \
  --params '{"tagName":{"value":"CostCenter"},"tagValue":{"value":"IT-001"}}'
```

then redeploy the untagged version of `storage.bicep` from Part 3 to trigger the same denial.

> **Cost Callout — Governance Itself Is Free; What It Remediates Might Not Be:** creating and assigning the `require-costcenter-tag` policy above costs nothing — Policy assignments, definitions, and initiatives are free to create and free to evaluate, the same way the RBAC assignments in the governance series never show up as a line item. The two effects that *can* have a cost footprint are `DeployIfNotExists` and `Modify`, and only indirectly: the evaluation is still free, but whatever they auto-remediate onto a non-compliant resource — a diagnostic setting, a monitoring extension — may itself carry a cost once it exists.

---

### Part 9 — Complete mode: the flag that deletes what's not in your template

This is the one to run deliberately, in a throwaway resource group, and never accidentally.

```bash
# SAFE FIRST STEP — preview only, nothing is deployed
az deployment group what-if \
  --resource-group rg-az104-challenge07 \
  --template-file storage.bicep \
  --parameters storagePrefix=contoso environment=dev \
  --mode Complete
```

Compare this output to the Incremental what-if from Part 4. In Incremental mode, resources not in the template are simply ignored. In Complete mode's what-if, any resource in `rg-az104-challenge07` that isn't declared in `storage.bicep` shows up marked for **deletion** — even resources you created manually for testing and forgot about.

If you actually run Complete mode (still fine here, since this resource group only contains the one storage account this template manages) and the deployment can't finish removing everything it's supposed to — commonly because a resource lock or a missing delete permission blocks one of the deletions — you get:

```text
Code=DeploymentFailedCleanUp
Message=When you deploy in complete mode, any resources that
aren't in the template are deleted. You get this error when you
don't have adequate permissions to delete all of the resources
not in the template.
```

The mitigation Microsoft documents for that error is blunt: switch back to Incremental mode. In practice, Complete mode is rarely the right default for anything but a fully-templated, single-purpose resource group — which is exactly why it's the default only Complete-mode users opt into explicitly, never the tool's own default.

> **Cost Callout — The Real Risk Isn't the Bill, It's What You Have to Rebuild:** deleting a resource stops its meter immediately — Complete mode doesn't refund anything already billed, but it also doesn't keep charging you afterward. The actual cost risk is indirect and usually bigger than anything measured in dollars-per-GB: if Complete mode deletes a resource nobody remembered to add to the template — a manually-configured VM, a database with real data in it — you're not out money so much as out the configuration time it takes to rebuild it, and in the case of data, you may not be able to rebuild it at all. Run the what-if from earlier in this Part before you ever run Complete mode for real, on any resource group that isn't fully disposable.

---

## Key Takeaways

**A Bicep file and an ARM JSON template are the same deployment, in two different representations.**  
`az bicep build` compiles one into the other losslessly — there's no "better" format at deployment time, only a better authoring experience.

**`az group export` is not the reverse of `az bicep build`.**  
Export snapshots *live resources*, independent of any source file. It has no memory of your parameters, variables, or comments — treat it as a point-in-time record, not a redeployable source of truth.

**A hardcoded resource name is a bug waiting for a big enough Azure customer base.**  
Storage account names are globally unique across every tenant on the platform, not just your subscription. `uniqueString()` isn't a nicety — it's the actual fix.

**What-if checks the live resource group, not just your template syntax.**  
It's the only step in this entire workflow that tells you what's about to change *before* it changes, and it costs nothing to run.

**The `existing` keyword reads, it never writes.**  
Properties you add inside an `existing` block don't propagate to the real resource — and a name or scope typo fails hard with `NotFound` rather than a friendlier warning.

**Azure Policy doesn't care which tool sent the request.**  
A `Deny`-effect policy blocks a Bicep deployment exactly as it blocks a Portal click — `RequestDisallowedByPolicy` reports every violated assignment at once, not just the first.

**Complete mode deletes anything the template doesn't mention — including things you forgot you created.**  
It isn't "aggressive Incremental mode," it's a fundamentally different contract: the template becomes the *entire* desired state of the resource group, not just the additions.

**Almost everything in this workflow is free — the cost lives in the resource, not the tooling.**  
Resource groups, failed deployments, what-if, export, compilation, and Policy evaluation all cost nothing. The only line item in this entire lab was one empty storage account — and the only decision that would have changed that was a SKU or redundancy choice, not anything about ARM or Bicep as tools.

---

## Exam Alignment

**AZ-104:**
- Automate deployment of resources by using ARM templates or Bicep files
- Interpret and modify an existing ARM template or Bicep file
- Deploy resources by using ARM templates or Bicep files, including deployment modes
- Export a deployment as an ARM template and convert an ARM template to Bicep

**AZ-500:**
- Understand how governance controls (Azure Policy) apply during automated, template-based deployments — not just manual resource creation

---

## Practice Questions

### Multiple Choice

**1.** Which command converts an existing ARM JSON template into Bicep?
A. `az bicep build`  B. `az bicep decompile`  C. `az group export`  D. `az deployment group create`
<details><summary>Answer</summary>B — `az bicep decompile`. `build` goes the other direction (Bicep → ARM), and `group export` snapshots live resources, not a source file.</details>

**2.** A Bicep deployment fails with `Code=StorageAccountAlreadyTaken`. What is the most robust fix?
A. Pick a longer name  B. Retry the deployment  C. Use `uniqueString()` to generate the name  D. Switch to Complete mode
<details><summary>Answer</summary>C. Storage account names are globally unique across all of Azure; any fixed string can eventually collide. `uniqueString()` produces a deterministic, collision-resistant name per resource group.</details>

**3.** What does `az group export` capture?
A. Your Bicep source file, compiled to JSON  B. The live resources currently deployed in a resource group  C. A diff between two deployments  D. The parameter file used in the last deployment
<details><summary>Answer</summary>B. Export reverse-engineers a template from what's actually running right now — it has no knowledge of the original Bicep source, parameters, or comments.</details>

**4.** In a Bicep file, what happens if you add a `tags` property inside a resource block declared with the `existing` keyword?
A. It updates the real resource's tags  B. It's silently ignored — `existing` is read-only  C. It throws a compile-time error  D. It creates a duplicate resource
<details><summary>Answer</summary>B. `existing` declarations don't deploy or modify anything — they only expose properties of a resource that's already there for you to read.</details>

**5.** A deployment in Complete mode fails with `DeploymentFailedCleanUp`. What's the most likely cause?
A. A syntax error in the template  B. Insufficient permissions to delete a resource not in the template  C. The resource group doesn't exist  D. A missing required parameter
<details><summary>Answer</summary>B. Complete mode tries to delete every resource not defined in the template; this error specifically means it couldn't finish that cleanup, most often due to a resource lock or missing delete permission.</details>

---

### Drag & Drop (match the command to what it actually does)

**Commands:** `az bicep build` · `az bicep decompile` · `az group export` · `az deployment group what-if`

**Behaviors:**
- Compiles a Bicep source file into ARM JSON
- Converts an existing ARM JSON template into Bicep (best-effort)
- Snapshots live resources into ARM JSON, independent of any source file
- Previews what a deployment would change, without deploying anything

<details><summary>Answer key</summary>`az bicep build` → Compiles a Bicep source file into ARM JSON. `az bicep decompile` → Converts an existing ARM JSON template into Bicep. `az group export` → Snapshots live resources into ARM JSON. `az deployment group what-if` → Previews what a deployment would change.</details>

---

### Short Answer

**1.** Why does redeploying the same Bicep template with `uniqueString(resourceGroup().id)` twice, to the same resource group, produce the same storage account name both times?
<details><summary>Answer</summary>`uniqueString()` is deterministic, not random — it hashes its input (here, the resource group's ID) to the same 13-character output every time. Same input, same resource group, same name — which is what makes the deployment idempotent.</details>

**2.** What's the practical difference between what `az bicep build` and `az bicep decompile` each assume about your starting point?
<details><summary>Answer</summary>`build` assumes you already have Bicep source and want ARM JSON out of it — a lossless, deterministic compile. `decompile` assumes the opposite starting point: you only have ARM JSON (maybe inherited, maybe exported) and want a best-effort Bicep version, which may need manual cleanup.</details>

**3.** A teammate says "I ran `az group export` so now I have my Bicep file's JSON equivalent." What's wrong with that statement?
<details><summary>Answer</summary>Export doesn't know about the Bicep file at all — it inspects live resources and reconstructs a template from their current state. The result has no parameters, no `uniqueString()` call, and hardcoded values, which is different from what `az bicep build` would have produced from the actual source.</details>

---

### Scenario-Based

**1.** You deploy a Bicep template in Complete mode to a resource group that also contains a VM created manually months ago for a one-off test. The VM isn't referenced anywhere in the template. What happens, and why?
<details><summary>Answer</summary>The VM is deleted. Complete mode treats the template as the entire desired state of the resource group — anything not defined in it, regardless of how or when it was created, is removed during deployment.</details>

**2.** A Bicep deployment that worked fine in `rg-az104-challenge07` fails with `RequestDisallowedByPolicy` when deployed into `rg-az104-challenge03-prod`, with no changes to the template itself. What's the most likely explanation?
<details><summary>Answer</summary>The target resource group has an Azure Policy assignment (from the governance series) that the source group doesn't — most likely a `Deny`-effect tag requirement. Policy evaluates the request based on the target scope's assignments, not the template's history of succeeding elsewhere.</details>

---

### Case Study: Contoso's First Production Bicep Rollout

*Contoso Ltd. has finished testing `storage.bicep` in `rg-az104-challenge07` and is ready to promote it to the governed production resource group, `rg-az104-challenge03-prod`, which already has the CostCenter tag policy from the governance series assigned at `Deny`.*

**1.** Before promoting, what single command tells you exactly what would change in the target resource group — without deploying anything?
<details><summary>Answer</summary>`az deployment group what-if`, targeted at `rg-az104-challenge03-prod` — it diffs the template against the live state of that specific resource group and reports creates, updates, and deletes before anything actually happens.</details>

**2.** The team deploys without adding the `CostCenter` tag first. What happens, and is the failure specific to Bicep?
<details><summary>Answer</summary>The deployment is denied with `RequestDisallowedByPolicy`. This isn't Bicep-specific — Policy evaluates the resulting resource properties regardless of which tool (Portal, CLI, ARM, Bicep) generated the request.</details>

**3.** Six months later, an auditor asks for proof of exactly what's deployed in `rg-az104-challenge03-prod` today, independent of what the Bicep source in the repo currently says. What command produces that proof?
<details><summary>Answer</summary>`az group export --name rg-az104-challenge03-prod` — it snapshots the live resources as they actually exist right now, which is a different question from what the checked-in Bicep source describes.</details>

---

## Cost Cheat Sheet

Every cost callout from the lab above, in one place — for a quick reference next time you're pricing out a real deployment.

| Action | Cost | Why |
|---|---|---|
| `az group create` | Free | Management-plane container, not a billable resource |
| A failed deployment (validation error, naming collision) | Free | Nothing is provisioned until validation passes |
| Empty `Standard_LRS` StorageV2 account, Hot tier | ~$0.018/GB/month, negligible with 0 GB stored | The only billable resource in this entire lab |
| Adding, removing, or changing tags | Free | Metadata on the resource, not a billable property |
| `Standard_LRS` → `Standard_GRS`/`RA-GRS` | Roughly 2x the per-GB rate | Adds a second replica in a paired region |
| `az deployment group what-if` | Free | Pure preview against Resource Manager; nothing is provisioned |
| `az group export` / Portal **Export template** | Free | Read-only snapshot of live resource state |
| `az bicep build` / `az bicep decompile` | Free | Local compilation on your machine, no Azure billing API involved |
| Referencing a resource with `existing` | Free | Read-only — no resource is created, updated, or deleted |
| Azure Policy assignments, definitions, initiatives | Free | Evaluation and enforcement carry no charge |
| `DeployIfNotExists` / `Modify` policy effects | Free themselves; the remediated resource might not be | The effect is free — whatever it auto-deploys onto a resource may carry its own cost |
| Complete mode deleting an untemplated resource | Stops billing on deletion, no refund for prior usage | The cost risk is the rebuild effort, not an ongoing charge |

---

## Cleanup

```bash
az group delete --name rg-az104-challenge07 --yes --no-wait

# If you created the standalone policy assignment in Part 8:
az policy assignment delete --name require-costcenter-tag \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-az104-challenge07

rm -f storage.bicep storage.json storage.bicepparam exported-template.json
```

---

## References

- [Microsoft Learn — What is Bicep?](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview)
- [Microsoft Learn — Azure Resource Manager templates overview](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/overview)
- [Microsoft Learn — Resolve errors for storage account names](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-storage-account-name)
- [Microsoft Learn — Reference existing resources in Bicep](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/existing-resource)
- [Microsoft Learn — Troubleshoot common Azure deployment errors](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/common-deployment-errors)
- [Microsoft Learn — RequestDisallowedByPolicy error](https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-policy-requestdisallowedbypolicy)
- [Microsoft Learn — Bicep parameter files](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/parameter-files)
- [azurecertprep — AZ-104 challenge series](https://azurecertprep.github.io/docs/az-104/overview)
