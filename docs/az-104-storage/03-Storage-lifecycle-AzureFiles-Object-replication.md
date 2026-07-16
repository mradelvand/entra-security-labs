---
id: 03-storage-lifecycle-azurefiles-object-replication
title: AZ-104 Challenge 06: Project Deep Freeze
sidebar_label: "[03] · Storage Lifecycle, Azure Files, Object Replication"
---

# AZ-104 Challenge 06: Project Deep Freeze - Storage Lifecycle, Azure Files, Object Replication

**Series:** AZ-104 · Storage & Data Protection
**Format:** Scenario-Based CTF Drill 
**Difficulty:** Intermediate to Advanced
**Exam alignment:** AZ-104 · AZ-500

# 🚩 AZ-104 Challenge 06: Project Deep Freeze

Contoso Ltd's quarterly storage bill review turned up three uncomfortable facts: years of application logs sitting untouched in the Hot tier, zero disaster-recovery copy of anything business-critical, and a finance team still sharing a single password to reach the old on-prem file server. Alice, your manager, hands you all three problems in one sprint — with a compliance audit six weeks out.

**Your mandate:**
1. Automate the aging-out of old data before the next bill lands.
2. Stand up a real, independently-readable cross-region copy of anything mission-critical.
3. Give the finance team a properly secured, per-person file share.

There are **5 Flags** to capture, plus **2 bonus flags** for the sharp-eyed. Every command uses `--auth-mode login` — no connection strings, no account keys typed into a script.

---

## 🟢 Phase 1: Hardened Multi-Region Foundation

**Objective:** Stand up two resource groups in two regions, each holding a StorageV2 account with security guardrails on from the first second — and bake in the two account-level settings Object Replication will need later, so you're not retrofitting them mid-project.

```bash
# Variables
RG_PRIMARY="rg-az104-challenge06-pri"
RG_SECONDARY="rg-az104-challenge06-sec"
LOCATION_PRIMARY="eastus"
LOCATION_SECONDARY="westus2"
STORAGE_PRIMARY="stlifecyclepri$RANDOM"
STORAGE_SECONDARY="stlifecyclesec$RANDOM"

# 1. Separate regional resource groups — keeps the control plane, not just
#    the data, split across regions
az group create --name $RG_PRIMARY --location $LOCATION_PRIMARY
az group create --name $RG_SECONDARY --location $LOCATION_SECONDARY

# 2. Primary storage account — security guardrails below cost nothing extra
az storage account create \
  --name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --location $LOCATION_PRIMARY \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --allow-cross-tenant-replication false \
  --tags Environment=Production CostCenter=IT-001 Owner=SysAdmin

# 3. Secondary storage account — same guardrails, DR role
az storage account create \
  --name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --location $LOCATION_SECONDARY \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --allow-cross-tenant-replication false \
  --tags Environment=DR CostCenter=IT-001 Owner=SysAdmin

# 4. Enable the two account-level settings Object Replication needs later.
#    Doing this now avoids a "why won't my policy create" surprise in Phase 5.
az storage account blob-service-properties update \
  --account-name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --enable-versioning true \
  --enable-change-feed true

az storage account blob-service-properties update \
  --account-name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --enable-versioning true
```

**Flag 1 Captured: Foundation Fortified!**

> **💰 Cost Callout — Two Accounts, Two Bills:** Every guardrail flag above (`--min-tls-version`, `--allow-blob-public-access false`, tags) is free. What isn't free is running two Hot-tier accounts in two regions from day one — you're paying the Hot-tier rate twice before a single old log gets tiered down in Phase 3. The tags aren't just labels either: `CostCenter=IT-001` is what lets Cost Management and Azure Advisor attribute this spend back to a team instead of showing up as an unexplained line item on someone else's budget.

---

## Phase 2: Zero-Trust Containers & Seed Data

**Objective:** Grant yourself RBAC on both accounts, create the containers, and seed the "years of expensive old logs" this whole challenge exists to clean up.

