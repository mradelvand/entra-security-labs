---
id: 02-midnight-migration-ctf
title: Project Midnight Migration — Zero-Trust Storage, RBAC, and Disaster Recovery
sidebar_label: "[02] · A scenario-driven training module for enterprise Azure Storage architecture, security, and cost optimization using the Azure CLI"
---

# Project Midnight Migration — Zero-Trust Storage, RBAC, and Disaster Recovery

**Series:** AZ-104 · Storage & Data Protection  
**Format:** Scenario-Based CTF Drill  
**Difficulty:** Intermediate to Advanced  
**Exam alignment:** AZ-104 · AZ-500

---

# 🚩 The Scenario: Project "Midnight Migration"

You are a newly hired Azure Cloud Administrator for Globex Corporation.

Globex has just acquired a smaller startup, and you have been tasked with setting up a secure, cost-optimized cloud storage environment to migrate the startup's data. However, you must navigate strict corporate security policies and an upcoming audit. There are 5 Flags you must capture by completing the administrative tasks correctly using the Azure CLI.

> ** Editor's note — Extended Edition:** The original 5-flag CTF is preserved below exactly as written. A few things have been added:
> 1. **Bonus Flags 3B and 4B**, inserted right after Phases 3 and 4, which answer two open questions raised while building this ("what do I actually give developers?" and "what about an entire deleted folder, not just one file or the whole container?").
> 2. **Phase 6 and Phase 7**, two brand-new phases covering **blob snapshots & versioning** and **Blob Storage vs. Azure Files**, each capturing their own flag.
> 3. ** Cost Callouts** throughout every phase — soft delete, tiering, versioning, RBAC, guest identities, and Azure Files billing all have real cost implications that aren't obvious from the CLI alone, so each one gets flagged where it's introduced, plus a consolidated cheat sheet at the end.
> 4. A ** Cleanup** section at the very end, so the challenge doesn't keep costing money after you're done with it.
>
> That brings the total to **7 core flags + 2 bonus flags**.

---

##  Phase 1: The Foundation

Your manager, Alice, sends you an urgent message:

> "We need a storage account spun up immediately to stage the migration. Keep it cheap, make sure it supports all features, and ensure the data stays on the East Coast for compliance."

**Your Objective:** Create the Resource Group and the Storage Account.

```bash
# Set your variables
RG="rg-globex-midnight"
LOCATION="eastus"
STORAGE_NAME="stglobex$RANDOM"

# 1. Create the Resource Group
az group create --name $RG --location $LOCATION

# 2. Create the Storage Account
az storage account create \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot
```

**Flag 1 Captured: Infrastructure Provisioned!**
(You chose `Standard_LRS` to keep it cheap, and `StorageV2` to ensure it supports modern features.)

> **Cost Callout — Redundancy & Access Tier:** `Standard_LRS` (three copies, one region) is the cheapest redundancy option available. Stepping up to `Standard_GRS`/`RA-GRS` roughly doubles the per-GB storage cost for the same data, since it also replicates everything to a paired region; `ZRS`/`GZRS` carry their own premium for zone-level resilience. The `Hot` access tier has the highest per-GB storage price of the online tiers but charges nothing extra to read or write — the right default for a staging account you're actively migrating data into. Don't be tempted to start in Cool "to save money" on data you're still actively touching; Phase 5 shows exactly why that backfires.

---

## Phase 2: The Security Audit

Before you can upload any data, the Globex Security Team runs an automated scan on your new storage account.

> **Red Alert!** The security team flags your account. "Your storage account allows legacy TLS 1.0 connections and is vulnerable to 'Man-in-the-Middle' attacks. Fix this immediately!"

**Your Objective:** Update the storage account to enforce modern security standards.

```bash
# Enforce TLS 1.2
az storage account update \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --min-tls-version TLS1_2

# Verify the fix (Using the JMESPath query trick!)
az storage account show \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --query "{Name:name, TLS:minimumTlsVersion}" -o table
```

**Flag 2 Captured: Compliance Achieved!**

---

## Phase 3: The Data Drop (Zero-Trust & User Delegation SAS)

**Scenario:** The Globex Security Team intercepted your previous deployment script. "No connection strings or account keys are allowed in this environment!" they declare. You must implement a Zero-Trust approach to grant the developers temporary access without ever touching the storage account's master keys.

**Objective:** Grant yourself Azure RBAC permissions to the storage account, create the container using Entra ID, grant the developer their own container-scoped role assignment (the preferred Zero-Trust pattern — access tied to *them*, not to a secret string), generate an Entra-backed "User Delegation SAS" as a fallback for when a named grant isn't the right tool, and finally, completely disable master key access to secure the account.

