---
id: 01-troubleshooting-ca-with-audit-logs
title: Troubleshooting a CA Outage Using Entra Audit Logs
sidebar_label: "[01] · CA Outage & Audit Logs"
---

# Troubleshooting a Conditional Access Outage Using Entra Audit Logs

**Series:** Conditional Access  
**Format:** Incident  
**Difficulty:** Intermediate  
**Exam alignment:** SC-300 · AZ-500 · MS-102  

---

## Summary

All Mac users were suddenly blocked from signing in through Addigy Identity. The error was `AADSTS53003`. The problem was traced to a Conditional Access policy called **"Block unsupported device platforms"** — a service account used by Addigy Identity was missing from the policy's user exclusion list, causing every Mac sign-in to be blocked. The fix involved switching the policy to Report-only mode and adding the missing account to the exclusion list.

This post walks through how that was diagnosed using Entra audit logs — and what the policy changes actually did under the hood.

---

## Background

Conditional Access in Entra ID sits between a successful authentication and actual access. A user can prove who they are (authentication ✅) and still be blocked if a CA policy says so (authorization ❌). Error `AADSTS53003` always means a CA policy issued a Block — the user was never granted a token.

The policy in this incident — **"Block unsupported device platforms"** — is a common pattern. The intent is to block sign-ins from platforms that aren't managed or recognized by the organization. The policy was configured like this:

```
Scope:     All users, All applications
Platforms: Include All → Exclude Android, iOS, Windows, macOS
Grant:     Block
```

On paper, macOS was excluded. So why were Macs being blocked?

---

## Investigation

### Step 1 — Sign-in Logs

The first stop is always **Entra > Monitoring > Sign-in logs**.

Filter by:
- **Status:** Failure
- **Error code:** 53003

In the results, click any failed sign-in and open the **Conditional Access** tab. This tab shows every CA policy that was evaluated for that sign-in and its result. You are looking for a policy with result **"Failure"** — that is your blocking policy.

In this case, the failing policy was immediately visible: **"Block unsupported device platforms"**.

> **Key point:** Sign-in logs tell you *what* blocked the user. They do not tell you *why the policy started blocking* or *whether the policy was recently changed*. For that, you need audit logs.

---

### Step 2 — Audit Logs

Navigate to **Entra > Monitoring > Audit logs**.

Apply these filters:

| Filter | Value |
|---|---|
| Service | Conditional Access |
| Activity | Update conditional access policy |
| Date | Today |

If a CA policy was modified recently, you will see it here. Each audit log entry shows:

- **Who** made the change (initiated by)
- **When** it was made
- **Old value** — the full policy JSON before the change
- **New value** — the full policy JSON after the change

In this incident, an audit entry appeared showing the **"Block unsupported device platforms"** policy was modified the same morning the outage started. Comparing old vs. new values in the audit log revealed exactly what changed.

---

## Root Cause

Comparing the old and new policy JSON in the audit log showed two differences.

### What was missing: the Addigy Identity service account

The policy had a user exclusion list — accounts that are never evaluated against this policy regardless of other conditions. The old exclusion list had two accounts. The Addigy Identity service account (`c4597cc6-77dd-4505-802b-e56846e1d900`) was not on it.

Here is the critical detail: even though **macOS was listed under `excludePlatforms`**, Entra ID's CA engine evaluates all conditions together. The sign-in came through the Addigy Identity account, which was not excluded. The platform exclusion alone was not enough — the user principal making the request also had to be excluded, or the block still applied.

```json
// Old exclusion list — Addigy Identity account missing
"excludeUsers": [
  "3d802b6f-dab2-4ef0-b9c4-31feb40aae45",
  "f796f9b5-9e7f-4361-be39-fabd09b69c19"
]

// New exclusion list — Addigy Identity account added
"excludeUsers": [
  "3d802b6f-dab2-4ef0-b9c4-31feb40aae45",
  "f796f9b5-9e7f-4361-be39-fabd09b69c19",
  "c4597cc6-77dd-4505-802b-e56846e1d900"  ← added
]
```

---

## The Fix

Two changes were made to the policy.

### Fix 1 — Switch to Report-only mode

The policy `State` was changed from `Enabled` to `enabledForReportingButNotEnforced`.

```json
// Before
"State": "Enabled"

// After
"State": "enabledForReportingButNotEnforced"
```

**What this does:** Report-only mode means Entra ID still evaluates the policy against every sign-in and logs what *would* have happened — but it does not actually enforce the block. Sign-ins continue normally.

This is the fastest way to stop an active outage caused by a CA policy without deleting the policy entirely. The policy is effectively disarmed while you investigate.

