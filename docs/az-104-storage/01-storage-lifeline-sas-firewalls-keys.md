---
id: 01-storage-lifeline-sas-firewalls-keys
title: Storage Lifeline — SAS Tokens, Firewalls, and Key Rotation Under Fire
sidebar_label: "[01] · Storage Lifeline Incident Drill"
---

# Storage Lifeline — SAS Tokens, Firewalls, and Key Rotation Under Fire

**Series:** AZ-104 · Storage & Data Protection  
**Format:** Incident Response Drill  
**Difficulty:** Intermediate  
**Exam alignment:** AZ-104 · AZ-500

---

## The Incident

It's 2 a.m. On-call gets a call: Contoso Ltd.'s primary datacenter has a cooling system failure, and the on-prem file servers holding customer records are on borrowed time. IT leadership makes the call — everything critical moves to Azure, tonight, whether or not the runbook is finished.

Two problems land on your desk at once:

1. You need somewhere to put the data, fast, and it has to survive losing an entire Azure region — because if a cooling failure can take down one datacenter, nobody's betting the backup on a second one behaving perfectly either.
2. A third-party forensics vendor needs to get into that data within the hour to start root-causing the outage — but they don't get your account keys. Ever.

This post walks through that response as a single continuous drill: stand up the account, insure the data, hand a stranger scoped and revocable access, lock the front door, survive a leaked credential, and move the data out under a deadline. Every command below has been checked against current Azure CLI behavior — including three places where a "logical" command actually fails, which is exactly the kind of thing that costs people real time during an actual incident.

---

## Exam Skills Covered

- Configure storage accounts, including redundancy and minimum TLS version
- Configure Azure Storage firewalls and network rules
- Generate and scope Shared Access Signatures (service SAS and account SAS)
- Create and use stored access policies
- Manage and rotate storage account access keys
- Use AzCopy for bulk data transfer

---

## Before You Start