```bash
# 1. Get your own Entra ID Object ID (so you can assign yourself permissions)
MY_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)

# 2. Get the unique Resource ID of your new Storage Account
STORAGE_ID=$(az storage account show \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --query id -o tsv)

# 3. Assign yourself the 'Storage Blob Data Contributor' RBAC role.
# (This allows you to write data and generate User Delegation keys)
az role assignment create \
  --assignee $MY_OBJECT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID

# Note: Azure RBAC propagation can take a few minutes in the real world! Wait ~60 seconds.

# 3b. VERIFY the Role Assignment
az role assignment list \
  --assignee $MY_OBJECT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID \
  --query "[].{Role:roleDefinitionName, Scope:scope}" -o table

# 4. Create the container using Entra ID authentication (Notice we do not use connection strings!)
az storage container create \
  --name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login

```

### Provisioning Developer Access — Choose an Identity Type

Before you can assign anyone a role, "the developer" needs an actual identity in (or federated into) the Globex tenant — you can't scope RBAC to a person who doesn't exist yet in Entra ID. Since Globex just *acquired* this startup, Jamie is very likely still a startup employee, not a Globex hire yet — which makes this a textbook case for **Microsoft Entra B2B guest access** rather than minting Jamie a brand-new Globex account. Two options; pick the one that fits:

**Option A — Internal member user** (use this only if Jamie is being formally onboarded with Globex-issued credentials):

```bash
az ad user create \
  --display-name "Jamie Chen (Startup Dev)" \
  --user-principal-name "jamie.chen@globexcorp.onmicrosoft.com" \
  --password "TempP@ss2026!" \
  --force-change-password-next-sign-in true

DEV_OBJECT_ID=$(az ad user show --id "jamie.chen@globexcorp.onmicrosoft.com" --query id -o tsv)
```

You're now responsible for that temporary password — deliver it to Jamie out-of-band (never in the same message as the username) so they can sign in and change it immediately.

**Option B — B2B guest invite (the better fit for this scenario):** Jamie works for the acquired startup and keeps their own company email. Inviting them as a guest means Globex never issues or stores a password for someone who may not be a Globex employee past the migration — they authenticate with their own organization's credentials the entire time.

```bash
DEV_OBJECT_ID=$(az rest --method post \
  --uri "https://graph.microsoft.com/v1.0/invitations" \
  --body '{
    "invitedUserEmailAddress": "jamie@startupdomain.com",
    "invitedUserDisplayName": "Jamie Chen (Startup Dev)",
    "inviteRedirectUrl": "https://myapps.microsoft.com",
    "sendInvitationMessage": true
  }' \
  --query "invitedUser.id" -o tsv)
```

This creates the guest user object in the Globex tenant immediately — `$DEV_OBJECT_ID` is usable right away — and emails Jamie a redemption link in the background. A `403` here means your own account needs the `Guest Inviter`, `Directory Writers`, or `User Administrator` role, or the tenant's External Identities settings restrict who can send invites.

Either option leaves you with a `$DEV_OBJECT_ID` — everything from here is identical no matter which one you picked.

**Grant the container-scoped role (same role, same scope, as before):**

```bash
CONTAINER_ID="${STORAGE_ID}/blobServices/default/containers/app-logs"

az role assignment create \
  --assignee-object-id $DEV_OBJECT_ID \
  --assignee-principal-type User \
  --role "Storage Blob Data Contributor" \
  --scope $CONTAINER_ID

# VERIFY — this also gives you a per-person audit trail for the
# upcoming audit, instead of an anonymous "someone with the token" entry
az role assignment list \
  --assignee $DEV_OBJECT_ID \
  --scope $CONTAINER_ID \
  --query "[].{Role:roleDefinitionName, Scope:scope}" -o table
```

**From the developer's side:**

**Step 1 — Redeem the invite** (Option B only): Jamie opens the invitation email and selects *Accept invitation*. As of the current guest sign-in flow, this redirects them to sign in on **their own company's** login page first, not a Globex one — that's expected B2B behavior, not a phishing red flag.

**Step 2 — Sign in to the Globex tenant.** Jamie has no subscription in Globex's tenant, so a plain `az login` will report "no subscriptions found." They need the tenant-level flag:

```bash
# Run on Jamie's own machine, as Jamie
az login --tenant "<globex-tenant-id-or-domain>" --allow-no-subscriptions
```

(You hand Jamie the tenant ID/domain as part of onboarding — get it yourself with `az account show --query tenantId -o tsv`.)

**Step 3 — Confirm they landed as themselves, not you:**

```bash
az ad signed-in-user show --query "{Name:displayName, UPN:userPrincipalName}" -o table
```

**Step 4 — Work directly against the container** — the same command from Bonus Flag 3B, now genuinely running as Jamie:

