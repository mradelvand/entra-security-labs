---
id: overview
title: AZ-104 · Storage & Data Protection
sidebar_label: Overview
---

# AZ-104 · Storage & Data Protection

**Series:** AZ-104 · Storage & Data Protection  
**Posts:** 1 published · more coming  
**Exam alignment:** AZ-104

---

Identities and governance decide *who* can touch a resource. This series covers what happens once they're standing in front of your data: the **Implement and manage storage** domain of AZ-104 (currently weighted 15–20% of the exam) — storage account redundancy, Shared Access Signatures, stored access policies, network firewalls, and access-key rotation.

This series leans further into scenario-driven drills than the rest of the site. Storage security is mostly about what happens *under pressure* — a leaked token, a locked-out pipeline, a migration deadline — so the posts here are framed as incident-response exercises instead of straight walkthroughs. The Azure CLI mechanics and the exam objectives underneath are identical either way.

---

## Before starting this series

Every post assumes a working Azure subscription and Azure CLI access (Cloud Shell or local).

**Complete the [AZ-104 challenge series on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first** — specifically the Storage domain challenges. This series follows the same lab conventions (fictional org, throwaway resource groups) and goes deeper where the challenge instructions leave off.

---

## Posts in this series

| # | Format | Title | Exam |
|---|---|---|---|
| 01 | Incident Response Drill | [Storage Lifeline — SAS Tokens, Firewalls, and Key Rotation Under Fire](./01-storage-lifeline-sas-firewalls-keys) | AZ-104 · AZ-500 |

---

## What this series covers that the challenge instructions don't

- **Why `Standard_LRS` → `Standard_GRS` is a one-line update, but adding zone redundancy isn't** — `az storage account update --sku` handles geo-replication changes; anything that adds zone redundancy (LRS→ZRS, GRS→GZRS) is rejected outright and has to go through `az storage account migration start`, a separate async process that can take up to 72 hours just to *begin*

**The Scenario:** The CTO demands Zone Redundancy today. You try `az storage account update --sku Standard_ZRS` and it fails.
**Simplified Reality: GRS is easy, but ZRS is tricky:**

**LRS (Local Redundancy) → GRS (Geo-Redundant Storage):** Simple: Azure just copies your data to another entire region (like moving files to a backup server across the ocean).  Fast: You can update in one command—no big wait.

**LRS → ZRS (Zone-Redundant Storage):** Harder: ZRS spreads your data inside the same region across three separate physical locations (like splitting files into three different buildings).  No instant switch: You can’t just click—Azure needs to physically move your data (like relocating servers), which takes hours/days and depends on your data size.


- **The gap between "the SKU says GRS" and "your data is actually in the second region"** — the metadata flips instantly, the replication doesn't
- **Why a stored access policy beats a standalone SAS token in production** — and the exact command sequence to revoke access without touching account keys
- **The firewall rule that "worked" and then silently stopped working** — Azure Storage firewall changes aren't instant, and the fix most people reach for for Cloud Shell lockouts doesn't actually hold up
- **Control plane vs. data plane** — why the portal can still show your storage account exists even while every read/write to it is being blocked at the firewall
- **The zero-downtime key rotation sequence** — and why skipping the `key2` bridge step means an outage, not just an inconvenience
