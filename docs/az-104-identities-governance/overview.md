---
id: overview
title: AZ-104 · Identities & Governance
sidebar_label: Overview
---

# AZ-104 · Identities & Governance

**Series:** AZ-104 · Identities & Governance  
**Posts:** 2 published · more coming  
**Exam alignment:** AZ-104

---

The other series on this site assume you're already comfortable with Azure and go deep on Entra ID security features. This series is the layer underneath — the **Manage Azure identities and governance** domain of AZ-104 (currently weighted 20–25% of the exam), which is where that comfort actually gets built: Entra ID objects, Azure RBAC, and the governance tooling (Policy, locks, tags, management groups, cost controls) that every other series here quietly depends on.

If you're new to Azure administration, start here. If you're already comfortable with AZ-104 fundamentals and came for Conditional Access or PIM, this series is still useful as a reference for the RBAC and identity mechanics those specializations build on top of.

---

## Before starting this series

Every post assumes a working Azure subscription and Entra ID tenant with a few lab identities (users, groups) already created.

**Complete the [AZ-104 challenge series on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first** — specifically the Identity domain challenges. This series follows the same lab tenant conventions (fictional org, seeded users and groups) and goes deeper where the challenge instructions leave off.

---

## Posts in this series

| # | Format | Title | Exam |
|---|---|---|---|
| 01 | Tutorial | Entra ID Identity Management — Users, Groups, and SSPR | *Coming soon* |
| 02 | Concept + Lab | [RBAC & Access Management — Roles, Scope, and the Additive Model](./02-rbac-access-management) | AZ-104 · AZ-500 |
| 03 | Concept + Lab | [Azure Policy & Governance — Definitions, Effects, and Remediation](./03-azure-policy-governance) | AZ-104 · AZ-500 |

---

## What this series covers that the challenge instructions don't

- **Why RBAC is additive, and the exact scenario where that trips people up** — Contributor at one scope plus Reader at another isn't a conflict, it's a union
- **The custom-role gap that breaks the portal silently** — a role with correct Compute actions that still can't render a resource group, because `Microsoft.Resources/subscriptions/resourceGroups/read` is missing
- **Two role systems that look identical in the portal** — Microsoft Entra ID directory roles vs. Azure RBAC roles, and why the "role-assignable group" toggle only matters for one of them
- **The audit report that's quietly incomplete** — why a standard CSV export of role assignments never contains PIM-eligible, time-bound access, and how to pull that data separately
- **Orphaned assignments** — what happens to a role assignment when the identity behind it is deleted, and why nothing cleans it up automatically
- **Two built-in policies with almost identical names that do completely different things** — "Require a tag on resource groups" vs. "Require a tag and its value on resources," and the real incident where assigning the wrong one let a non-compliant resource through with no error
- **Resource locks apply outside RBAC entirely** — why an Owner can't just override a lock, why locks inherit downward the same way RBAC and Policy assignments do, and what happens when a resource inherits two overlapping locks at once