```bash
az storage blob upload \
  --container-name app-logs \
  --file dev-test.txt \
  --name dev-test.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login
```

No SAS token, no key, nothing handed off at all — just Jamie's own identity doing exactly what it was scoped to do.

```bash

# 6. FALLBACK: generate a User Delegation SAS for cases where a named role
#    assignment isn't the right tool (see Bonus Flag 3B for when that is).
# Uses `date` to set expiry to 1 day from now in UTC (`-u` flag).
END_DATE=$(date -u -d "+1 day" '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -v+1d '+%Y-%m-%dT%H:%MZ')
az storage container generate-sas \
  --name app-logs \
  --account-name $STORAGE_NAME \
  --permissions rwl \
  --expiry $END_DATE \
  --auth-mode login \
  --as-user \
  --https-only -o tsv

# 7. The Ultimate Security Flex: Disable Storage Account Keys entirely
az storage account update \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --allow-shared-key-access false
```

> **Cost Callout — Identity Is (Mostly) Free:** Azure RBAC role assignments cost nothing — create as many named, narrowly-scoped assignments as your Zero-Trust design needs and it won't show up as a line item. Generating a User Delegation SAS is free too. The one identity-related cost worth knowing about: Microsoft Entra External ID bills B2B guest users on a Monthly Active Users (MAU) model — but the first 50,000 guest MAU *per month* are free, and that count resets every month. One contractor like Jamie doesn't come close. This only becomes a real budget line if Globex starts inviting thousands of external partners at scale.

**Flag 3 Captured: Zero-Trust Delegation Mastered!**

### Bonus Flag 3B: The Handoff — and Why "Handoff" Was the Wrong Instinct

> *"But here in this part I don't understand what I should give to developers and how they can use it to do their objective?"*

The honest answer: for a named developer who already has an Entra ID identity in (or federated into) your tenant, **the best thing to hand them is nothing at all** — no string, no file, no secret to protect. Phase 3 already gave Jamie their own role assignment, scoped to just the `app-logs` container, via a B2B guest invite — since Jamie's still a startup employee, not a Globex hire. They sign in as themselves and just work:

```bash
# This is Jamie's own machine, signed in as Jamie via `az login` —
# no token, string, or file ever changed hands
echo "hello from the dev team" > dev-test.txt

az storage blob upload \
  --container-name app-logs \
  --file dev-test.txt \
  --name dev-test.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login
```

That's the entire handoff. Nothing to paste into Slack, nothing that quietly expires mid-task, and nothing a screenshot or a leaked chat log can turn into standing access — because there's no secret in the loop to leak. Revoking Jamie's access later is one command: `az role assignment delete --assignee $DEV_OBJECT_ID --scope $CONTAINER_ID`.

**So when does the SAS from step 6 actually earn its place?** A shared token is the right call when there's *no* persistent Entra identity to attach a role assignment to — a truly anonymous recipient, an external partner without a guest account yet, a one-off presigned download link, or an automated process that isn't a person and shouldn't get a standing role. It is **not** the right tool for "give a known employee ongoing access to a container" — which is what the earlier version of this section recommended, and which is worth correcting explicitly rather than quietly.

**Named RBAC role assignment vs. User Delegation SAS — the real comparison:**

| | Named RBAC Role Assignment | User Delegation SAS |
|---|---|---|
| Tied to | A specific Entra ID identity (user, group, or service principal) | Nothing — anyone holding the token string has access |
| Revocation | Instant: `az role assignment delete` | Only by revoking the delegation key that signed it (which invalidates *every* SAS signed with that key, not just this one) or waiting out the natural expiry |
| Audit trail | Storage + Entra sign-in logs show exactly which person did what | Logs show "a request signed by a delegation key" — not which token holder actually made it |
| Leak risk | Nothing to leak — access rides on the developer's own sign-in, protected by their own MFA/Conditional Access | If the token string leaks (Slack, email, a public repo), it's usable by anyone until it expires |
| Best for | Named people or service principals with an ongoing need | Anonymous or one-off recipients, external partners without guest accounts, presigned links |
| Setup cost | One role assignment per person (or assign an Entra group once) | One CLI call, no identity to provision |

If you want to go a level deeper than a container-scoped role assignment (worth knowing for AZ-500/SC-500), Azure Storage also supports **Azure ABAC conditions** on a role assignment — for example, restricting a developer to only blobs carrying a specific index tag, or a specific path prefix, via `--condition` on `az role assignment create`. Container scoping (what step 5 does) is the AZ-104-level answer; conditions are the next layer down for narrower control.

**Bonus Flag 3B Captured: Identity-Bound Access, Not a Shared Secret!**

---