```bash
# 1. Get your Entra ID Object ID
MY_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)

# 2. Get the Resource IDs of both storage accounts
STORAGE_PRI_ID=$(az storage account show \
  --name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --query id -o tsv)
STORAGE_SEC_ID=$(az storage account show \
  --name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --query id -o tsv)

# 3. Assign yourself 'Storage Blob Data Contributor' on BOTH accounts
az role assignment create \
  --assignee $MY_OBJECT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_PRI_ID
az role assignment create \
  --assignee $MY_OBJECT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_SEC_ID

echo "Waiting 60 seconds for RBAC to propagate..."
sleep 60

# 3b. VERIFY
az role assignment list \
  --assignee $MY_OBJECT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_PRI_ID \
  --query "[].{Role:roleDefinitionName, Scope:scope}" -o table

# 4. Create containers on Primary
az storage container create --name app-logs \
  --account-name $STORAGE_PRIMARY --auth-mode login
az storage container create --name documents \
  --account-name $STORAGE_PRIMARY --auth-mode login
az storage container create --name replicated-data \
  --account-name $STORAGE_PRIMARY --auth-mode login

# 5. Matching container on Secondary — Object Replication needs the
#    destination container to already exist
az storage container create --name replicated-data \
  --account-name $STORAGE_SECONDARY --auth-mode login

# 6. Seed 10 "years-old, nobody's-looked-at-it" log files
for i in $(seq 1 10); do
  echo "Log entry $i | $(date -u +%Y-%m-%dT%H:%M:%SZ)" > log-$i.txt
  az storage blob upload \
    --container-name app-logs \
    --file log-$i.txt \
    --name "2023/12/log-$i.txt" \
    --account-name $STORAGE_PRIMARY \
    --auth-mode login \
    --overwrite 2>/dev/null
done

# 7. Seed the replication test document
echo "Important document for replication test" > repl-test.txt
az storage blob upload \
  --container-name replicated-data \
  --file repl-test.txt \
  --name repl-test.txt \
  --account-name $STORAGE_PRIMARY \
  --auth-mode login
```

**Flag 2 Captured: Zero-Trust Data Seeded!**

> **💰 Cost Callout — RBAC Is Free, the Logs Aren't:** The role assignments above cost nothing, same as every RBAC grant in this challenge. The real money is sitting in `app-logs`: ten tiny files today, but multiply that pattern by years of daily application logging and you get exactly the "storage bill review" that kicked off this whole sprint. Phase 3 is where that gets fixed — automatically, without anyone remembering to do it manually.

---

## Phase 3: Lifecycle Management — Automating the Cleanup

**Objective:** Implement one policy, four rules: age logs into Cool at 30 days, Archive at 90 days, delete them entirely at 365 days, and clean up any leftover snapshots or versions after 90 days so they don't silently accumulate cost forever.

```bash
# 1. Write the policy to a file — one clean JSON document, applied once
cat <<'EOF' > lifecycle-policy.json
{
  "rules": [
    {
      "enabled": true,
      "name": "MoveToCoolAfter30Days",
      "type": "Lifecycle",
      "definition": {
        "actions": { "baseBlob": { "tierToCool": { "daysAfterModificationGreaterThan": 30 } } },
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["app-logs/"] }
      }
    },
    {
      "enabled": true,
      "name": "MoveToArchiveAfter90Days",
      "type": "Lifecycle",
      "definition": {
        "actions": { "baseBlob": { "tierToArchive": { "daysAfterModificationGreaterThan": 90 } } },
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["app-logs/"] }
      }
    },
    {
      "enabled": true,
      "name": "DeleteAfter365Days",
      "type": "Lifecycle",
      "definition": {
        "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 365 } } },
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["app-logs/"] }
      }
    },
    {
      "enabled": true,
      "name": "CleanupSnapshots",
      "type": "Lifecycle",
      "definition": {
        "actions": {
          "snapshot": { "delete": { "daysAfterCreationGreaterThan": 90 } },
          "version": { "delete": { "daysAfterCreationGreaterThan": 90 } }
        },
        "filters": { "blobTypes": ["blockBlob"] }
      }
    }
  ]
}
EOF

# 2. Apply it
az storage account management-policy create \
  --account-name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --policy @lifecycle-policy.json

# 3. Verify
az storage account management-policy show \
  --account-name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --query "policy.rules[].{Name:name, Enabled:enabled}" \
  -o table
```

