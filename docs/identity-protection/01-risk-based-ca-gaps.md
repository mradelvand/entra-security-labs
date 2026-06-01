---
id: 01-risk-based-ca-gaps
title: Risk-Based CA Gaps — When Protection Fires at the Wrong Time
sidebar_label: "[01] · Risk-Based CA Gaps"
---

# Risk-Based CA Gaps — When Protection Fires at the Wrong Time

**Series:** Identity Protection  
**Format:** Incident  
**Difficulty:** Intermediate  
**Exam alignment:** SC-300 · AZ-500

---

A user completes MFA successfully and still gets blocked. The error message gives nothing useful. The sign-in log shows a risk-based CA policy firing — but the risk score looks wrong. This post covers how to investigate when Identity Protection and Conditional Access disagree with reality.

---

## Before You Start

This post assumes you already know:
- What user risk and sign-in risk are in Entra ID and how they differ
- How to read a risky sign-in entry in Identity Protection
- How risk-based CA policies differ from standard CA policies

**New to Identity Protection?** Complete [Challenge 04 — Identity Protection & Risk on azurecertprep](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-04) first, then come back here. This post covers detection gaps and edge cases that only make sense once you've seen Identity Protection working normally.

---

## Background

Identity Protection risk scores are calculated asynchronously. When a user signs in, Entra ID doesn't always have the final risk score ready at authentication time — it may assign a preliminary score, complete authentication, then update the score afterward.

This creates a timing gap: the CA policy evaluated the sign-in at time T with risk score X. By the time you're investigating, the risk score may have changed to Y. What you see in Identity Protection now is not necessarily what triggered the policy.

A second problem: **user risk and sign-in risk are separate, and CA policies can target either or both**. A risk-based CA policy blocking on `High user risk` is not the same as one blocking on `High sign-in risk`. Confusing them during investigation sends you down the wrong path.

---

## Investigation

### Step 1 — Confirm which risk dimension triggered the block

Navigate to: `Entra > Monitoring > Sign-in logs`

Open the failed sign-in. On the **Conditional Access** tab, find the blocking risk-based policy. The policy name usually indicates which risk type it targets — but verify by opening the policy itself.

Navigate to: `Entra > Protection > Conditional Access > Policies > [policy name]`

Check `Conditions > User risk` and `Conditions > Sign-in risk`. Note which one is set to `High` or `Medium and above`.

> **Key point:** If the policy targets user risk, the sign-in log's sign-in risk score is irrelevant. You need to look at the user's risk state, not the sign-in's risk score.

---

### Step 2 — Check the user's current risk state

Navigate to: `Entra > Protection > Identity Protection > Risky users`

Search for the affected user. Check:
- **User risk level:** None / Low / Medium / High
- **Risk state:** At risk / Remediated / Dismissed / Confirmed safe
- **Risk detail:** what detection triggered the current state

> **Key point:** A user whose risk state is `Remediated` from a previous incident may have a new risk event that re-elevated them. Check the **Risk history** tab on the user record, not just the current state.

---

### Step 3 — Find the specific risk detection that elevated the score

On the risky user record, open the **Risk history** tab. Each row is a risk detection event. Click into each recent one and check:
- **Detection type** — leaked credentials, unfamiliar sign-in properties, impossible travel, etc.
- **Detection time** — when did this get flagged?
- **Status** — active, dismissed, or remediated?

If the detection looks wrong (a legitimate sign-in flagged as impossible travel because the user flew somewhere), this is your false positive.

> **Key point:** Impossible travel detections use the previous sign-in location as the baseline. If your user signed in from a VPN that exit-nodded in a different country, the detection is technically correct — even if the travel wasn't real.

---

## Root Cause

Risk-based CA blocks from false positives have two common root causes:

**VPN exit node geography mismatch:** the user's VPN terminated in a country that triggered an impossible travel detection relative to their previous sign-in location. Identity Protection sees two sign-ins from geographically impossible locations in a short window — it's doing its job, but the signal isn't what it appears.

**Stale user risk from a previous incident:** the user's risk was elevated weeks ago, never remediated (no password change, no admin dismiss), and a new policy targeting High user risk finally started enforcing. The user never knew they had elevated risk.

---

## The Fix

### For false positives — dismiss the risk detection

If the detection is confirmed as a false positive (VPN, travel, expected behavior):

Navigate to: `Entra > Protection > Identity Protection > Risky users > [user] > Dismiss user risk`

Or per-detection: `Risk history > [detection] > Confirm safe`

**What this does:** sets the user's risk state to `Dismissed` and removes the block. The user can sign in normally. The dismissal is logged and auditable.

### For stale user risk — remediate properly

If the risk was legitimate (leaked credential detected months ago, password never changed):

1. Reset the user's password
2. Require re-registration of MFA methods
3. After password change, the risk state auto-remediates if a user risk remediation policy is configured

**What this does not do:** dismissing risk without a password change leaves the actual threat unresolved. Dismiss is for false positives. Remediation is for real risk.

---

## Key Takeaways

**User risk and sign-in risk are separate signals with separate remediation paths.**  
Investigate which one triggered the block before doing anything. Dismissing sign-in risk doesn't fix an elevated user risk state.

**Risk scores are not real-time.**  
What you see in Identity Protection after an incident is the post-processed score. What triggered the CA policy at authentication time may have been a preliminary score. Always check the detection timestamp against the sign-in timestamp.

**Stale elevated user risk is the most common false outage cause.**  
Users accumulate risk from old detections that were never addressed. A new risk-based CA policy sweeps them up. Audit risky users before enabling any new risk-based CA policy in enforcement mode.

## Exam Alignment

**SC-300:**
- Implement and manage Identity Protection
- Investigate risk events and risky users
- Remediate risks detected by Identity Protection

**AZ-500:**
- Implement threat protection — Identity Protection risk policies

## References

- [Microsoft Learn — Identity Protection overview](https://learn.microsoft.com/en-us/entra/id-protection/overview-identity-protection)
- [Microsoft Learn — Investigate risk — risky users](https://learn.microsoft.com/en-us/entra/id-protection/howto-identity-protection-investigate-risk)
- [Microsoft Learn — Remediate risks and unblock users](https://learn.microsoft.com/en-us/entra/id-protection/howto-identity-protection-remediate-unblock)
- [azurecertprep — Challenge 04 — Identity Protection & Risk](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-04)