## Phase 4: The Disaster Scenario (Soft Delete & Versioning)

**Scenario — Act 1, the small mistake:** Now that Jamie is actually uploading files, Alice wants safety nets in place — starting small. "Before we even worry about the whole container vanishing, what happens if someone just deletes one file by mistake? Say, Jamie's `dev-test.txt`?"

**Objective:** Configure Blob-level Soft Delete *before* anything goes wrong, then simulate and recover a single accidental blob deletion.

> **Cost Callout — Soft Delete Is Not Free Insurance:** This applies to *both* soft delete configs in this phase — the blob-level one below (Act 1) and the container-level one in Act 2. Turning the feature on costs nothing by itself. But every blob or container it protects keeps being billed at its normal, active-data storage rate for the *entire* retention window — deleting something doesn't free up billable space until the retention period actually expires and the data is purged for good. Delete 100 GB with a 30-day retention configured, and you're paying for that 100 GB for 30 more days, on top of whatever data replaces it. That's exactly why both configs here use a 7-day retention rather than the maximum (365 days) — Microsoft's own guidance is to start short specifically so you can watch the effect on your bill before extending it. If you have highly volatile, frequently-overwritten data, keep it in a separate storage account with soft delete turned off, rather than paying to retain every discarded revision.

```bash
# 1. Configure BLOB-level soft delete FIRST — this protects individual
#    files, and is a separate setting from Container Soft Delete (Act 2 below)
az storage account blob-service-properties update \
  --account-name $STORAGE_NAME \
  --resource-group $RG \
  --enable-delete-retention true \
  --delete-retention-days 7

# 2. Simulate someone accidentally deleting Jamie's file (Entra ID auth)
az storage blob delete \
  --container-name app-logs \
  --name dev-test.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login

# 3. Find it in the container's "recycle bin" — --include d surfaces soft-deleted blobs
az storage blob list \
  --container-name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --include d \
  --query "[?deleted].{Name:name, Deleted:deleted}" -o table

# 4. Restore just that one file
az storage blob undelete \
  --container-name app-logs \
  --name dev-test.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login
```

One file down, safely recovered. But Blob Soft Delete only protects files *inside* a container — it does nothing if the whole container disappears. That's the bigger scare Alice actually paged you about.

**Scenario — Act 2, the big mistake:** It's 2:00 AM. A junior developer runs a bad script and accidentally deletes the critical `app-logs` container itself — not just a file inside it. You get an automated pager alert. Because you're studying for the AZ-104, you'd already anticipated this too, and had proactively enabled Container Soft Delete as well.

**Objective:** Configure Container Soft Delete, simulate the container-wide disaster, and recover it. (Note: Because we disabled master keys in Phase 3, you must use `--auth-mode login` to perform the recovery!)

```bash
# 1. Proactively enable Container Soft Delete (7-day retention) — a DIFFERENT
#    setting from the Blob Soft Delete you configured in Act 1
az storage account blob-service-properties update \
  --account-name $STORAGE_NAME \
  --resource-group $RG \
  --enable-container-delete-retention true \
  --container-delete-retention-days 7

# 2. Simulate the Junior Developer's mistake (Using Entra ID auth)
az storage container delete \
  --name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login

# 3. PANIC! Find the deleted container in the Recycle Bin
az storage container list \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --include-deleted \
  --query "[?deleted].{Name:name, Version:version}" -o table
```

Expected result:

```text
Name      Version
--------  ----------------
app-logs  01DD125F0E2647B5
```

```bash
# 4. Perform the Rescue (Grab the 'Version' string from the output above)
DELETED_VERSION="<paste-version-string-here>"
az storage container restore \
  --name app-logs \
  --deleted-version $DELETED_VERSION \
  --account-name $STORAGE_NAME \
  --auth-mode login
```

**Flag 4 Captured: Disaster Averted — Twice!**

### Bonus Flag 4B: The Missing Folder

> *"But I was wondering if a folder... inside the container was deleted, could we revert it back? How?"*

You've now recovered one file (Act 1) and one whole container (Act 2) — but what about something in between: an entire virtual "folder" of files? Blob Storage has a **flat** namespace — there's no real folder object, only blob names containing `/` that the portal and CLI render as if they were folders. So a "deleted folder" really means *every blob sharing that name prefix got deleted at once*, and there's no single "undo the folder" command.

