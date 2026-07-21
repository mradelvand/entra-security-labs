---
id: overview
title: AZ-104 · Compute & Deployment
sidebar_label: Overview
---

# AZ-104 · Compute & Deployment

**Series:** AZ-104 · Compute & Deployment  
**Posts:** 1 published · more coming  
**Exam alignment:** AZ-104

---

This series covers the **Deploy and manage Azure compute resources** domain of AZ-104 (currently weighted 20–25% of the exam) — specifically the automation slice of it: deploying resources with ARM templates and Bicep rather than the Azure Portal, one click at a time.

---

## Before starting this series

Every post assumes a working Azure subscription, the Azure CLI installed (or Azure Cloud Shell), and the Bicep CLI (`az bicep install`).

**Complete the [AZ-104 challenge series on azurecertprep](https://azurecertprep.github.io/docs/az-104/overview) first** — specifically the Resource Manager domain challenges. This series follows the same lab tenant conventions (fictional org, seeded resource groups) and goes deeper where the challenge instructions leave off.

---

## Posts in this series

| # | Format | Title | Exam |
|---|---|---|---|
| 01 | Concept + Lab | [ARM Templates & Bicep — Deploying, Previewing, and Troubleshooting Infrastructure as Code](./01-arm-templates-bicep-iac) | AZ-104 · AZ-500 |

---

## What this series covers that the challenge instructions don't

- **The three "conversions" that look identical but aren't** — `az bicep build`, `az bicep decompile`, and `az group export` all produce JSON, and only one of them is reversible without loss
- **The naming collision that's invisible until deployment** — `uniqueString()` isn't optional decoration, it's the only thing standing between your template and a global namespace shared with every Azure customer
- **What `RequestDisallowedByPolicy` actually means for a Bicep deployment** — and why a template that deploys cleanly in one resource group can fail outright in another with zero code changes
- **The `existing` keyword's most common misunderstanding** — why editing properties inside an `existing` resource block silently does nothing to the real resource
- **Why `Complete` mode is the single most dangerous flag in the ARM/Bicep vocabulary**, and the exact error you get when Azure can't finish cleaning up after you
