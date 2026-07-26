---
id: overview
title: MD-102 · Endpoint Management
sidebar_label: Overview
---

# MD-102 · Endpoint Management

**Series:** MD-102 · Endpoint Management  
**Posts:** 1 published · more coming  
**Exam alignment:** MD-102

---

This series covers Intune-based endpoint management for the **Microsoft 365 Certified: Endpoint Administrator Associate (MD-102)** exam — packaging, deploying, and monitoring applications at scale on managed Windows devices. It's a different certification track from AZ-104 (Intune isn't an Azure Administrator exam objective at all), so it lives in its own series rather than folded into the AZ-104 categories.

---

## Before starting this series

Every post assumes access to a Microsoft Intune tenant (a [free 90-day Microsoft 365 Developer tenant](https://developer.microsoft.com/en-us/microsoft-365/dev-program) works fine), Global Administrator or Intune Administrator rights in that tenant, and at least one Windows 10/11 test device or VM you can enroll.

**New to Intune?** Start with Microsoft Learn's [Endpoint Administrator training paths](https://learn.microsoft.com/en-us/training/browse/?terms=MD-102) before this series — these posts assume you already know how to get to the Intune admin center and enroll a device, and go deeper from there.

---

## Posts in this series

| # | Format | Title | Exam |
|---|---|---|---|
| 01 | Concept + Lab | [Node.js at Scale — Packaging, Testing, and Rolling Out a Win32 App Through Intune and Company Portal](./01-nodejs-win32-app-deployment-intune) | MD-102 |

---

## What this series covers that a walkthrough of the wizard doesn't

- **Why "System context" quietly assumes your MSI is per-machine** — and what happens to detection when that assumption is wrong
- **The one dev-tooling collision nobody flags in the docs** — pushing a machine-wide runtime onto machines that already self-manage it with `nvm-windows`/Volta/`fnm`
- **The Product Code GUID trap in the uninstall command** — a value that changes with the *version*, not the app, and quietly breaks supersedence chains if you forget
- **Why "Required" alone never puts anything in Company Portal** — the objective says "Intune *and* Company Portal" for a reason, and most tutorials only configure half of that
- **What "cost" actually means in an Intune context** — it isn't a metered Azure bill, it's licensing tier and bandwidth, and conflating the two leads to the wrong cost callouts entirely