```bash
# Simulate a small "folder" of files landing in the container
for i in 1 2 3; do
  echo "dev note $i" > "note$i.txt"
  az storage blob upload \
    --container-name app-logs \
    --file "note$i.txt" \
    --name "dev-notes/note$i.txt" \
    --account-name $STORAGE_NAME \
    --auth-mode login
done

# Whoops — someone deletes the entire "dev-notes" folder at once
PREFIX="dev-notes/"
for BLOB in $(az storage blob list \
  --container-name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --prefix "$PREFIX" \
  --query "[].name" -o tsv); do
  az storage blob delete \
    --container-name app-logs \
    --name "$BLOB" \
    --account-name $STORAGE_NAME \
    --auth-mode login
done

# Recover every soft-deleted blob under that prefix, one by one
DELETED_BLOBS=$(az storage blob list \
  --container-name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --prefix "$PREFIX" \
  --include d \
  --query "[?deleted].name" -o tsv)

for BLOB in $DELETED_BLOBS; do
  echo "Restoring: $BLOB"
  az storage blob undelete \
    --container-name app-logs \
    --name "$BLOB" \
    --account-name $STORAGE_NAME \
    --auth-mode login
done
```

**Worth knowing for the exam:** if the account has a **Hierarchical Namespace** enabled (ADLS Gen2), directories are real filesystem objects, and Azure can soft-delete and restore an entire directory as a single unit — the loop above is a flat-namespace workaround, not a universal requirement.

**Bonus Flag 4B Captured: The Whole Folder, Recovered!**

---

## Phase 5: The Cost Optimization

The migration is complete. The application logs are sitting in the `app-logs` container. However, the finance department notices that the storage bill is creeping up because those logs are sitting in the Hot tier, but nobody has looked at them in weeks.

**Objective:** Manually force an uploaded log file into the Cool tier to save money. (Note: Again, we use `--auth-mode login` since connection strings are blocked).

```bash
# 1. Create a dummy log file locally
echo "Critical system event: Migration complete." > final-log.txt

# 2. Upload the file and explicitly force it into the Cool tier
az storage blob upload \
  --container-name app-logs \
  --file final-log.txt \
  --name 2026/07/final-log.txt \
  --tier Cool \
  --account-name $STORAGE_NAME \
  --auth-mode login

# 3. Verify the tier change
az storage blob show \
  --container-name app-logs \
  --name 2026/07/final-log.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --query "{Name:name, Tier:blobTier}" -o table
```

> **Cost Callout — The Cool Tier Has a Catch:** Cool storage is cheaper per GB than Hot, but it comes with a **30-day minimum storage duration** — delete, overwrite, or move a blob out of Cool before 30 days have passed and you're charged an early-deletion fee for the remaining days, prorated. Cold tier's minimum is 90 days; Archive's is 180 days. These cooler tiers also charge a per-GB *retrieval* fee that Hot doesn't — a blob you tier down to save on storage but then read constantly can end up costing more overall than just leaving it in Hot. And these two costs stack with soft delete from Phase 4: if `final-log.txt` gets soft-deleted before day 30, you pay both the Cool early-deletion penalty *and* the soft-delete retention charge, back to back — not one or the other.

**Flag 5 Captured: Budget Optimized!**

---

## Phase 6: The Paper Trail (Blob Snapshots & Versioning)

A week later, an internal auditor asks a pointed question: *"If someone edits `final-log.txt` and gets it wrong, can you prove what it used to say?"* Alice wants change history on the file — not just a recycle bin, but a full paper trail of every edit.

**Objective:** Enable Blob Versioning, prove that an overwrite automatically creates a version, then "undo" a bad edit by promoting the old version back to current. Along the way, take a manual snapshot too, and understand why you'd ever want both.

```bash
# 1. Enable Blob Versioning at the blob-service level (applies to the whole account)
az storage account blob-service-properties update \
  --account-name $STORAGE_NAME \
  --resource-group $RG \
  --enable-versioning true

# 2. Overwrite the existing log file — this AUTOMATICALLY turns the old
#    content into a version, once versioning is on
echo "Critical system event: Migration complete. [REVISED — DRAFT, DO NOT SHIP]" > final-log.txt

az storage blob upload \
  --container-name app-logs \
  --file final-log.txt \
  --name 2026/07/final-log.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --overwrite

# 3. List every version of that blob, oldest to newest
az storage blob list \
  --container-name app-logs \
  --account-name $STORAGE_NAME \
  --auth-mode login \
  --prefix "2026/07/final-log.txt" \
  --include v \
  --query "[].{Name:name, VersionId:versionId, IsCurrent:isCurrentVersion}" -o table

# 4. Oops — that "revised" draft was a mistake. Promote the ORIGINAL version
#    back to current by copying it over the base blob. Grab the versionId
#    that has IsCurrent = False from the table above.
OLD_VERSION_ID="<paste-the-non-current-versionId-here>"

az storage blob copy start \
  --account-name $STORAGE_NAME \
  --destination-container app-logs \
  --destination-blob 2026/07/final-log.txt \
  --source-uri "https://${STORAGE_NAME}.blob.core.windows.net/app-logs/2026/07/final-log.txt?versionId=${OLD_VERSION_ID}" \
  --auth-mode login

# 5. BONUS: take a manual, one-off snapshot too — a different tool for a different job
az storage blob snapshot \
  --container-name app-logs \
  --name 2026/07/final-log.txt \
  --account-name $STORAGE_NAME \
  --auth-mode login
```

