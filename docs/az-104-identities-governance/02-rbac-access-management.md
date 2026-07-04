---
id: 02-rbac-access-management
title: RBAC & Access Management — Roles, Scope, and the Additive Model
sidebar_label: "[02] · RBAC & Access Management"
---

# RBAC & Access Management — Roles, Scope, and the Additive Model

**Series:** AZ-104 · Identities & Governance  
**Format:** Concept + Lab  
**Difficulty:** Intermediate  
**Exam alignment:** AZ-104 · AZ-500  

---

*"Why can the intern see our production subscription?"* That's the question that motivates this entire domain of AZ-104. Every action in Azure — creating a VM, reading a storage account, deleting a resource group — is gated by a role assigned to an identity at a specific scope. Get it wrong and you either block your team or expose your environment. This post covers the mental model, then a lab that deliberately breaks four common assumptions about how RBAC behaves.

---

## Before You Start

This post assumes you already have:
- A lab tenant with a few users and groups created (see the Entra ID identity management post in this series)
- Basic Azure CLI familiarity (`az login`, resource group creation)
- A resource group to work in — the lab below uses `rg-az104-challenge02`

**New to Azure administration?** Complete the [Identity domain challenges on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first, then come back here.

---

## The Concept

### The three parts of every role assignment

A role assignment is always made of three things: a **security principal** (user, group, service principal, or managed identity), a **role definition** (the collection of allowed actions), and a **scope** (where it applies). Change any one of the three and it's a different assignment.

### The four fundamental built-in roles

Azure ships 100+ built-in roles, but almost everything else is a variation on four:

| Role | What it allows |
|---|---|
| **Owner** | Full access to all resources, *and* can assign roles to others |
| **Contributor** | Full access to all resources, but **cannot** assign roles |
| **Reader** | View everything, change nothing |
| **User Access Administrator** | Manage user access to resources (assign roles) without broader resource permissions |

Contributor's inability to assign roles isn't a missing grant — its role definition allows almost everything (`*`) but explicitly excludes `Microsoft.Authorization/*/Write` and `Microsoft.Authorization/*/Delete` in `NotActions`. That's the exact mechanism, and it's worth knowing cold: **only Owner or User Access Administrator can grant access to others.**

### The scope hierarchy

```
Management Group
      └── Subscription
              └── Resource Group
                      └── Resource
```

A role assigned at any level is inherited by everything beneath it. Reader at the subscription becomes Reader on every current and future resource group in it — no re-assignment needed as new resource groups appear.

### The concept engineers get wrong: RBAC is additive, not restrictive

There is no "more specific scope wins" rule in Azure RBAC — that intuition comes from NTFS or Group Policy, and it doesn't transfer. Azure evaluates **every applicable assignment and unions the permissions.** A narrower grant never takes anything away from a broader one; it only adds.

**Concretely:** if a user has Reader at the subscription and Contributor at one resource group inside it, their effective access on that resource group is Contributor — full stop. Reverse the assignments (Contributor at the subscription, Reader at the resource group) and the result doesn't change in principle: they still have Contributor everywhere, including that resource group, because the narrower Reader grant can't restrict the broader Contributor.

The only thing that overrides this is an explicit **Deny assignment** — rare in practice, and normally created by Azure Blueprints or a managed app rather than by hand.

### Two role systems that look identical in the portal

This is a real, common trap when assigning roles to a group:

| System | Controls | Example roles | Needs a "role-assignable" group? |
|---|---|---|---|
| Microsoft Entra ID roles | Directory-level admin actions | Global Administrator, User Administrator | Yes |
| Azure RBAC roles | Access to Azure resources | Owner, Contributor, Reader | No |

The **"Microsoft Entra roles can be assigned to this group"** toggle set at group creation (`isAssignableToRole`) only gates the first system. Azure RBAC roles work with any security group regardless of that setting — and the setting is immutable after creation if you ever do need it.

---

## The Lab

### Step 1 — Assign built-in roles at different scopes

```bash
SUB_ID=$(az account show --query id -o tsv)
ALICE_ID=$(az ad user show --id "alice@YOUR_TENANT.onmicrosoft.com" --query id -o tsv)

# Reader at subscription scope
az role assignment create \
  --assignee-object-id $ALICE_ID \
  --assignee-principal-type User \
  --role "Reader" \
  --scope "/subscriptions/$SUB_ID"

# Contributor for a group, at resource group scope
GROUP_ID=$(az ad group show --group "IT-Team" --query id -o tsv)
az role assignment create \
  --assignee-object-id $GROUP_ID \
  --assignee-principal-type Group \
  --role "Contributor" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-az104-challenge02"
```

**Expected result:** both assignments show up in `az role assignment list --resource-group rg-az104-challenge02 -o table`.

---

### Step 2 — Prove the additive model yourself

Assign Alice Contributor at the resource group scope on top of the Reader she already has at the subscription:

```bash
az role assignment create \
  --assignee-object-id $ALICE_ID \
  --assignee-principal-type User \
  --role "Contributor" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-az104-challenge02"
```

Then check her **effective** access rather than her raw assignments — Portal: `rg-az104-challenge02` → **Access control (IAM)** → **Check access** → search Alice.

**Expected result:** Portal shows Contributor at this scope, not Reader. Two separate assignments exist (visible via `az role assignment list --assignee $ALICE_ID --include-inherited -o table`), but the union is what she can actually do.

---

### Step 3 — Build a custom role scoped to read-only VM access

```bash
cat <<EOF > vm-reader-role.json
{
  "Name": "VM-Reader",
  "IsCustom": true,
  "Description": "Can read VM info and instance view, cannot modify anything",
  "Actions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/instanceView/read",
    "Microsoft.Network/networkInterfaces/read"
  ],
  "NotActions": [],
  "AssignableScopes": [
    "/subscriptions/$SUB_ID"
  ]
}
EOF

az role definition create --role-definition vm-reader-role.json

az role assignment create \
  --assignee "carol@YOUR_TENANT.onmicrosoft.com" \
  --role "VM-Reader" \
  --scope "/subscriptions/$SUB_ID/resourceGroups/rg-az104-challenge02"
```

**Expected result:** `VM-Reader` appears in `az role definition list --custom-role-only true -o table`, and Carol's assignment shows up scoped to the resource group.

---

### Step 4 — Break it: watch Carol's access silently fail

Have Carol try to browse `rg-az104-challenge02` in the portal. In this lab, she can't — the resource group appears empty even though VMs exist inside it.

This is the gap between "the role has a read action" and "the portal can render anything with it." The portal needs `Microsoft.Resources/subscriptions/resourceGroups/read` — a Resources-provider permission — before it will display *anything* inside a resource group, regardless of what Compute-specific reads the role grants. Built-in Reader never hits this because it bundles a `*/read` wildcard across every provider; a from-scratch custom role has to add it explicitly.

**Fix:**

```bash
az role definition list --custom-role-only true --query "[?roleName=='VM-Reader']" -o json > vm-reader-current.json
```

Add to the `Actions` array:
```json
"Microsoft.Compute/virtualMachines/*/read",
"Microsoft.Resources/subscriptions/resourceGroups/read"
```

```bash
az role definition update --role-definition vm-reader-current.json
```

**Expected result:** Carol reloads the resource group and now sees it populate, with VMs listed and power state visible — but no start/stop/modify controls available.

---

### Step 5 — Break it again: delete a user and find the orphan

```bash
az ad user delete --id "alice@YOUR_TENANT.onmicrosoft.com"

az role assignment list --all \
  --query "[?principalType=='Unknown' || principalName==null]" \
  --output table
```

**Expected result:** Alice's old assignments still exist, but the principal now shows as **Unknown** / **Identity not found**. Role assignments reference a principal by object ID, not by name — deleting the identity orphans the assignment rather than removing it.

**Clean up:**

```bash
az role assignment delete --ids "/subscriptions/$SUB_ID/providers/Microsoft.Authorization/roleAssignments/<assignment-guid>"
```

There's no native auto-cleanup for this — a scheduled script that queries for `principalType=='Unknown'` on a recurring basis is the realistic operational answer.

---

### Step 6 — Audit access, and find the report's blind spot

```bash
az role assignment list --all --include-inherited \
  --query "[?roleDefinitionName=='Owner' && principalType=='User'].{User:principalName, Scope:scope}" \
  --output table
```

Portal equivalent: **Access control (IAM)** → **Role assignments** tab → set the **Scope** filter to **"This resource and below"** (the default only shows subscription-level rows) → filter **Role** to Owner → **Download role assignments**.

**Expected result:** a CSV of every active Owner assignment. But notice what's missing — anyone with a **PIM-eligible** Owner assignment who hasn't activated it won't appear anywhere in this export. Eligible assignments live in a separate object type (`roleEligibilityScheduleInstances`) with no active `roleAssignment` record until the moment someone activates. Find them via **Privileged Identity Management** → **Azure resources** → select the scope → **Assignments** → **Eligible assignments** tab, or:

```bash
az rest --method get \
  --url "https://management.azure.com/subscriptions/$SUB_ID/providers/Microsoft.Authorization/roleEligibilityScheduleInstances?api-version=2020-10-01"
```

A complete access report is the union of both exports — "who can touch production" has to include everyone who *could* activate Owner in the next five minutes, not just who holds it right now.

---

## Key Takeaways

**RBAC is additive — no scope ever restricts a broader one.**  
Only an explicit Deny assignment overrides an Allow. Everything else is a union.

**`NotActions` is not a Deny.**  
It only subtracts from that role's own `Actions`. A different role assignment can still grant the same permission back to the same principal.

**Custom roles don't inherit the container-level reads that built-in Reader gets for free.**  
`Microsoft.Resources/subscriptions/resourceGroups/read` is easy to forget and produces a confusing, silent "empty resource group" symptom rather than an access-denied error.

**Group role-assignability and Azure RBAC are unrelated systems.**  
The Entra ID "role-assignable group" toggle never affects whether a group can receive Owner, Contributor, or Reader.

**PIM-eligible assignments are invisible to the standard audit trail.**  
Neither `az role assignment list` nor the default IAM CSV export includes them. Treat this as a required second query, not an edge case.

---

## Exam Alignment

**AZ-104:**
- Manage built-in Azure roles
- Assign roles at different scopes (management group, subscription, resource group, resource)
- Interpret access assignments
- Create and assign custom roles
- Manage Microsoft Entra role assignments

**AZ-500:**
- Implement and manage Azure RBAC — least-privilege access, custom roles, PIM-eligible vs. active assignments

---

## Practice Questions

**1.** A user has Reader at the subscription scope and Contributor at a resource group within it. What is their effective permission on that resource group?
<details><summary>Answer</summary>Contributor. Azure RBAC is additive — the resource group assignment only adds to the inherited Reader; it never narrows it.</details>

**2.** A custom role's `NotActions` excludes a delete action. A different role assigned to the same user at the same scope explicitly grants that action. Can the user perform it?
<details><summary>Answer</summary>Yes. NotActions only subtracts from that role's own Actions list — it isn't a deny and can't block a grant coming from a separate role assignment.</details>

**3.** Which two built-in roles can assign roles to other users?
<details><summary>Answer</summary>Owner and User Access Administrator. Contributor explicitly excludes `Microsoft.Authorization/*/Write` and `*/Delete` in its NotActions.</details>

**4.** A user holds a PIM-eligible assignment for Owner but hasn't activated it. Does it appear in `az role assignment list --all`?
<details><summary>Answer</summary>No. Eligible assignments are a separate object type with no active roleAssignment record until activation — you have to query PIM directly to see them.</details>

**5.** A custom role grants only `Microsoft.Compute/virtualMachines/read` at a resource group scope, but the assigned user sees the resource group as empty in the portal. What's the most likely missing permission?
<details><summary>Answer</summary>`Microsoft.Resources/subscriptions/resourceGroups/read` — the portal needs this container-level read before it will render anything inside a resource group.</details>

**6.** A security group has "Microsoft Entra roles can be assigned to this group" set to No. Can it still receive the Contributor role on a resource group?
<details><summary>Answer</summary>Yes. That setting only governs eligibility for Microsoft Entra ID directory roles. It has no effect on Azure RBAC roles like Owner, Contributor, or Reader.</details>

**7.** A user's account is deleted while they still hold an active role assignment. What happens to the assignment?
<details><summary>Answer</summary>It becomes orphaned rather than removed — the principal shows as "Unknown" or "Identity not found," while the underlying object ID, role, and scope remain until manually deleted.</details>

**8.** What determines where a custom role definition is allowed to be assigned?
<details><summary>Answer</summary>The `AssignableScopes` property. It constrains which scopes an administrator can later choose when creating an actual role assignment using that role — it doesn't grant access by itself.</details>

---

## References

- [Microsoft Learn — What is Azure role-based access control (Azure RBAC)?](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview)
- [Microsoft Learn — Azure built-in roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles)
- [Microsoft Learn — Understand scope for Azure RBAC](https://learn.microsoft.com/en-us/azure/role-based-access-control/scope-overview)
- [Microsoft Learn — Create custom roles for Azure resources](https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles)
- [Microsoft Learn — Assign Azure roles using the Azure portal](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal)
- [Microsoft Learn — Azure roles, Microsoft Entra roles, and classic subscription administrator roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/rbac-and-directory-admin-roles)
- [azurecertprep — AZ-104 challenge series](https://azurecertprep.github.io/docs/az-104/overview)
