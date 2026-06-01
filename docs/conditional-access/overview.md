---
id: overview
title: Conditional Access
sidebar_label: Overview
---

# Conditional Access

**Series:** Conditional Access  
**Posts:** 4 published · more coming  
**Exam alignment:** SC-300 · AZ-500 · MS-102

---

Conditional Access is one of the highest-leverage controls in Entra ID — and one of the most common sources of production incidents. A single misconfigured policy can block an entire user base. A missing exclusion can take out a platform. A state change at the wrong moment breaks everything quietly.

This series goes deeper than the Microsoft docs. Every post starts from a real pattern, real error, or real misconfiguration. You'll learn how to investigate, fix, and prevent it.

---

## Before starting this series

Every post assumes you've already done hands-on work with Conditional Access in the Entra portal. If you haven't:

**Complete [Challenge 02 — Conditional Access Policies on azurecertprep](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02) first.**

That challenge covers the foundation this series builds on: policy creation, grant controls, session controls, and portal navigation. Don't skip it.

---

## Posts in this series

| # | Format | Title | Exam |
|---|---|---|---|
| 01 | Incident | [Troubleshooting a CA Outage Using Entra Audit Logs](./01-troubleshooting-ca-with-audit-logs) | SC-300 · AZ-500 · MS-102 |
| 02 | Tutorial | [Building a Safe CA Testing Workflow with Report-Only Mode](./02-report-only-mode-playbook) | SC-300 |
| 03 | Concept + Lab | [Named Locations — What They Actually Do](./03-named-locations-deep-dive) | SC-300 · AZ-500 |
| 04 | Incident | [Service Account Blindspots in Block Policies](./04-service-account-exclusions) | SC-300 · MS-102 |

---

## What this series covers that docs don't

- **Audit log forensics** — reading old vs. new policy JSON to find what changed and when
- **Platform exclusion logic** — why excluding macOS doesn't always protect a Mac sign-in
- **Service account patterns** — how MDM proxies and third-party tools break CA policies silently
- **Report-only mode as a recovery tool** — not just for testing, but for stopping live outages safely
- **Scoping Block policies** — why `All users + All apps + Block` is a landmine and how to defuse it