**Snapshot vs. Version — know the difference for AZ-104:**

| | Snapshot | Version |
|---|---|---|
| Created | Manually, on demand (`az storage blob snapshot`) | Automatically, on every overwrite/delete once enabled |
| Scope | One blob, one point in time | Blob-service level — applies to every blob in the account |
| Identified by | A `snapshot` timestamp | A `versionId` |
| Best for | A single checkpoint before a risky change (e.g. before a migration script runs) | Continuous history — the default answer for "protect against accidental overwrites" |
| Restore mechanism | `az storage blob copy start --source-uri "...?snapshot=<ts>"` | `az storage blob copy start --source-uri "...?versionId=<id>"` |
| Hierarchical Namespace (ADLS Gen2) accounts | Not supported | Support has been evolving — check current Microsoft docs before relying on it |

> **⚠️ Gotcha worth documenting:** once versioning is enabled, `az storage blob undelete` (Bonus Flag 4B) changes behavior. If you outright delete a blob after versioning is on, `undelete` restores any soft-deleted *versions and snapshots* back into existence — but it does **not** automatically re-promote one of them to be the current blob. You still have to run the `copy start --source-uri "...?versionId=..."` promotion step above to bring a specific version back as the live blob.

> **Cost Callout — Versioning Can Quietly 2–3x Your Bill:** Snapshots and versions are billed at the same rate as active data, but normally only for the *unique* blocks each one adds — if a blob is versioned but barely changes, you're not paying for a full duplicate every time. Here's the trap: the moment you **explicitly set a tier** on the blob or on one of its versions, that guarantee disappears — Azure switches to billing the *full content length* of that object, whether or not it shares blocks with anything else. That's not hypothetical here: Phase 5 explicitly tiered `final-log.txt` to Cool with `--tier Cool`, so the version you just created in this phase is billed as a full copy, not differential blocks. The fix in production: pair versioning with a Lifecycle Management policy that auto-deletes old versions after N days — without one, a frequently-updated, explicitly-tiered blob can realistically balloon to 2–3x its logical size in storage costs within a month.

**Flag 6 Captured: Time Travel Unlocked!**

---

## Phase 7: The Architecture Review (Blob Storage vs. Azure Files)

A different department is lifting-and-shifting a legacy on-prem finance application. The app doesn't call any storage API — it just expects a mapped network drive, the way it always has on the old file server. Someone on the team asks: *"Can't we just dump this in the same storage account as `app-logs`?"*

**Objective:** Decide when Blob Storage is the right tool versus when Azure Files is, then prove the decision by actually standing up a file share on this account — and discover firsthand that Azure Files runs its own, separate Entra ID access model that inherits nothing from the Blob-side Zero-Trust setup in Phase 3, not the RBAC role and not even the User Delegation SAS pattern.

```bash
SHARE_NAME="legacy-finance-share"

# 1. Create the file share via the CONTROL PLANE (Azure Resource Manager).
#    `share-rm` talks to the Microsoft.Storage resource provider using your
#    Entra RBAC role — it works even with allow-shared-key-access=false,
#    because it's a management operation, not a data-plane FileREST call.
az storage share-rm create \
  --resource-group $RG \
  --storage-account $STORAGE_NAME \
  --name $SHARE_NAME \
  --quota 100

# 2. Now try to upload a file the "normal" way — the data plane.
#    THIS IS EXPECTED TO FAIL.
echo "Q1 finance report" > report.txt

az storage file upload \
  --account-name $STORAGE_NAME \
  --share-name $SHARE_NAME \
  --source report.txt
```

Expected result — something like:

```text
Key based authentication is not permitted on this storage account.
```

```bash
# 3. Confirm the share genuinely exists — via the control plane, keys or not
az storage share-rm show \
  --resource-group $RG \
  --storage-account $STORAGE_NAME \
  --name $SHARE_NAME \
  --query "{Name:name, QuotaGiB:shareQuota}" -o table
```

**Why it failed:** two separate things went wrong here, and neither one is really about `--allow-shared-key-access false` on its own:

1. **Wrong role, wrong service.** `Storage Blob Data Contributor` — the role from Phase 3 — is scoped to Blob data. It grants nothing on Azure Files. Files has its own, separate role namespace (`Storage File Data Privileged Contributor` and friends).
2. **No auth flags at all.** Plain `az storage file upload` with nothing else specified defaults to hunting for the account key, which is disabled — so it fails regardless of any role you might hold.

