---
id: 04-service-account-exclusions
title: Service Account Blindspots in Block Policies
sidebar_label: "[04] · Service Account Blindspots"
---

# Service Account Blindspots in Block Policies

**Series:** Conditional Access  
**Format:** Incident  
**Difficulty:** Intermediate  
**Exam alignment:** SC-300 · MS-102  

---

A Block policy with `All users` scope breaks service accounts silently. The service account fails to authenticate. Whatever it was doing on behalf of users stops working. Users see a broken experience, not an auth error. This post covers how to find every service account in your tenant that a CA policy could be silently blocking.

---

## Before You Start

This post assumes you already know:
- How CA user exclusions work and how to add accounts to them
- How to read Sign-in logs and find the Conditional Access tab on a failed sign-in
- What a service principal vs. a service account is in Entra ID

**New to Conditional Access?** Complete [Challenge 02 — Conditional Access Policies on azurecertprep](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02) first. For service principals and app registrations, also complete [Challenge 06 — App Registration Security](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-06).

---

## Background

When you create a CA policy with `All users` in scope, Entra ID evaluates it against every interactive and non-interactive sign-in — including sign-ins made by service accounts that authenticate using username and password or legacy auth flows.

MDM tools (Intune, Addigy, JAMF), directory sync tools (Entra Connect), and third-party SaaS platforms all have service accounts that authenticate to Entra ID on a schedule. They don't show up in obvious places. They don't send you alerts when they fail. They just stop working.

---

## Investigation

### Step 1 — Find all service accounts signing into Entra ID

Navigate to: `Entra > Monitoring > Sign-in logs`

Set these filters:
- **Date:** Last 30 days
- **User type:** Member
- **Client app:** Exchange ActiveSync, Other clients, ROPC (legacy auth indicators)

Also run this filter separately:
- **Application:** any app you use that runs as a service (Intune, JAMF, Addigy, your SIEM, your ITSM)

Look for accounts with a pattern in the display name: `svc-`, `sync-`, `app-`, or accounts that sign in on a perfectly regular schedule (every 30 minutes, every hour).

> **Key point:** Service accounts authenticating via legacy auth protocols are invisible to modern CA policies until a Block policy catches them. That's when you discover they exist.

---

### Step 2 — Check which CA policies they're evaluated against

For any service account sign-in you find, open the entry and go to the **Conditional Access** tab. Look for:
- Any policy with result **Failure** — the policy is blocking this account
- Any policy with result **Not applied** + reason "User excluded" — the account is already in the exclusion list
- Any policy showing **Report-only: Failure** — it will break when you enable enforcement

> **Key point:** `Not applied` is not the same as safe. If the account is only not-applied because of a Report-only policy, enabling that policy will break the account.

---

### Step 3 — Identify which accounts are missing from exclusion lists

For every Block policy in your tenant, open it and check `Users > Exclude`. Cross-reference against the service accounts you found in Step 1 and Step 2.

Any service account **not in the exclusion list** of a Block policy that covers `All cloud apps` is a ticking incident.

Document the gap as: `[Account] → missing from [Policy name] exclusion list`

> **Key point:** The gap is usually not intentional. It happens when CA policies are updated independently of the tools that depend on them.

---

## Root Cause

The root cause in every service account incident is the same: Block policies with `All users` scope were created or modified without auditing which service accounts authenticate to Entra ID.

Service accounts aren't in your IT team's identity inventory. They were created during a vendor onboarding, a tool installation, or a legacy migration — and never documented as things that would be affected by CA policy changes.

---

## The Fix

### Fix 1 — Build a service account exclusion group

Instead of adding individual accounts to each policy's exclusion list, create a dedicated group:

- **Group name:** `CA-Exclude-ServiceAccounts`
- **Type:** Security group, assigned membership (not dynamic)
- **Members:** every service account that needs to be excluded from Block policies

Then add this group to the `Exclude` condition on every Block policy. When you onboard a new service account, add it to the group — it's automatically excluded from all relevant policies.

Navigate to: `Entra > Groups > + New group`

**Expected result:** One group manages exclusions across all Block policies. No per-policy maintenance required.

---

### Fix 2 — Audit the exclusion group quarterly

Service accounts get created, forgotten, and left running. Set a recurring task:

1. Export members of `CA-Exclude-ServiceAccounts`
2. For each account, confirm: is this tool still in use? Is this account still needed?
3. Remove accounts for decommissioned tools
4. Add any new service accounts discovered during the quarter

This prevents the exclusion group from becoming a permanent bypass list for accounts that no longer need it.

---

## Key Takeaways

**"All users" means all users, including your service accounts.**  
Every Block policy with `All users` scope will eventually catch a service account you forgot about. Assume it will happen and build the exclusion group before it does.

**Legacy auth sign-ins are your biggest blindspot.**  
Service accounts using username/password flows often use legacy auth protocols. CA policies can block them, but they can't enforce MFA on them. The right fix is to migrate them to modern auth or managed identities — not just exclude them forever.

**A service account exclusion group is lower-risk than individual exclusions.**  
Individual exclusions get missed when policies are cloned or recreated. A single exclusion group added at policy creation time is harder to accidentally omit.

**Discovery is the hard part.**  
You can't exclude accounts you don't know about. Run the Sign-in log audit from Step 1 before enabling any new Block policy, not after.

## Exam Alignment

**SC-300:**
- Plan and implement Conditional Access policies — user exclusions
- Manage service accounts in Entra ID

**MS-102:**
- Manage Entra ID identity — service accounts and their authentication patterns

## References

- [Microsoft Learn — Conditional Access: Users and groups](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-users-groups)
- [Microsoft Learn — Securing service accounts in Entra ID](https://learn.microsoft.com/en-us/entra/architecture/secure-service-accounts)
- [azurecertprep — Challenge 02 — Conditional Access Policies](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02)
- [azurecertprep — Challenge 06 — App Registration Security](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-06)