This post assumes:
- An Azure subscription and Azure CLI access (Cloud Shell is used throughout below — it comes with AzCopy pre-installed, so there's nothing extra to install)
- Comfort with basic `az group` / `az storage` commands
- A dedicated resource group for this drill, separate from the governance labs earlier in the AZ-104 series, so nothing here collides with existing RBAC or Policy assignments

**New to Azure Storage fundamentals?** Complete the [AZ-104 Storage challenges on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first — this post assumes you already know what a storage account and a blob container are.

---

## The Briefing

A few concepts are load-bearing for everything that follows. Skim this before the drill starts.

### Redundancy — what survives what

| Tier | Protects against | Copies |
|---|---|---|
| **LRS** (Locally redundant) | Disk/node failure in one datacenter | 3, same datacenter |
| **ZRS** (Zone redundant) | Datacenter failure within a region | 3, across availability zones |
| **GRS** (Geo redundant) | Regional disaster | 3 local + 3 in a paired region (async) |
| **GZRS** (Geo-zone redundant) | Zone *and* regional failure | ZRS locally + async copy to a paired region |

**The upgrade path is not symmetric.** `az storage account update --sku` can move you between LRS and GRS freely — that's just turning geo-replication on or off. But **any change that adds zone redundancy** (LRS→ZRS, GRS→GZRS) is rejected by that same command outright. Adding zone redundancy is a separate, asynchronous **conversion**, started with `az storage account migration start`, and Microsoft's own documentation notes it can take up to 72 hours just to *begin*. This trips people up constantly — the command *looks* like it should work, and the error doesn't make the distinction obvious.

### Three ways to hand out access, in order of how much you should trust them

| Method | Scope | Revocable? |
|---|---|---|
| **Account key** | Everything, everywhere, forever | Only by rotating the key — which kills every SAS signed with it too |
| **Standalone SAS token** | Whatever you scope it to, until it expires | **No.** Once issued, it's valid until its expiry, full stop — the only way to kill it early is to rotate the key that signed it, which takes out every other token from that key with it |
| **Policy-based SAS** | Whatever the policy grants | **Yes** — edit or delete the stored access policy on the server side, and every SAS token referencing it dies instantly |

That middle row is the one people get wrong. A SAS token is just a signed set of query-string parameters — there's no server-side record of it anywhere to delete. If you didn't tie it to a policy, you can't take it back.

### Firewall: control plane vs. data plane

Enabling the storage firewall (`--default-action Deny`) doesn't block everything equally. Azure Storage firewall rules apply only to **data-plane operations** — reading and writing actual blob/file/queue/table data. **Control-plane operations** (viewing the account's configuration, metadata, and settings through Resource Manager) go through a different path and aren't restricted by these rules at all. That's why the portal can keep showing you the storage account's overview page looking completely healthy while every `az storage blob list` from a blocked IP fails outright — you're looking at two different planes.

---

## The Drill

**Setup — pick a resource group and a globally unique account name:**

```bash
RG="rg-az104-storage-incident"
LOCATION="eastus"
STORAGE_NAME="stcontosoir$RANDOM"

az group create --name $RG --location $LOCATION
```

### Checkpoint 1 — The Lifeline

**Goal:** get a storage account standing before anything else happens.

```bash
az storage account create \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --min-tls-version TLS1_2
```

`--kind StorageV2` is what unlocks the full modern feature set (blob lifecycle management, hierarchical namespace if you need it later). `--access-tier Hot` keeps write latency low, since data is about to land fast. Most current subscriptions already default new accounts to a TLS 1.2 minimum — but set `--min-tls-version` explicitly anyway. It's self-documenting, and it's exactly the kind of setting the exam expects you to recognize on sight.

### Checkpoint 2 — Insure the Data

**Goal:** survive losing `eastus` entirely.

```bash
az storage account update --name $STORAGE_NAME --resource-group $RG --sku Standard_GRS
```

**Now check what actually happened:**

```bash
az storage account show \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --query "{sku:sku.name, statusOfPrimary:statusOfPrimary, statusOfSecondary:statusOfSecondary}" \
  -o table
```

The `sku.name` field flips to `Standard_GRS` the moment the command returns — but that's metadata, not data. The actual copy of everything already in the account to the secondary region happens **asynchronously in the background**, and depending on how much data is in the account, that can take anywhere from minutes to hours. `statusOfSecondary` tells you whether the secondary region is actually caught up and available, independent of what the SKU name says. Don't confuse "the SKU updated" with "the data is protected" — for a brand-new, mostly-empty account like this one it'll catch up almost immediately, but that won't be true the next time you do this against a production account with terabytes in it.

### Checkpoint 3 — The Vendor You Don't Trust Yet

**Goal:** the forensics vendor needs into one container, for 24 hours, with zero visibility into anything else — and definitely not the account key.

```bash
CONN_STRING=$(az storage account show-connection-string --name $STORAGE_NAME --resource-group $RG -o tsv)

az storage container create --name forensics --connection-string "$CONN_STRING"

END_DATE=$(date -u -d "+1 day" '+%Y-%m-%dT%H:%MZ')

az storage container generate-sas \
  --name forensics \
  --account-name $STORAGE_NAME \
  --permissions rcw \
  --expiry $END_DATE \
  --https-only \
  --connection-string "$CONN_STRING" \
  -o tsv
```

`rcw` (Read, Create, Write) keeps the vendor inside the `forensics` container and nowhere else. `--https-only` blocks anyone sniffing the token off unencrypted traffic. **If you're testing this on macOS or another BSD-based shell instead of Cloud Shell**, `date -u -d "+1 day"` is GNU-only — the equivalent on `date`'s BSD variant is `date -u -v+1d`. Cloud Shell runs GNU `date`, so the command above works as written there.

### Checkpoint 4 — The Kill Switch

**Goal:** the vendor's SAS token just showed up in a public GitHub repo (their intern, not yours). You need to be able to cut it off *right now*, without rotating account keys and breaking every other integration that uses them.

This only works because you're about to redo the SAS as a **policy-based** one — a standalone SAS issued in Checkpoint 3 can't be revoked this way after the fact. That's the whole lesson from The Briefing above, playing out live.

```bash
az storage container policy create \
  --container-name forensics \
  --name "VendorPolicy" \
  --permissions rw \
  --expiry $END_DATE \
  --connection-string "$CONN_STRING"

az storage container generate-sas \
  --name forensics \
  --account-name $STORAGE_NAME \
  --policy-name "VendorPolicy" \
  --connection-string "$CONN_STRING" \
  -o tsv
```

If this new token leaks too, the fix is one command:

```bash
az storage container policy delete \
  --container-name forensics \
  --name "VendorPolicy" \
  --connection-string "$CONN_STRING"
```

Delete (or shorten) the policy, and every SAS token referencing it is dead immediately — no key rotation, no impact on anything else using this account.

### Checkpoint 5 — Lock the Gates

**Goal:** the vendor engagement is over. Public internet access to this account should stop entirely except from your own machine.

```bash
MY_IP=$(curl -s https://api.ipify.org)
echo "Allowing: $MY_IP"

az storage account update --name $STORAGE_NAME --resource-group $RG --default-action Deny

az storage account network-rule add --account-name $STORAGE_NAME --resource-group $RG --ip-address $MY_IP
```

**Test it immediately — don't wait:**

```bash
az storage container list --account-name $STORAGE_NAME --connection-string "$CONN_STRING" -o table
```

There's a real chance this fails the first time, even though `$MY_IP` is genuinely on the allow list. **Storage firewall rule changes aren't instant** — Microsoft doesn't publish a hard SLA, but propagation delays of anywhere from several seconds to a few minutes are commonly reported. If it fails, wait and retry:

```bash
sleep 45
az storage container list --account-name $STORAGE_NAME --connection-string "$CONN_STRING" -o table
```

Meanwhile, open the Azure portal and look at this same storage account's **Overview** blade. It loads fine — because that's a control-plane read, and (per The Briefing) storage firewall rules don't touch control-plane traffic at all. Only the data-plane call you just ran is subject to the block.

### Checkpoint 6 — The Leaked Key

**Goal:** a junior developer hardcoded `key1` into a script that just got committed to a public repo. Contoso's production app authenticates with `key1` and cannot go down.

1. **Application play:** reconfigure the production app's connection string to use `key2` instead. (This is a config change outside this CLI session — the app needs to actually pick it up before you continue.)
2. **Terminal play — kill the compromised key:**

```bash
az storage account keys renew \
  --account-name $STORAGE_NAME \
  --resource-group $RG \
  --key key1
```

Always pass `--resource-group` explicitly, even though the CLI documentation lists it as optional — it's a one-word insurance policy against account-resolution issues, and it costs nothing.

3. **Application play:** once you've confirmed the app is healthy on `key2`, you can optionally rotate the app back onto the freshly-regenerated `key1` later — or just leave it on `key2` and treat `key1` as the new standby. Either is fine; what matters is that the compromised value is gone.

The reason this doesn't cause downtime: Azure gives every storage account two independent keys specifically so one can be invalidated while the other keeps serving traffic. Regenerate the key currently in use without moving traffic off it first, and you take your own production app down along with the attacker's access.

### Checkpoint 7 — Race the Clock

**Goal:** the cooling system has maybe 30 minutes left before on-prem power gets cut entirely, and there are several gigabytes of backup data still to move. `az storage blob upload` is single-threaded and too slow for this.

```bash
mkdir -p contoso-backups
for i in {1..5}; do echo "Critical data block $i" > contoso-backups/db-chunk-$i.bak; done

SAS_TOKEN=$(az storage account generate-sas \
  --account-name $STORAGE_NAME \
  --connection-string "$CONN_STRING" \
  --services b \
  --resource-types co \
  --permissions rwcl \
  --expiry $END_DATE \
  --https-only \
  -o tsv)

azcopy copy "contoso-backups/*" "https://$STORAGE_NAME.blob.core.windows.net/forensics?$SAS_TOKEN" --recursive
```

Pass **both** `--account-name` and `--connection-string` to `az storage account generate-sas`, even though that looks redundant — the account name is technically recoverable from the connection string, but some CLI versions have failed to parse it out correctly and demanded `--account-name` explicitly anyway. Passing both costs nothing and sidesteps the issue entirely.

AzCopy is multi-threaded by design — it saturates available bandwidth by moving many blocks concurrently, instead of one blob at a time like the basic CLI commands. If a transfer is interrupted, rerunning the same `azcopy copy` command resumes rather than starting over, because AzCopy tracks progress in a local job log.

---

## Debrief — Key Takeaways

**`az storage account update --sku` handles geo-replication changes, not zone-redundancy changes.**  
LRS↔GRS is a live, one-command update. Anything adding zone redundancy (→ZRS or →GZRS) is rejected by that command and requires `az storage account migration start` — a separate, asynchronous conversion that can take up to 72 hours just to begin.

**A SKU update finishing doesn't mean replication finished.**  
The metadata changes instantly; copying existing data to the secondary region is asynchronous and, for anything beyond a nearly-empty test account, can take a while. Check `statusOfSecondary`, not just `sku.name`.

**A standalone SAS token cannot be individually revoked.**  
It's valid until it expires, full stop. The only way to kill it early is rotating the key that signed it — which also kills every other SAS token signed with that same key. If you need the ability to revoke one specific grant of access without collateral damage, it has to be a policy-based SAS from the start.

**Storage firewall rules govern data-plane traffic only.**  
Control-plane operations — viewing the account's configuration through the portal or Resource Manager — aren't subject to firewall rules at all. A storage account can look completely healthy in the portal while every actual read or write to its data is being blocked.

**Firewall rule changes are not instant.**  
Expect a delay of anywhere from seconds to a few minutes between adding a network rule and it actually taking effect. This is a common source of "but I already added the IP!" incidents.

**Azure Cloud Shell does not have a fixed outbound IP address.**  
An IP-based firewall rule that worked in one Cloud Shell session is not guaranteed to work in the next one — a new session can egress from a different IP entirely. This is a real, frequently-reported operational surprise, not an edge case.

**Zero-downtime key rotation depends on moving traffic off the compromised key *before* regenerating it.**  
Regenerate the key an application is actively using, and you've caused the exact outage the two-key design exists to prevent.

---

## Success Criteria

- [ ] `sku.name` reads `Standard_GRS` and `statusOfSecondary` reports the secondary as available
- [ ] A SAS token generated against `VendorPolicy` works, and deleting the policy immediately breaks it
- [ ] With the firewall enabled, `az storage container list` fails from an IP that isn't on the allow list, and succeeds from one that is (after giving the rule a moment to propagate)
- [ ] `key1` has a new `creationTime` after the renew command, and the app is confirmed working on `key2` throughout
- [ ] The `contoso-backups` files exist inside the `forensics` container, uploaded via AzCopy

---

## Bonus Round — Break & Fix

**1. The Session Reset.** Close this Cloud Shell tab and open a fresh one. Try `az storage container list` against your account again. If it fails even though you never touched the network rules, that's not a bug — run `curl -s https://api.ipify.org` again and compare it to what you allow-listed in Checkpoint 5. Cloud Shell's egress IP isn't guaranteed to stay the same across sessions. *Mission:* add the new IP as a second allow rule (or replace the old one).

**2. The Time Bomb.** Generate a SAS token with `--expiry` set to 60 seconds from now instead of a day. Wait two minutes, then try to use it — either with `azcopy` or a direct `curl` request. *Mission:* read the resulting authentication error carefully and confirm for yourself that Azure checks the expiry at request time, not at token-generation time.

**3. The Invalid Path.** Try `az storage account update --name $STORAGE_NAME --resource-group $RG --sku Standard_RAGZRS` directly against the account from Checkpoint 1 (still LRS, or now GRS). *Mission:* read the error and confirm it's rejecting the request because it adds zone-redundancy in a single step — then figure out which command you'd actually need to run to get there (hint: it's not `update`).

---

## Exam Alignment

**AZ-104:**
- Configure storage accounts, including redundancy options and minimum TLS version
- Configure Azure Storage firewalls and network rules
- Generate and manage Shared Access Signatures and stored access policies
- Manage and rotate storage account access keys
- Use AzCopy for data movement

**AZ-500:**
- Configure and manage Shared Access Signatures, including service SAS, account SAS, and stored access policies
- Configure storage account network access controls, including firewall rules and the control-plane/data-plane distinction
- Configure and manage storage account access keys and key rotation

---

## Practice Questions

### Multiple Choice

**1.** Which command changes an existing storage account from `Standard_LRS` to `Standard_GRS` without downtime?
A. `az storage account migration start`  B. `az storage account failover`  C. `az storage account update --sku Standard_GRS`  D. Delete and recreate the account
<details><summary>Answer</summary>C — `az storage account update --sku` handles geo-replication changes like LRS↔GRS directly and live. `migration start` is for changes that add zone redundancy, and `failover` is for disaster recovery, not routine upgrades.</details>

**2.** A standalone (non-policy) service SAS token leaks publicly. What's the fastest way to revoke just that token without affecting anything else?
A. Delete the storage account  B. Set `--https-only` on the account  C. There is no way to revoke only that token — rotating the signing key kills every SAS signed with it, not just this one  D. Contact Microsoft Support
<details><summary>Answer</summary>C. A standalone SAS has no server-side record to delete. The only way to invalidate it early is rotating the key that signed it, which takes out every other SAS signed with that key along with it — collateral damage, not a scoped fix.</details>

**3.** You enable the storage firewall and immediately add your IP as an allow rule. Your very next data-plane command still fails. What's the most likely explanation?
A. The IP was captured incorrectly  B. Network rule changes are not instantaneous and can take a short time to propagate  C. The account needs a restart  D. Firewall rules require an additional RBAC role
<details><summary>Answer</summary>B. Firewall rule propagation isn't instant — a delay of anywhere from seconds to a few minutes between adding a rule and it taking effect is common and expected.</details>

**4.** What remains accessible through the Azure portal even when a storage account's firewall is blocking all data-plane traffic from your IP?
A. Blob contents  B. Container listings via Storage Explorer  C. The account's configuration blades  D. AzCopy transfers
<details><summary>Answer</summary>C. Storage firewall rules apply to data-plane operations only. Control-plane operations — viewing and managing the account's configuration through Resource Manager — go through a separate path that firewall rules don't touch.</details>

**5.** An `LRS` storage account needs to become `Standard_RAGZRS`. What's true about making that change?
A. A single `az storage account update --sku Standard_RAGZRS` handles it  B. It's impossible after account creation  C. Adding zone redundancy requires `az storage account migration start`, a separate asynchronous conversion — not a direct SKU update  D. It requires deleting and recreating the account
<details><summary>Answer</summary>C. `update --sku` explicitly rejects any change that adds zone redundancy (including LRS→ZRS and GRS→GZRS). That conversion has to go through `az storage account migration start`, which can take up to 72 hours just to begin.</details>

---

### Drag & Drop

**Match each access method to what actually revokes it:**

**Methods:** Account key · Standalone SAS token · Policy-based SAS token

**Revocation:** Rotating the key (also kills every other SAS signed by it) · Editing or deleting the stored access policy it references · Rotating the key it was signed with (nothing more selective exists)

<details><summary>Answer key</summary>Account key → Rotating the key (also kills every other SAS signed by it). Standalone SAS token → Rotating the key it was signed with (nothing more selective exists). Policy-based SAS token → Editing or deleting the stored access policy it references.</details>

**Order these redundancy tiers from least to most protective:**

GZRS · LRS · GRS · ZRS

<details><summary>Answer key</summary>LRS → ZRS → GRS → GZRS.</details>

---

### Short Answer

**1.** `az storage account update --sku Standard_GRS` returns success immediately. Does that mean your existing data is already replicated to the secondary region?
<details><summary>Answer</summary>No. The SKU metadata updates instantly, but the actual copy of existing data to the secondary region is asynchronous and can take anywhere from minutes to hours depending on data volume. Check `statusOfSecondary`, not just `sku.name`, to see whether the secondary is actually caught up.</details>

**2.** Why does a stored access policy let you revoke a SAS token without rotating the storage account's access keys?
<details><summary>Answer</summary>Because the SAS references a server-side policy object instead of encoding all its permissions and expiry directly into the signed token. Editing or deleting that policy invalidates any SAS tied to it immediately, without touching the account keys or any other unrelated SAS token.</details>

**3.** You set the storage firewall's default action to `Deny` before adding any allow rules. What happens to your own current session?
<details><summary>Answer</summary>You lock yourself out — the default action denies everything not explicitly allowed, including whoever is applying the change, unless their IP or network was already on the allow list beforehand.</details>

---

### Scenario-Based

**1.** A Cloud Shell session that worked fine yesterday against a firewalled storage account now returns errors on every data-plane call, even though nobody touched the network rules. What's the most likely cause, and the fix?
<details><summary>Answer</summary>Cloud Shell doesn't have a fixed outbound IP address — a new session likely got a different egress IP than yesterday's session, so the previously-allowed IP no longer matches. Fix: get the current IP again (`curl -s https://api.ipify.org`) and add it as a new allow rule.</details>

**2.** Contoso needs to give a vendor 24 hours of read/write access to one container, with the ability to cut that access instantly if the engagement ends early — without touching any other vendor's access. What should be used, and why?
<details><summary>Answer</summary>A stored access policy on that specific container, with a SAS token generated against it (`--policy-name`). Deleting or shortening the policy revokes that vendor's access immediately, without rotating account keys and without affecting any other standalone or policy-based SAS tokens issued elsewhere.</details>

---

### Case Study: Contoso's Incident Timeline

*Contoso stood up a storage account as `Standard_LRS`, upgraded it to `Standard_GRS`, and issued a forensics vendor a standalone service SAS for one container. After the vendor's intern leaked that token, Contoso reissued access as a policy-based SAS and deleted the old policy once the engagement wrapped. The team then enabled the storage firewall with `default-action Deny` and allow-listed only the on-call engineer's IP.*

**1.** The vendor's original standalone SAS token — the one issued before the switch to a policy-based SAS — is still sitting in that leaked GitHub commit. Is it still usable?
<details><summary>Answer</summary>Yes, if it hasn't expired yet. It was never tied to a policy, so nothing done to the newer policy-based SAS affects it. It stays valid until its own expiry or until the account key that signed it is rotated — whichever comes first.</details>

**2.** Two weeks later, a new engineer joins and needs to run diagnostic queries against the account from their home network. What has to happen before their `az storage blob list` command succeeds?
<details><summary>Answer</summary>Their public IP needs to be added as a firewall allow rule, and they need to wait for the rule to propagate. Having valid RBAC permissions or a valid key alone isn't enough — the storage firewall evaluates network access before data-plane authorization is even checked.</details>

---

## Cleanup

```bash
az group delete --name rg-az104-storage-incident --yes --no-wait
```

---

## References

- [Microsoft Learn — Azure Storage account overview](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-overview)
- [Microsoft Learn — Azure Storage redundancy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy)
- [Microsoft Learn — Change how a storage account is replicated](https://learn.microsoft.com/en-us/azure/storage/common/redundancy-migration)
- [Microsoft Learn — Grant limited access to Azure Storage resources using SAS](https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview)
- [Microsoft Learn — Azure Storage firewall rules and network access](https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security)
- [Microsoft Learn — Guidelines & limitations: Azure Storage firewall](https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security-limitations)
- [Microsoft Learn — Manage storage account access keys](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage)
- [Microsoft Learn — `az storage account` CLI reference](https://learn.microsoft.com/en-us/cli/azure/storage/account?view=azure-cli-latest)
- [Microsoft Learn — Get started with AzCopy](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-v10)
- [azurecertprep — AZ-104 challenge series](https://azurecertprep.github.io/docs/az-104/overview)