Fixing both of those still wouldn't get you the same experience as Blob, though, because Azure Files' Entra story is genuinely separate, not a smaller version of Blob's:

- **OAuth over REST** works for `az storage file`/`az storage directory` commands with `--auth-mode login` — but only if you also pass `--backup-intent` (or `--enable-file-backup-request-intent`), and only if you hold a Files-specific role. It also grants *admin-level* access that bypasses file/directory ACLs — a meaningfully different trust model than the scoped, per-container grant Jamie got in Phase 3.
- **Azure Files has its own User Delegation SAS too** — `az storage share generate-sas --as-user --auth-mode login` is a real, supported command. So it's not that Files lacks an Entra-backed SAS option; it's that this would be a *completely separate token*, generated fresh against the share, with its own role requirement. Nothing about the container SAS or the RBAC role from Phase 3 carries over to it.
- For the actual mapped-SMB-drive experience this legacy app needs (not REST/API access), you're back to needing on-premises AD DS or Microsoft Entra Kerberos authentication configured for the account — real infrastructure, not a CLI flag.

**Blob Storage vs. Azure Files — the actual decision:**

| | Blob Storage | Azure Files |
|---|---|---|
| Access protocol | REST/HTTPS API | SMB, NFS, and REST (FileREST) |
| Typical use case | App data, backups, logs, static websites, data lakes | Lift-and-shift file servers, shared config files, "mapped drive" workloads |
| Mounts as a network drive? | No — needs an app, SDK, or a tool like BlobFuse | Yes, natively, the way this legacy app expects |
| Zero-Trust readiness (no account keys) | Native — container-scoped Entra RBAC per identity, with User Delegation SAS as a fallback for non-Entra recipients (Phase 3) | Separate, not inherited — Files has its own roles, its own OAuth-over-REST (admin-level, needs `--backup-intent`), and its own User Delegation SAS, but none of it carries over from a Blob-side setup. Mapped SMB drives still need AD DS/Entra Kerberos |
| Access tiers | Hot / Cool / Cold / Archive | Transaction Optimized / Hot / Cool, plus a Premium (SSD) tier |
| Hierarchical Namespace (ADLS Gen2) | Optional, for big-data/analytics workloads | Not applicable |

**The call for this scenario:** since the legacy finance app hard-requires a mapped SMB drive, Azure Files is the correct service — Blob Storage was never going to work here no matter how it's configured. The trade-off you're accepting is that this share can't inherit the same "no keys, ever" posture as `app-logs` without a real identity-federation project (AD DS or Entra Kerberos). The practical move: keep the file share on a **separate storage account** from your Zero-Trust blob data, store its access key in Key Vault instead of disabling it outright, and scope who can read that key as narrowly as you scoped the SAS in Phase 3.

> **Cost Callout — Provisioned vs. Consumption Billing:** Blob Storage tiers are pure consumption pricing — pay only for the GB you actually store and the operations you run, exactly like every tier used in this challenge so far. Azure Files is moving away from that model: Premium (SSD) file shares, and increasingly the newer Provisioned v2 model for Standard (HDD) shares too, bill for the capacity, IOPS, and throughput you **provision up front — regardless of how much you actually use**, much like a managed disk. Provision a 1 TiB premium share for a 50 GB legacy finance app, and you pay for 1 TiB every month, not 50 GB. The older Standard pay-as-you-go model (true usage-based billing) still exists but is no longer Microsoft's recommended default for new shares — always confirm which billing model a given file share is using before assuming Blob-style "pay for what you store" applies.

**Flag 7 Captured: Architecture Decision Understood!**

---

## Cost & Pricing Cheat Sheet

Everything above in one scannable table — what's genuinely free to turn on, and where the real bill exposure actually hides.

| Feature | Free to Enable? | What Actually Costs Money |
|---|---|---|
| Redundancy (LRS → GRS/ZRS/GZRS) | N/A — a config choice | GRS/RA-GRS ≈ 2x the per-GB cost of LRS for the same data; ZRS/GZRS add their own premium for zone resilience |
| Hot / Cool / Cold / Archive tiers | Free to choose | Storage $ drops as you go colder; retrieval/transaction $ rises. Early-deletion minimums: Cool 30 days, Cold 90 days, Archive 180 days |
| Container Soft Delete | ✅ Yes | Deleted containers billed at the full active-data rate for the entire retention window |
| Blob Soft Delete | ✅ Yes | Same billing behavior, per blob — compounds fast on frequently-overwritten data |
| Blob Versioning | ✅ Yes | Normally billed for unique blocks only — but jumps to *full content length* per version the moment a tier is ever explicitly set |
| Blob Snapshots | ✅ Yes | Same billing model as versions — same explicit-tier trap applies |
| Azure RBAC role assignments | ✅ Yes | No cost, regardless of how many named/scoped assignments you create |
| User Delegation SAS | ✅ Yes | No cost to generate or use |
| B2B guest invites (Entra External ID) | ✅ Yes, up to 50,000 MAU/month | Only relevant at large-scale external partner counts, not one named developer |
| Azure Files — Standard pay-as-you-go | ✅ Yes | Billed for actual data stored + transactions used, like Blob |
| Azure Files — Premium / Provisioned v2 | N/A — a config choice | Billed for *provisioned* capacity/IOPS/throughput, whether you use it or not |