Expected result:

```text
Name                      Enabled
------------------------  ---------
MoveToCoolAfter30Days     True
MoveToArchiveAfter90Days  True
DeleteAfter365Days        True
CleanupSnapshots          True
```

**Flag 3 Captured: Lifecycle Automated!**

> **⚠️ Gotcha:** Lifecycle management runs **once per day**, not in real time — and a newly-created or just-edited policy's first run can take up to 24 hours to start. You will not watch these logs tier down live in this lab; the win here is that the automation is correctly configured and verified, not that you can screenshot it happening. If you ever need an immediate tier change, that's `az storage blob set-tier`, not lifecycle management.

> **💰 Cost Callout — This Is the Actual Savings:** This is the single biggest cost lever in this entire challenge. Hot-tier storage is the most expensive way to keep a byte sitting still; Cool cuts the per-GB rate noticeably, Archive cuts it by an order of magnitude again — and `DeleteAfter365Days` stops paying for data nobody will ever ask for. `CleanupSnapshots` matters just as much: without it, every snapshot and version this account accumulates keeps costing money forever, invisibly, since they don't show up when you're just eyeballing container contents.

### 🎁 Bonus Flag 3B: The Rule That Actually Wins

> *Troubleshooting scenario: create a rule that moves blobs to Archive after 30 days, and another rule that moves the same blobs to Cool after 60 days. Which one wins?*

The intuitive guess is "whichever condition is met first" — Archive's 30-day threshold arrives before Cool's 60-day one, so Archive wins, right? That happens to be the correct *outcome* here, but for the wrong *reason*, and that gap is exactly where AZ-104 exam questions like to live.

The real rule, straight from Microsoft's documentation: **when more than one action would apply to the same blob, lifecycle management always applies the least expensive action** — not whichever rule was defined first, and not whichever condition was met first chronologically. Cost order, cheapest to priciest, is: **Delete → Archive → Cool → Hot**.

Here's a version of the exercise where "first to trigger" and "cheapest wins" actually disagree, so you can see the difference:

```json
{
  "rules": [
    {
      "enabled": true, "name": "ArchiveAt30", "type": "Lifecycle",
      "definition": {
        "actions": { "baseBlob": { "tierToArchive": { "daysAfterModificationGreaterThan": 30 } } },
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["test-conflict/"] }
      }
    },
    {
      "enabled": true, "name": "DeleteAt45", "type": "Lifecycle",
      "definition": {
        "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 45 } } },
        "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["test-conflict/"] }
      }
    }
  ]
}
```

At day 45, **both** conditions are satisfied — the Archive condition has actually been true for 15 days already. "First to trigger" reasoning says Archive should win, since its threshold was crossed first. But delete is the cheaper action, so **delete wins**, even though it triggered later. The blob never reaches Archive at all.

**Bonus Flag 3B Captured: Cheapest Action Wins!**

---

## Phase 4: Identity-Based Azure Files

**Objective:** Give Priya, on the finance team, a properly secured file share — no shared password, no account key, access tied to her own identity and revocable the same way.

```bash
# 1. Create the file share — quota caps it at 50 GiB, which limits
#    both a runaway upload and a runaway bill
az storage share-rm create \
  --name secure-share \
  --storage-account $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --quota 50

# 2. Enable Microsoft Entra Kerberos authentication — lets the SMB share
#    use Entra ID identities directly instead of the storage account key
az storage account update \
  --name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --enable-files-aadkerb true

# 3. Assign the share-level RBAC role
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
CURRENT_USER_ID=$(az ad signed-in-user show --query id -o tsv)

# Scope must be exact: .../fileServices/default/fileshares/{shareName}
SHARE_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_PRIMARY/providers/Microsoft.Storage/storageAccounts/$STORAGE_PRIMARY/fileServices/default/fileshares/secure-share"

az role assignment create \
  --assignee "$CURRENT_USER_ID" \
  --role "Storage File Data SMB Share Contributor" \
  --scope "$SHARE_SCOPE"

# 4. Verify
az storage share-rm show \
  --name secure-share \
  --storage-account $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --query "{Name:name, QuotaGiB:quota}" -o table
```

