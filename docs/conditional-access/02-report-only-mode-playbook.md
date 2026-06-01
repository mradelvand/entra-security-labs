---
id: 02-report-only-mode-playbook
title: Building a Safe CA Testing Workflow with Report-Only Mode
sidebar_label: "[02] · Report-Only Playbook"
---

# Building a Safe CA Testing Workflow with Report-Only Mode

**Series:** Conditional Access  
**Format:** Tutorial  
**Difficulty:** Intermediate  
**Exam alignment:** SC-300  

---

Most CA policy incidents happen because someone enabled a policy in production without validating it first. Report-only mode exists to prevent this — but most engineers use it only when they think to, not as a standard workflow.

This post gives you a repeatable process: every new CA policy starts in Report-only, you validate it against real sign-in data, then you promote it to enforcement. No surprises, no outages.

---

## Before You Start

This post assumes you already know:
- How to create a Conditional Access policy from scratch in the Entra portal
- What Grant controls and Session controls do
- How to read a sign-in log entry and open its Conditional Access tab

**New to Conditional Access?** Complete [Challenge 02 — Conditional Access Policies on azurecertprep](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02) first, then come back here.

---

## Background

Report-only mode (`enabledForReportingButNotEnforced`) puts a policy in a shadow evaluation state. Entra ID evaluates the policy against every sign-in and records what *would* have happened — but takes no action. The user signs in normally; the sign-in log shows `Report-only: Success` or `Report-only: Failure`.

The reason to care: you can't safely test a Block policy on production users any other way. You can't undo a blocked sign-in. Report-only lets you see the blast radius before you pull the trigger.

---

## Steps

### Step 1 — Create the policy in Report-only state

Navigate to: `Entra > Protection > Conditional Access > Policies > + New policy`

Set everything exactly as you intend for production — users, apps, conditions, grant controls. The only difference: under **Enable policy**, select **Report-only** instead of On.

**Navigate to:** `Entra > Protection > Conditional Access > Policies`

**Expected result:** Policy appears in the list with a grey "Report-only" badge, not a green "On" badge.

---

### Step 2 — Wait for real sign-in data (minimum 24 hours)

Let the policy run in Report-only for at least one full business day. You need sign-ins from the actual user population the policy targets — not just your own test account.

For policies that affect specific apps or platforms, wait until those apps are actively used. A policy targeting macOS sign-ins evaluated only against Windows sign-ins during your test window tells you nothing.

**Expected result:** Sign-in logs accumulate entries showing `Report-only: Success` or `Report-only: Failure` for the policy.

---

### Step 3 — Review the Report-only results in Sign-in logs

Navigate to: `Entra > Monitoring > Sign-in logs`

Filter by:
- **Date:** last 24–48 hours
- **Conditional Access:** Report-only failure

Open each `Report-only: Failure` entry. Check:
- **Who** is failing — is it an expected user, a service account, or a break-glass account?
- **What app** triggered the failure
- **Why** the policy evaluated as failure — which condition wasn't met

```
Sign-in log → Conditional Access tab → find your policy → Result: Report-only: Failure
```

**Expected result:** You can explain every failure entry. Unexpected failures (service accounts, break-glass accounts, MDM proxies) are caught here, not in production after enforcement.

---

### Step 4 — Fix exclusions before enabling

For every unexpected failure from Step 3, add the affected account or group to the policy's user exclusion list *before* enabling enforcement.

Navigate to: `Entra > Protection > Conditional Access > Policies > [your policy] > Users > Exclude`

Add accounts to exclusions in this priority order:
1. Break-glass accounts (always excluded from every policy)
2. Service accounts and MDM proxies (Intune, Addigy, JAMF, etc.)
3. Sync accounts (Entra Connect, cloud sync service accounts)

**Expected result:** Re-checking Sign-in logs after the exclusion shows those accounts now appear as `Report-only: Success` (excluded, policy did not apply).

---

### Step 5 — Enable enforcement

Once every `Report-only: Failure` is either expected or resolved:

Navigate to: `Entra > Protection > Conditional Access > Policies > [your policy]`

Change **Enable policy** from **Report-only** to **On**. Save.

**Expected result:** Policy badge changes to green "On". Sign-in logs for affected users now show `Success` or `Failure` (no longer `Report-only:`). Monitor for the first 30 minutes.

---

## Key Takeaways

**Report-only is not optional for Block policies.**  
Any policy with a Block grant control that applies to `All users` or `All cloud apps` must go through Report-only validation. The blast radius of a misconfigured Block policy is instant and wide.

**Service accounts always fail your first test run.**  
Every organization has service accounts that sign in on behalf of users. They will show up as `Report-only: Failure`. Catch them in Report-only, not after enforcement.

**24 hours is the minimum validation window.**  
Batch jobs, scheduled tasks, and MDM check-ins may only sign in once per day or less. A 2-hour validation window will miss them.

**Exam Alignment**

**SC-300:**
- Plan and implement Conditional Access policies
- Monitor Conditional Access — interpreting sign-in log results including Report-only state

## References

- [Microsoft Learn — Conditional Access Report-only mode](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-report-only)
- [Microsoft Learn — Sign-in logs in Entra ID](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-sign-ins)
- [azurecertprep — Challenge 02 — Conditional Access Policies](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02)