---

## 🏁 Challenge Complete — Flag Summary

| Flag | Phase | What it proved |
|---|---|---|
| 1 | Foundation | Provision a compliant, cost-conscious storage account |
| 2 | Security Audit | Enforce TLS 1.2 |
| 3 | Data Drop | Entra RBAC + User Delegation SAS, keys disabled |
| 3B| Data Drop | Why identity-bound RBAC beats a shared SAS for named developers, and when SAS is still the right tool |
| 4 | Disaster Scenario | Blob-level soft delete + single-file restore (Act 1), then container soft delete + restore (Act 2) |
| 4B| Disaster Scenario | Recovering an entire deleted "folder" (prefix) of blobs at once |
| 5 | Cost Optimization | Manual tiering to Cool |
| 6 | Paper Trail | Blob versioning vs. snapshots, promoting a prior version |
| 7 | Architecture Review | Blob Storage vs. Azure Files, and why Zero-Trust doesn't transfer 1:1 |

**Project "Midnight Migration" — Extended Edition Complete!**

---

## Cleanup — Stop Paying for This

The challenge is done, but the meter keeps running until you tear this down. None of the protective features you turned on — soft delete, versioning, snapshots — block a full account deletion. Deleting the storage account is a management-plane operation that immediately and permanently destroys everything inside it, including anything still sitting inside the 7-day soft-delete window from Phase 4. You don't need to wait that out before decommissioning.

**Objective:** Remove every resource this challenge created — inside the resource group and out — and verify nothing is left behind still billing you.

```bash
# 0. Sanity check — see everything that's about to go
az resource list --resource-group $RG -o table

# 1. Remove the developer's container-scoped role assignment first — once
#    the storage account is gone this scope won't resolve, and deleting it
#    afterward just leaves an orphaned entry in role-assignment lists
az role assignment delete \
  --assignee $DEV_OBJECT_ID \
  --scope $CONTAINER_ID

# 2. Check for resource locks BEFORE attempting deletion — a lock is the
#    #1 reason `az group delete` silently hangs or fails partway through
az lock list --resource-group $RG --query "[].{Name:name, Level:level}" -o table
# If anything shows up: az lock delete --name <lock-name> --resource-group $RG

# 3. Delete the storage account directly first — immediate, verifiable,
#    and stops billing for it right away regardless of any soft-deleted
#    or versioned data still technically "in retention"
az storage account delete \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --yes

# 4. Delete the resource group itself, in the FOREGROUND (no --no-wait) —
#    fire-and-forget deletion can mask a real failure behind a false "success"
az group delete --name $RG --yes

# 5. Verify it's actually gone — don't just trust the exit code
az group exists --name $RG
# Expect: false
```

**Don't forget what's outside the resource group:**

```bash
# 6. Remove Jamie's Entra ID identity — a B2B guest invite or internal
#    member user lives in the DIRECTORY, not the resource group, so
#    deleting $RG never touches it
az ad user delete --id $DEV_OBJECT_ID

# 7. Confirm they're gone
az ad user show --id $DEV_OBJECT_ID
# Expect: an error — the user no longer exists
```

**Local housekeeping (optional, but tidy):**

```bash
rm -f dev-test.txt final-log.txt report.txt note1.txt note2.txt note3.txt
```

> **Cost Callout — Why This Order Matters:** Deleting the storage account is what actually stops the meter — soft delete, versioning, and snapshots only ever controlled what happened to data *while the account still existed*. Resource group deletion cascades to everything ARM-scoped inside it, but it will never touch Jamie's Entra ID user object, since identities live in the directory, not in a resource group. Skipping step 6 doesn't cost you anything directly — Entra ID guest users are free up to the B2B MAU threshold from Phase 3 — but it leaves a stale guest account with real, now-orphaned permissions history sitting in your tenant, which is exactly the kind of thing an audit (remember, one was coming) would flag.

**Cleanup Complete — Nothing Left Running, Nothing Left Billing.**