Expected result:

```text
Name          QuotaGiB
------------  ----------
secure-share  50
```

**Flag 4 Captured: Identity-Based Files Secured!**

**The two-layer permission model — the part that trips people up:** Azure Files identity-based access is never just one check.

- **Layer 1 — Share-level (RBAC):** `Storage File Data SMB Share Reader` / `Contributor` / `Elevated Contributor`, assigned at the file-share scope above. This controls whether someone can reach the share *at all*.
- **Layer 2 — Directory/file-level (NTFS ACLs):** configured with Windows tools (`icacls`, or File Explorer's Security tab) after the share is mounted. This controls what they can do *once inside*.

**Effective permission is the intersection of both layers.** Grant Priya `Contributor` at the share and it means nothing for a folder whose NTFS ACL denies her — she still gets Access Denied on that folder specifically, even though the RBAC role clearly allows it.

> **⚠️ Gotcha:** A storage account can't authenticate with Microsoft Entra ID *and* a second method (AD DS or Microsoft Entra Domain Services) at the same time — `--enable-files-aadkerb true` is mutually exclusive with those. Decide which identity model this account uses before you configure it, not after.

> **💰 Cost Callout — Quota Is a Ceiling, Not a Reservation:** `secure-share` is a Standard (HDD-backed) file share billed on classic pay-as-you-go: you pay for the actual GiB stored, up to the 50 GiB quota — not for 50 GiB whether you use it or not. That's a meaningfully different model from Premium file shares, which bill for the *provisioned* capacity regardless of actual usage. The quota here is purely a spending guardrail against runaway growth, not a pre-paid allocation.

---

## Phase 5: Object Replication

### 📖 Concept Overview — What Object Replication Actually Is

Before the commands, the mental model, since this is the part of the challenge most people get stuck on without one:

**Object Replication asynchronously copies block blobs from a container in one storage account to a container in another** — an ongoing background sync job Azure manages for you, not a one-time copy tool. A few fundamentals worth internalizing:

- **It's asynchronous.** Uploads to the source finish immediately; the copy to the destination happens in the background, usually within minutes, with no hard SLA on exact timing.
- **It's one-way by default.** Source → destination. For two-way sync you create *two separate policies*, one in each direction — there's no single bidirectional setting.
- **It's container-scoped, with optional prefix filters** — not the whole account. You explicitly pair one source container with one destination container, the way `replicated-data` → `replicated-data` is paired here.
- **It runs on top of Blob Versioning and Change Feed, not instead of them.** Change feed on the source is the transaction log the replication engine reads to know what changed; versioning on both ends is how it keeps a consistent, conflict-free copy. This is why Phase 1 turned both on before anything else happened.
- **Deletes DO replicate** — but through the versioning model, not as a raw wipe. When a blob is deleted on the source, its current version becomes a previous version there's no current version anymore and that state gets mirrored to the destination too. Object Replication is explicitly **not a backup**: it will faithfully propagate an accidental deletion, the same way GRS/RA-GRS does.
- **The policy has to exist on both accounts, with the same Policy ID.** This is the single most common setup mistake, and exactly where the walkthrough below picks up.

**How this differs from GRS/RA-GRS**, since AZ-104 loves testing the difference: GRS replicates the *entire account* at the infrastructure level, to a Microsoft-chosen paired region, and you can't read or write the secondary directly (RA-GRS gives you read-only access at best). Object Replication is deliberately smaller in scope and bigger in control: you choose the containers, the region, the account — and the destination is a fully real, independently addressable container you actually own, not a passive failover target.

**What it doesn't support:** blob snapshots (only the current version and its history replicate — snapshots stay put), blobs in the Archive tier, blobs encrypted with customer-provided keys, and a container-level immutability policy on the destination can silently block updates and deletes from replicating even though they succeed on the source.

### Hands-On: Wiring Up the Policy

```bash
# 1. Create the policy on the DESTINATION account first — object replication
#    policies are always authored here, referencing the source account
POLICY_ID=$(az storage account or-policy create \
  --account-name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --source-account $STORAGE_PRIMARY \
  --destination-account $STORAGE_SECONDARY \
  --source-container replicated-data \
  --destination-container replicated-data \
  --min-creation-time "2025-01-01T00:00:00Z" \
  --query policyId -o tsv)

echo "Destination policy created: $POLICY_ID"

# 2. Register that EXACT SAME policy on the SOURCE account. Don't hand-author
#    a second JSON file with the rule details retyped — pipe the destination's
#    policy straight into the source account's create call instead
az storage account or-policy show \
  --account-name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --policy-id $POLICY_ID \
| az storage account or-policy create \
  --account-name $STORAGE_PRIMARY \
  --resource-group $RG_PRIMARY \
  --policy "@-"
```

> **⚠️ Gotcha:** If you create the policy independently on each account instead of piping the same object between them — even with rules that look identical — you'll get `"OR: policy does not exist on destination account"` in the storage activity log, because the two sides ended up with different Policy IDs. The pipe above is what guarantees they match.

```bash
# 3. Upload fresh data on the source with your own identity — same
#    Zero-Trust pattern as every other upload in this challenge
echo "New data to replicate | $(date -u)" > new-repl-data.txt
az storage blob upload \
  --container-name replicated-data \
  --file new-repl-data.txt \
  --name new-repl-data.txt \
  --account-name $STORAGE_PRIMARY \
  --auth-mode login

# 4. Check replication status on the source blob (give it a few minutes first)
az storage blob show \
  --container-name replicated-data \
  --name new-repl-data.txt \
  --account-name $STORAGE_PRIMARY \
  --auth-mode login \
  --query "properties.objectReplicationSourceProperties"

# 5. Confirm it actually landed on the destination
az storage blob show \
  --container-name replicated-data \
  --name new-repl-data.txt \
  --account-name $STORAGE_SECONDARY \
  --auth-mode login \
  --query "{Name:name, LastModified:properties.lastModified}" -o table
```

**Flag 5 Captured: Cross-Region Replication Live!**

> **💰 Cost Callout — You're Paying for Two Things, Not One:** Object Replication has two separate cost consequences, and both are easy to miss when you're focused on getting the policy to work. First, storage cost: every replicated blob now exists twice, billed at whatever tier and redundancy each account uses independently — you don't get to "share" the cost across two accounts. Second, cross-region data transfer: bytes leaving `eastus` for `westus2` are billed as regional data-transfer egress, on top of and separate from the storage cost — check current Bandwidth pricing for the exact per-GB rate, since it varies by region pair. Compare that to a single GRS-enabled account: GRS already costs roughly double LRS for the same reason (a second copy exists), so two separate LRS accounts tied together with Object Replication typically land in a similar-or-higher cost range than one GRS account — the trade you're making is a genuinely writable, independently-controlled destination, not a cheaper backup.

### 🎁 Bonus Flag 5B: Debug a Silent Replication Failure

> *Troubleshooting scenario: the policy is configured, but blobs aren't showing up in the destination container. Where do you look?*

Work through this checklist, in order — it maps to the actual failure modes, most common first:

1. **Enough time actually passed?** Replication is asynchronous with no hard SLA. Minutes, not seconds.
2. **Is versioning enabled on *both* accounts?** Missing it on either side blocks the policy from functioning correctly.
3. **Is change feed enabled on the source?** Without it, the replication engine has nothing to read.
4. **Is the blob in the Archive tier?** Archived blobs are explicitly excluded from replication — Microsoft's documentation is explicit on this.
5. **Does the destination container have an immutability policy?** Updates and deletes can silently fail to replicate even though they succeed on the source.
6. **Do the source and destination Policy IDs actually match?** Re-run `az storage account or-policy list` on both accounts and compare — a mismatch here reproduces exactly the Gotcha from the hands-on section above.

```bash
# List all replication policies on an account
az storage account or-policy list \
  --account-name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY

# Check the rules inside a specific policy
az storage account or-policy rule list \
  --account-name $STORAGE_SECONDARY \
  --resource-group $RG_SECONDARY \
  --policy-id $POLICY_ID -o table
```

**Bonus Flag 5B Captured: Replication Debugged!**

---

## 🔍 Troubleshooting Drills

Two more scenarios worth reasoning through, in the same checklist style as above — these are conceptual, not scripted, since they depend on a specific stored-access-policy or NTFS-ACL setup you'd build separately.

**"A SAS token still works after I deleted the stored access policy it was linked to."** Check whether the SAS was actually generated *against* that stored access policy (`--policy-name`), or whether it was a standalone ad hoc SAS with its own explicit expiry baked in at creation time. Only policy-linked SAS tokens die when their policy is deleted; a standalone SAS keeps working until its own expiry, regardless of anything you do to any stored access policy afterward.

**"A user has `Storage File Data SMB Share Contributor` at the share level but gets Access Denied opening a specific folder."** This is the two-layer model from Phase 4 in action: RBAC grants access at the share, but NTFS directory-level ACLs on that specific folder can independently restrict it further. Effective permission is the intersection — fix the ACL, not the RBAC role, which is already correct.

---

## 📝 AZ-104 Exam Prep: Storage Lifecycle & Replication

Six questions, six different formats — matching the mix you'll actually see on the exam. Answers and reasoning follow each one.

**1. Multiple Choice.** How often does Azure Blob Storage lifecycle management evaluate and run its rules?
　A. In real time, within seconds of a blob matching a condition
　B. Once per hour
　C. Once per day, with no guaranteed exact time — and up to 24 hours for a brand-new policy's first run
　D. Once per week

<br>

*Answer: C. There's no SLA on the exact time of day, and lifecycle management is not suitable for scenarios that need an immediate tier change — that's `az storage blob set-tier` instead.*

**2. Multi-Select.** Which of the following are hard prerequisites for Object Replication between two storage accounts? (Select all that apply)
　A. Blob versioning enabled on the source account
　B. Blob versioning enabled on the destination account
　C. Change feed enabled on the source account
　D. Both accounts must be StorageV2 (GPv2) or BlobStorage
　E. Both accounts must be in the same Azure region

<br>

*Answer: A, B, C, D. Source and destination can be in different regions and even different subscriptions or tenants (with `AllowCrossTenantReplication` enabled) — same-region is not a requirement.*

**3. Scenario / Best Answer.** A user has `Storage File Data SMB Share Contributor` assigned at the file share scope, but gets "Access Denied" opening one specific subfolder that colleagues with the same role can open fine. What's the most likely cause?
　A. RBAC propagation hasn't finished — wait 60 seconds
　B. The user needs `Elevated Contributor`, not `Contributor`
　C. NTFS directory-level ACLs on that specific subfolder are independently restricting access — effective permission is the intersection of RBAC and NTFS ACLs
　D. Shared key access is disabled on the storage account

<br>

*Answer: C. This is the two-layer identity model for Azure Files: share-level RBAC controls access to the share as a whole, but NTFS ACLs configured after mounting control access within it. A colleague with the same role isn't necessarily subject to the same folder-level ACL.*

**4. Matching.** Match each lifecycle condition to what it measures.

| Condition | Measures |
|---|---|
| `daysAfterModificationGreaterThan` | ? |
| `daysAfterCreationGreaterThan` | ? |
| `daysAfterLastAccessTimeGreaterThan` | ? |
| `daysAfterLastTierChangeGreaterThan` | ? |

*Answer: Modification → days since the blob's content was last written. Creation → days since the blob was first created (never resets on overwrite). Last Access → days since the blob was last read, and requires last-access-time tracking to be explicitly enabled first. Last Tier Change → days since the tier itself last changed, independent of content edits.*

**5. True/False.** If a blob simultaneously qualifies for both a "tier to Archive" action and a "delete" action under a lifecycle policy, Azure applies whichever rule was defined *first* in the policy JSON.

<br>

*Answer: False. Rule order in the JSON is irrelevant. Azure always applies the least expensive qualifying action — cost order is Delete → Archive → Cool → Hot — regardless of which condition was satisfied first chronologically or which rule appears first in the document. See Bonus Flag 3B above for a worked example where this actually changes the outcome.*

**6. Short Answer.** You need to replicate blobs from a storage account in Subscription A to one in Subscription B, owned by a different team. Is this supported, and which account do you configure first?

<br>

*Answer: Yes — Object Replication supports cross-subscription replication, and even cross-tenant replication if `AllowCrossTenantReplication` is enabled on the source account. The policy is always created on the destination account first (it's the one that references the source), and the identical policy — same Policy ID — is then registered on the source account second.*

**References used for this section:** [Study guide for Exam AZ-104: Microsoft Azure Administrator](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-104) (official skills outline) and the [Azure Storage documentation on Microsoft Learn](https://learn.microsoft.com/en-us/azure/storage/) (technical reference for lifecycle management, object replication, and Azure Files identity-based auth).

---

## 💰 Cost & Pricing Cheat Sheet

| Feature | Free to Enable? | What Actually Costs Money |
|---|---|---|
| Security guardrails (TLS 1.2, block public access, tags) | ✅ Yes | Nothing — pure config, zero cost impact |
| Running 2 storage accounts in 2 regions | N/A | Hot-tier storage billed twice, from day one, independent of each other |
| Lifecycle Management policy | ✅ Yes | The policy itself is free — it's what *saves* money by tiering/deleting; the risk is a misconfigured rule (see Bonus 3B) not doing what you assumed |
| Blob Versioning / Snapshots (this account) | ✅ Yes | Every retained version/snapshot is billed capacity — `CleanupSnapshots` exists specifically to cap this |
| Object Replication | ✅ Yes (the policy itself) | Every replicated blob is billed storage **twice** (once per account) + cross-region data-transfer egress on top |
| RBAC role assignments (any scope) | ✅ Yes | No cost, regardless of how many named/scoped assignments exist |
| Azure Files — Standard, quota-based | ✅ Yes | Billed for actual GiB stored, up to the quota — the quota is a ceiling, not a reservation |
| Microsoft Entra Kerberos for Files | ✅ Yes | No direct cost — the cost story here is entirely about avoiding a leaked shared password, not billing |

---

## 🧹 Cleanup — Stop Paying for This

Two resource groups went up in Phase 1, so two need to come down — and neither storage account's replication or lifecycle settings block deletion once you tear down the account itself.

```bash
# 1. Sanity check — see what's in each resource group before it goes
az resource list --resource-group $RG_PRIMARY -o table
az resource list --resource-group $RG_SECONDARY -o table

# 2. Delete both storage accounts directly first — immediate and verifiable
az storage account delete --name $STORAGE_PRIMARY --resource-group $RG_PRIMARY --yes
az storage account delete --name $STORAGE_SECONDARY --resource-group $RG_SECONDARY --yes

# 3. Delete both resource groups in the FOREGROUND (no --no-wait) —
#    fire-and-forget deletion can mask a real failure behind a false "success"
az group delete --name $RG_PRIMARY --yes
az group delete --name $RG_SECONDARY --yes

# 4. Verify both are actually gone
az group exists --name $RG_PRIMARY
az group exists --name $RG_SECONDARY
# Expect: false, false
```

```bash
# Local housekeeping
rm -f lifecycle-policy.json
rm -f log-*.txt repl-test.txt new-repl-data.txt
```

**Cleanup Complete — Nothing Left Running, Nothing Left Billing.**

---

## 🏁 Challenge Complete — Flag Summary

| Flag | Phase | What it proved |
|---|---|---|
| 1 | Foundation | Dual-region resource groups and storage accounts with security guardrails baked in from creation |
| 2 | Zero-Trust Data | RBAC-based container access and seed data, no keys |
| 3 | Lifecycle | A real 4-rule aging policy: Cool → Archive → Delete, plus snapshot/version cleanup |
| 3B 🎁 | Lifecycle | The actual conflict-resolution rule — cheapest action wins, not first-triggered |
| 4 | Identity Files | Entra Kerberos + share-scoped RBAC, and the two-layer permission model |
| 5 | Replication | Wiring a destination-then-source policy correctly, with a matching Policy ID on both sides |
| 5B 🎁 | Replication | A real failure-mode checklist for silent replication issues |

**Project "Deep Freeze" Complete!**