In Sign-in logs, you will now see the result as **"Report-only: Failure"** instead of **"Failure"** — confirming the policy would still have blocked the user, but is no longer doing so.

### Fix 2 — Add the missing account to user exclusions

The Addigy Identity service account was added to the `excludeUsers` list. This ensures that even if the policy is re-enabled in the future, sign-ins through that account are never caught by this block.

**What this does:** User exclusions in CA policies are evaluated before anything else. If the signed-in user (or service account) is in the exclusion list, the policy does not evaluate further — it simply does not apply. This is the correct way to handle service accounts and MDM identity proxies that sign in on behalf of a managed device.

---

## What the Audit Log Entry Actually Looked Like

For reference, here is the structure of what was compared in the audit log:

**Old policy (before fix):**
```json
{
  "State": "Enabled",
  "Conditions": {
    "Users": {
      "Exclude": [
        { "Users": ["3d802b6f-...", "f796f9b5-..."] }
      ]
    },
    "DevicePlatforms": {
      "Include": [{ "DevicePlatforms": ["All"] }],
      "Exclude": [{ "DevicePlatforms": ["Android", "iOS", "Windows", "macOS"] }]
    }
  },
  "Controls": [{ "Control": ["Block"] }]
}
```

**New policy (after fix):**
```json
{
  "State": "Reporting",
  "Conditions": {
    "Users": {
      "Exclude": [
        { "Users": ["3d802b6f-...", "f796f9b5-...", "c4597cc6-..."] }
      ]
    },
    "DevicePlatforms": {
      "Include": [{ "DevicePlatforms": ["All"] }],
      "Exclude": [{ "DevicePlatforms": ["Android", "iOS", "Windows", "macOS"] }]
    }
  },
  "Controls": [{ "Control": ["Block"] }]
}
```

The platform exclusions were unchanged in both versions. The only meaningful differences were the policy state and the addition of one user to the exclusion list.

---

## Key Takeaways

**1. Sign-in logs show what blocked the user. Audit logs show why it started happening.**  
Always use both. Sign-in logs are the first stop; audit logs are where you find the root cause when something changed.

**2. Platform exclusions and user exclusions work independently.**  
A device platform being excluded does not protect a sign-in if the user principal making that sign-in is not also excluded. When a third-party MDM or identity proxy is involved, its service account needs to be in the user exclusion list.

**3. Report-only mode is your fastest safe recovery tool.**  
Switching a blocking CA policy to Report-only stops the outage immediately without deleting the policy. The policy keeps logging, you keep your audit trail, and you can investigate without pressure.

**4. Block + All Users + All Applications is a high-risk combination.**  
Policies with this scope have no safe floor. One missing exclusion can take out an entire user base or platform. These policies need extra scrutiny before enforcement and should always be validated in Report-only mode first.

**5. Audit every service account and MDM proxy against your CA policies.**  
Any third-party tool that authenticates to Entra ID on behalf of users needs to be explicitly accounted for in your CA exclusion lists. This is easy to miss when policies are updated independently of the tools that depend on them.

---

## Troubleshooting Flow (Repeat This Every Time)

```
1. User reports sign-in failure with AADSTS error
2. Go to Entra > Sign-in logs → filter by user + error code
3. Open the failed sign-in → Conditional Access tab
4. Identify the blocking policy by name
5. Go to Entra > Audit logs → filter by Service: Conditional Access + Activity: Update policy
6. Find recent changes to that policy → compare old vs. new values
7. Identify what changed (state, exclusions, conditions)
8. Switch policy to Report-only to stop the outage
9. Apply the correct fix (exclusion, condition, scope)
10. Validate in Sign-in logs — confirm result shows "Report-only: Failure" not "Failure"
11. Re-enable enforcement only after validation passes
```

---

## Exam Alignment

This scenario maps directly to the following SC-300 skill areas:

- *Plan and implement Conditional Access policies* — understanding state, conditions, grant controls
- *Troubleshoot Conditional Access* — using sign-in logs and audit logs to identify root cause
- *Monitor Entra ID* — interpreting audit log entries including old/new value comparison

It also touches AZ-500 topics around identity security controls and MS-102 around M365 tenant administration.

---

## References

- [Microsoft Learn — Conditional Access overview](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview)
- [Microsoft Learn — Troubleshoot Conditional Access sign-in problems](https://learn.microsoft.com/en-us/entra/identity/conditional-access/troubleshoot-conditional-access)
- [Microsoft Learn — Sign-in logs in Entra ID](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-sign-ins)
- [Microsoft Learn — Audit logs in Entra ID](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-audit-logs)
- [Microsoft — AADSTS error codes reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes)
- [Microsoft Learn — Report-only mode for Conditional Access](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-report-only)
