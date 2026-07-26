---
id: 01-nodejs-win32-app-deployment-intune
title: "Node.js at Scale — Packaging, Testing, and Rolling Out a Win32 App Through Intune and Company Portal"
sidebar_label: "[01] · Node.js Win32 Deployment"
---

# Node.js at Scale — Packaging, Testing, and Rolling Out a Win32 App Through Intune and Company Portal

**Series:** MD-102 · Endpoint Management  
**Format:** Concept + Lab  
**Difficulty:** Intermediate  
**Exam alignment:** MD-102

---

## The Scenario

Alice, IT manager at Contoso Ltd., forwards you a ticket from the Engineering lead: *"Everyone needs Node.js. New hires are burning their first day installing it by hand, and half of them get a different version than the rest of the team."*

Her ask sounds simple: package Node.js, push it through Intune, done. You start drafting the Win32 app the same afternoon — and by the second cup of coffee you've found three ways this "simple" push can go quietly, silently wrong on exactly the machines it's meant to help: developer laptops that already manage their own Node.js versions.

"Just don't break anyone's machine," Alice says, which is a lower bar than it sounds like once you actually start digging into requirement rules and detection logic.

---

## Exam Skills Covered

This maps to the **Manage and secure applications (15–20%)** domain of the current MD-102 outline — specifically the *Deploy and update apps* skill area:

- Prepare applications for deployment by using Intune
- Deploy apps by using Intune, including Win32 apps
- Monitor app deployment status and troubleshoot installation failures by using Microsoft Intune

It also touches the *Prepare infrastructure for devices* domain for the pilot group:

- Plan and implement groups for devices in Microsoft Entra ID, including dynamic group membership rules

> This is a different certification track from AZ-104 — Intune and Win32 app management aren't Azure Administrator exam objectives at all. That's why this lives in its own [MD-102 series](./overview) instead of being folded into any `az-104-*` category.

---

## SCCM/Traditional ↔ Intune Reference

For anyone coming from on-prem imaging or Configuration Manager, the mental model mostly transfers — the vocabulary and delivery mechanism don't:

| Traditional / SCCM | Intune Equivalent | Notes |
|---|---|---|
| Application model (deployment type, detection method) | Win32 app (`.intunewin`) | Same four pieces: package, program, requirements, detection |
| Collections | Entra ID device/user groups | Assigned (static) or dynamic membership |
| Task Sequence exit code handling | Win32 app return code mapping | Same `0`/`3010`/`1641`/`1618` mental model |
| Group Policy software installation | Win32 app **Required** assignment | GPO software install had no real detection logic; Win32 apps enforce it every check-in |
| Distribution Points (DP) | Azure-hosted content + Delivery Optimization | Cloud-hosted, peer-caching instead of on-prem DP infrastructure |
| Software Center | **Company Portal** | End-user-facing, self-service app catalog |
| `ccmexec.log` | Intune Management Extension logs (`IntuneManagementExtension.log`) | Same instinct — check the local agent log when a deployment stalls |

---

## Before You Start

This post assumes you already have:
- Access to an Intune tenant — a [free 90-day Microsoft 365 Developer tenant](https://developer.microsoft.com/en-us/microsoft-365/dev-program) is enough
- Global Administrator or Intune Administrator rights in that tenant
- 2–3 Windows 10/11 64-bit test devices or VMs, already enrolled in Intune
- The [Microsoft Win32 Content Prep Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool) (`IntuneWinAppUtil.exe`) downloaded locally
- The official 64-bit Node.js MSI installer from [nodejs.org](https://nodejs.org/en/download)

> **Licensing Callout — What This Lab Actually Requires:** Win32 app management needs at minimum an Intune Plan 1 license on the target devices/users — bundled into Microsoft 365 E3/E5, Business Premium, and EMS E3/E5. Nothing in this post touches the paid **Intune Suite** add-ons (Advanced Analytics, Cloud PKI, Remote Help, etc.) — this is core Win32 app functionality included in every standard Intune license. Unlike an Azure resource, there's no metered "per-deployment" charge here; the cost model is a flat per-seat license you almost certainly already have if you're managing Windows devices with Intune at all.

---

## The Concept

### What actually makes up a Win32 app in Intune?

Four pieces, and missing any one of them is a different failure mode:

1. **Package** — the `.intunewin` file, produced by wrapping your installer (MSI, EXE, or a script) with the Content Prep Tool. This is just a container; it doesn't change how the installer itself behaves.
2. **Program** — the actual install/uninstall command lines, install context (System or User), and device restart behavior.
3. **Requirements** — gating conditions (OS architecture, minimum OS version, disk space, or a custom PowerShell script) that must be true *before* Intune even attempts the install.
4. **Detection rules** — the check Intune runs *after* attempting install to decide whether it actually succeeded, and on every subsequent check-in to decide whether to leave the app alone.

Requirements and detection rules look similar on the surface — both are "checks" — but they run at different times and answer different questions. A requirement failing means Intune never tries to install. A detection rule failing after a successful-looking install means Intune thinks the app isn't there and will try again indefinitely.

### Required vs. Available — and why Company Portal is easy to forget

Win32 apps can be assigned two different ways:

- **Required** — pushed silently by the Intune Management Extension (IME) in the background, no user interaction, doesn't appear in Company Portal.
- **Available for enrolled devices** — listed in Company Portal for the user to install on demand; nothing happens until they click it.

These aren't mutually exclusive. A single app can have a **Required** assignment to a device group (so it's on every machine in that group by default) *and* an **Available** assignment to a broader group (so anyone else can pull it down from Company Portal if they need it). If your objective explicitly mentions Company Portal, you need that second assignment — a Required-only setup will install Node.js perfectly and never once show up in Company Portal, which is a common gap in "just push it silently" tutorials.

---

## The Lab

### Part 1 — Build the pilot device group

Alice's instinct is to test on "a couple of laptops" — which in Entra ID terms means an assigned device group, not a dynamic one, for this first pass.

1. Sign in to the **Microsoft Intune admin center** (`intune.microsoft.com`).
2. **Groups** → **All groups** → **New group**.
3. Configure:
   - **Group type:** `Security`
   - **Group name:** `Sec-Intune-Pilot-NodeJS`
   - **Membership type:** `Assigned`
4. **Create**, then **Members** → **Add members** → select your 2–3 test devices.

> **⚠️ Gotcha:** this has to be a **device** group, not a user group. Win32 apps assigned to a user group install when *that user* logs into *any* device — which is the wrong targeting model for "every machine gets Node.js regardless of who's logged in." Device group + device-targeted assignment is what makes the install happen on IME's own schedule, independent of any user session.

Once this is validated, production targeting should move to a **dynamic** device group — e.g. a rule like `(device.deviceOSType -eq "Windows")` combined with a naming-convention or extensionAttribute-based ring tag — rather than manually curating membership at fleet scale.

---

### Part 2 — Package the MSI

1. Download the official Node.js MSI (e.g., `node-v20.x.x-x64.msi`).
2. Place it in a source folder (`C:\IntuneSource\NodeJS`).
3. Run `IntuneWinAppUtil.exe` against that source folder and setup file, output to `C:\IntuneSource\Output`.
4. This produces `node-v20.x.x-x64.intunewin`.

> **⚠️ Gotcha:** before you package it, confirm the MSI's install context assumption. Some MSIs default to a per-user context (`ALLUSERS` unset or `ALLUSERS=2` with per-user fallback) rather than per-machine. If you deploy that MSI under Intune's **System** context, you can get a successful-looking install that writes to a per-user location IME's own account doesn't recognize the same way a real machine-wide install would — which shows up later as a detection mismatch, not a packaging error. Verify with `msiexec /a node-v20.x.x-x64.msi /qb TARGETDIR=C:\temp\extract` and inspect the tables, or simply confirm behavior on a clean test VM before trusting the assumption.

---

### Part 3 — Program settings: install/uninstall commands

**Install command:**
```cmd
msiexec /i "node-v20.x.x-x64.msi" /qn /norestart /l*v "C:\ProgramData\IntuneLogs\NodeJS_Install.log"
```

**Uninstall command:**
```cmd
msiexec /x {YOUR-MSI-PRODUCT-CODE-GUID} /qn /norestart
```

**Install context:** `System`

> **⚠️ Gotcha — verbosity flag:** `/log` with no flag captures Windows Installer's default logging level, which is frequently not enough to diagnose a silent failure in the field. Use `/l*v` (verbose) instead — the extra detail is the difference between "the install failed" and "the install failed *because the C++ redistributable dependency wasn't present yet*."

> **⚠️ Gotcha — the Product Code GUID isn't stable:** `{YOUR-MSI-PRODUCT-CODE-GUID}` has to be pulled fresh from each MSI — **Node.js's Product Code changes with essentially every version.** This is easy to forget the first time you package a new Node.js release for supersedence: the old app's uninstall command still references the *old* GUID, which is exactly what it should reference for uninstalling the *old* version — but if you copy-paste the new version's app settings from the old one without regenerating this value, the new app's own uninstall command silently points at the wrong product.

Because Install Context is `System`, the Intune Management Extension runs the payload as `NT AUTHORITY\SYSTEM`, which has full administrative privileges — no UAC prompt, no local admin rights required from the end user, and combined with `/qn` the whole thing runs headlessly.

---

### Part 4 — Return codes and restart behavior

Intune reads the process exit code from `msiexec.exe` and maps it to a restart action:

| Return Code | Type | Intune Action | Reason |
|---|---|---|---|
| `0` | Success | Success | Clean install |
| `1707` | Success | Success | Standard MSI success code |
| `3010` | Soft Reboot | Pending Restart | Reboot recommended, not forced |
| `1641` | Hard Reboot | Forced Reboot | Immediate restart — avoid unless mandatory |
| `1618` | Fast Retry | Retry | `ERROR_INSTALL_ALREADY_RUNNING` — Intune retries automatically |

**For Node.js specifically:** set Device Restart Behavior to **"No action"** (or map `3010` to a soft/pending restart, never hard). Node.js's own environment variable changes (updating `%PATH%`) take effect in newly opened shells without a full Windows restart — forcing a reboot here is pure unnecessary disruption to whoever's mid-task on that machine.

---

### Part 5 — Requirements: the collision the wizard won't warn you about

Baseline requirements are straightforward:

- **OS architecture:** `64-bit` — the `x64` MSI simply won't run on 32-bit Windows
- **Minimum OS:** `Windows 10 1607` or higher — the floor for modern Win32 app management via IME
- **Disk space required:** `500 MB` — comfortable headroom over Node's actual ~200–300 MB footprint

That part's easy. The part the standard walkthroughs skip:

> **⚠️ Gotcha — developer machines already manage their own Node.js.** Node.js is a developer tool. A meaningful share of your target fleet — especially Engineering — likely already has Node.js installed and version-pinned through `nvm-windows`, Volta, or `fnm`, often per-project via an `.nvmrc` or `engines` field. Force-installing a machine-wide MSI on top of that doesn't just add a second Node.js — it competes for `PATH` precedence, and depending on order, can silently override the version a project actually needs, or make `where node` return a completely different binary than the one a developer's terminal was resolving to yesterday. This never throws an error. It just quietly changes which `node` runs.

The fix isn't "hope it doesn't collide" — it's a **custom requirement script** (PowerShell, returned via the Requirements tab's "Use a custom detection script" option) that checks for an existing `nvm-windows` installation (e.g., presence of `%APPDATA%\nvm` or the `NVM_HOME` environment variable) and reports the requirement as unmet if found, or an explicit **exclusion group** scoping the Engineering/Developer OU out of this app's assignment entirely and handling those machines through a separate, opt-in channel.

---

### Part 6 — Detection rules

**Recommended: native MSI detection.**

- **Rule type:** `MSI`
- **MSI Product Code:** auto-populated by Intune from the imported MSI
- **Version check:** `Yes`, operator `Greater than or equal to`, version `20.x.x`

Intune queries the Windows Installer database directly via Windows APIs — deterministic, and immune to false positives from leftover empty folders that a file-based rule could be fooled by.

**Alternative: file detection**, if you're not using MSI GUID matching:
- Path `C:\Program Files\nodejs`, file `node.exe`, method `String (version)`, operator `Greater than or equal to`, value `20.x.x`

> **⚠️ Gotcha:** Windows Installer version comparisons truncate to three segments (`major.minor.build`) — a 4-segment version string won't compare the way you'd expect if two builds share the same first three segments but differ in the fourth. Keep detection version strings to the 3-part form Node.js's own `ProductVersion` MSI property actually uses, and don't assume a finer-grained compare is happening under the hood.

---

### Part 7 — Dependencies and supersedence

**Dependency:** modern Node.js needs the **Microsoft Visual C++ Redistributable (x64)**. If you can't guarantee it's already on every target image, package it as its own Win32 app and mark it as a **Dependency** on the Node.js app with auto-install enabled — don't assume it's there.

**Supersedence**, for a `v18.x → v20.x` upgrade:
1. On the `v20.x` app's **Supersedence** tab, add the `v18.x` app.
2. Toggle **Uninstall previous version** — `Yes` for a clean reinstall, `No` to let the new MSI's own in-place major upgrade handle it.

> **⚠️ Gotcha:** Node's MSI already carries its own upgrade-code logic (`RemoveExistingProducts`), meaning it may already remove the old version as part of its own major-upgrade action — independent of anything Intune does. Setting supersedence to explicitly uninstall the previous version *in addition to* that built-in behavior can result in two separate removal attempts against the same product, occasionally surfacing as a confusing error on the second one. Test with **"No"** first and confirm the MSI's own upgrade path is sufficient before adding supersedence-driven uninstall on top of it.

Supersedence is only evaluated when both apps are assigned to overlapping groups, and only takes effect on the client's next check-in cycle (default roughly every 8 hours, or immediately if the user manually syncs from Company Portal).

---

### Part 8 — Assign, verify, then scale

**Stage 1 — Pilot (Required):**
1. **Apps** → **Windows** → **Add** → **Windows app (Win32)** → upload the `.intunewin` file, fill in Program/Requirements/Detection from Parts 3–7.
2. **Assignments** → add `Sec-Intune-Pilot-NodeJS` under **Required**.
3. Monitor **Apps** → **Monitor** → **Device install status**.
4. On a test device: open PowerShell, run `node -v` and `npm -v`, and check `C:\ProgramData\IntuneLogs\NodeJS_Install.log` for a clean exit.

**Stage 2 — Company Portal availability:**
The Required assignment above will never appear in Company Portal — that's expected, not a bug. If self-service install should also be an option (e.g., for machines outside the pilot group, or opt-in for Engineering machines you excluded in Part 5), add a **second assignment**, this time **Available for enrolled devices**, to whichever group should see it as a self-service option. Set the app's icon, description, and category under the app's **Properties** so it doesn't show up in Company Portal as a bare filename.

> **⚠️ Gotcha:** don't let this app's assignment intersect with an Autopilot Enrollment Status Page (ESP) that's configured to block on app installs, unless that's intentional. A stalled or failed Node.js install shouldn't be able to hold up a brand-new device's entire provisioning experience.

**Stage 3 — Production rollout:**
Move from a single pilot group to actual rings — Pilot → IT → Early Adopters → Broad → All Devices — each with a soak period (a few business days is typical) before promoting, plus an **exclusion group** for anything that shouldn't get this app at all (servers, VDI/ephemeral images, and the developer-managed exclusion from Part 5). At fleet scale, verification shifts from manual `node -v` checks to the **Device install status** report, a Graph API/CSV export, and — for ongoing drift rather than a one-time push — a Proactive Remediation script that periodically checks installed Node.js version against your current supported baseline, since Node.js LTS lines age out of support roughly every 30 months (faster for non-LTS releases) and a one-time deployment post doesn't answer "how do we know six months from now."

---

## Key Takeaways

**Requirements and detection rules answer different questions, at different times.**  
A requirement decides whether Intune attempts the install at all. Detection decides whether Intune believes it succeeded — and gets re-checked on every subsequent sync, not just once.

**"System" context and a per-user MSI don't automatically agree with each other.**  
Confirm your installer's actual per-machine assumption before trusting that `System` context alone guarantees a clean, detectable machine-wide install.

**A Product Code GUID is a per-version fact, not a per-app constant.**  
Copying last version's uninstall command into a new version's app config is one of the easiest supersedence mistakes to make, and it fails silently until an uninstall is actually attempted.

**The most dangerous collision for a dev tool like Node.js isn't Intune-specific — it's PATH precedence against a developer's own version manager.**  
This never throws an error. It just quietly changes which binary resolves, which is exactly why it needs an explicit requirement check or exclusion group rather than being left to chance.

**"Required" and "Company Portal visibility" are two separate decisions.**  
An app can be silently pushed, self-service available, or both — but only if you configure both assignment types. Required alone will never appear in Company Portal, regardless of how correctly everything else is configured.

**Supersedence can double up with an MSI's own upgrade logic if you're not careful.**  
Test whether the installer already handles its own major-version removal before assuming Intune needs to force an explicit uninstall of the prior version on top of it.

**"Cost" in an Intune context is a licensing tier and a bandwidth question, not a metered resource bill.**  
Nothing here needs the paid Intune Suite add-ons — core Win32 app management is included in the Intune Plan 1 license most Windows-managing tenants already have.

---

## Exam Alignment

**MD-102 — Manage and secure applications (15–20%):**
- Prepare applications for deployment by using Intune
- Deploy apps by using Intune, including Win32 apps
- Monitor app deployment status and troubleshoot installation failures by using Microsoft Intune

**MD-102 — Prepare infrastructure for devices (20–25%):**
- Plan and implement groups for devices in Microsoft Entra ID, including dynamic group membership rules

---

## Practice Questions

### Multiple Choice

**1.** A Win32 app installs successfully on a test device, but Intune reports it as "not installed" on every subsequent check-in. What's the most likely cause?
A. The requirement rule is misconfigured  B. The detection rule doesn't match how the app actually installed  C. The device is out of disk space  D. The return code mapping is wrong
<details><summary>Answer</summary>B. A successful install with a mismatched detection rule (e.g., checking a per-machine path when the app installed per-user) is exactly this symptom — Intune re-attempts install indefinitely because its own success check never passes.</details>

**2.** An app is assigned as "Required" only. Where does it appear for the end user?
A. In Company Portal, ready to install  B. Nowhere — it installs silently in the background  C. As a pending notification requiring approval  D. In Company Portal, marked "Pending"
<details><summary>Answer</summary>B. Required assignments are pushed silently by the Intune Management Extension and never surface in Company Portal — that requires a separate "Available" assignment.</details>

**3.** What does return code `1618` signal to Intune?
A. Success  B. A hard reboot is required  C. Another install is already in progress; retry automatically  D. The install failed permanently
<details><summary>Answer</summary>C — `ERROR_INSTALL_ALREADY_RUNNING`. Intune treats this as a fast-retry condition, not a failure.</details>

**4.** Why is a device group the correct assignment target for a machine-wide runtime like Node.js, rather than a user group?
A. Device groups sync faster  B. User-group assignment installs based on user logon to any device, not consistently on every target machine  C. User groups can't be assigned Win32 apps at all  D. There's no functional difference
<details><summary>Answer</summary>B. A user-targeted Required assignment installs when that user logs into whatever device they're on — the wrong model for "every machine in this group has this app," which needs device targeting instead.</details>

**5.** What's the risk of setting Supersedence to "Uninstall previous version: Yes" for an MSI that already has its own major-upgrade removal logic?
A. No risk — Intune always takes precedence  B. Two separate removal attempts against the same product, occasionally surfacing as an error on the redundant one  C. The new version silently fails to install  D. The old version is never removed
<details><summary>Answer</summary>B. The MSI's own upgrade-code behavior and Intune's supersedence-driven uninstall can both try to remove the same product, which is worth testing with supersedence uninstall set to "No" first.</details>

---

### Drag & Drop (match the Win32 app component to what it actually governs)

**Components:** Package · Program · Requirements · Detection Rule

**Governs:**
- Whether Intune attempts the install at all, before anything runs
- The install/uninstall command lines and restart behavior
- The `.intunewin` container produced by the Content Prep Tool
- Whether Intune considers the app already present, checked on every sync

<details><summary>Answer key</summary>Package → the `.intunewin` container. Program → install/uninstall command lines and restart behavior. Requirements → whether Intune attempts the install at all. Detection Rule → whether Intune considers the app present, re-checked every sync.</details>

---

### Short Answer

**1.** Why does the Node.js MSI's Product Code GUID need to be re-derived every time you package a new version, rather than reused from the previous app?
<details><summary>Answer</summary>The Product Code is a per-version identifier that Node.js's own MSI changes on essentially every release. Reusing the prior version's GUID in the new app's uninstall command points that command at the wrong product.</details>

**2.** What's the practical difference between a Required assignment and an Available assignment for the same Win32 app?
<details><summary>Answer</summary>Required pushes the app silently via the Intune Management Extension with no user interaction and never appears in Company Portal. Available lists the app in Company Portal for the user to install on demand — nothing happens until they choose to.</details>

**3.** Why might forcing a machine-wide Node.js MSI onto a developer's laptop cause a problem that never produces an error message?
<details><summary>Answer</summary>If the developer already manages Node.js via nvm-windows, Volta, or fnm, the MSI install changes PATH precedence rather than failing outright — `node` may silently resolve to a different binary/version than before, with no install-time error to flag it.</details>

---

### Scenario-Based

**1.** A Win32 app's detection rule checks for `node.exe` at `C:\Program Files\nodejs`, but the packaged MSI actually installs per-user under `%LOCALAPPDATA%`. What happens on every subsequent device check-in?
<details><summary>Answer</summary>Intune's detection rule never finds the app at the path it's checking, so it considers the app "not installed" and attempts to reinstall it on every check-in cycle — even though the install technically succeeded, just somewhere else.</details>

**2.** IT deploys Node.js as Required to all Windows devices, including Engineering laptops that already use nvm-windows with per-project `.nvmrc` pinning. Two weeks later, several developers report their terminal is resolving an unexpected Node.js version. What's the most likely explanation, and what should have prevented it?
<details><summary>Answer</summary>The machine-wide MSI install altered PATH precedence against the developers' own nvm-managed installs. A custom requirement script detecting an existing nvm-windows installation, or an explicit exclusion group for Engineering, would have prevented the app from targeting those machines at all.</details>

---

### Case Study: Contoso's Node.js Rollout

*Contoso Ltd. has validated the Node.js Win32 app on `Sec-Intune-Pilot-NodeJS` and wants to expand to all corporate Windows devices, while still allowing Engineering to opt in manually if they need the standardized version.*

**1.** What two assignment types, both on the same app, satisfy "silent push to most devices, but self-service optional for Engineering"?
<details><summary>Answer</summary>A **Required** assignment to the broad "All Devices minus Engineering" dynamic group, and a separate **Available** assignment to the Engineering group so those users can pull it from Company Portal if and when they choose to.</details>

**2.** Six months after rollout, how should Contoso confirm the fleet isn't quietly drifting onto an EOL Node.js LTS release, without manually checking every device?
<details><summary>Answer</summary>A Proactive Remediation script that checks installed Node.js version against the currently supported baseline on a recurring schedule, surfaced through Intune's device health reporting rather than manual per-device verification.</details>

**3.** Before promoting from the pilot ring to "All Devices," what report should Contoso check to confirm install health at scale rather than relying on individual `node -v` checks?
<details><summary>Answer</summary>The **Device install status** report under the app's Monitor tab (or its CSV/Graph API export), which shows aggregate success/failure/pending counts across every targeted device.</details>

---

## Licensing & Bandwidth Cheat Sheet

Intune doesn't meter Win32 app deployments the way Azure bills for resource consumption — the real cost considerations here are licensing tier and network bandwidth, not per-deployment charges:

| Action | Cost consideration | Why |
|---|---|---|
| Creating and assigning a Win32 app | Included in Intune Plan 1 | Bundled into M365 E3/E5, Business Premium, EMS E3/E5 — no extra charge |
| Packaging with the Content Prep Tool | Free | Runs locally, no Azure/Intune service call involved |
| Content delivery to devices | Bandwidth, not currency | Hosted via Azure Blob behind the scenes; Delivery Optimization can offload repeat downloads to peer devices on the same network |
| Company Portal listing (icon, description, category) | Free | Metadata only, no licensing implication |
| Proactive Remediation scripts for version drift monitoring | Included in Intune Plan 1 | Core feature, not an Intune Suite add-on |
| Intune Suite add-ons (Advanced Analytics, Cloud PKI, Remote Help, etc.) | Separate paid add-on | Not used anywhere in this lab — worth knowing the boundary so you don't assume a feature needs it when it doesn't |

---

## Cleanup

```powershell
# Remove the pilot assignment and app (Intune admin center, or Graph PowerShell)
# Portal: Apps > Windows > select the Node.js app > Properties > Assignments > remove
# Or via Graph:
Connect-MgGraph -Scopes "DeviceAppManagement.ReadWrite.All"
Remove-MgDeviceAppManagementMobileApp -MobileAppId <app-id>

# Remove the pilot group
Remove-MgGroup -GroupId <Sec-Intune-Pilot-NodeJS-group-id>
```

On each test device, confirm Node.js actually uninstalled (`node -v` should fail), and check `C:\ProgramData\IntuneLogs\NodeJS_Install.log` is gone or rotated before reusing the device for the next lab.

---

## References

- [Microsoft Learn — Intune Win32 app management overview](https://learn.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management)
- [Microsoft Win32 Content Prep Tool (GitHub)](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool)
- [Microsoft Learn — Win32 app detection rules](https://learn.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management#detection-rules)
- [Microsoft Learn — Win32 app dependencies and supersedence](https://learn.microsoft.com/en-us/mem/intune/apps/apps-win32-supersedence)
- [Microsoft Learn — Intune app assignment (Required vs Available)](https://learn.microsoft.com/en-us/mem/intune/apps/apps-deploy)
- [Microsoft Learn — Company Portal app for Windows](https://learn.microsoft.com/en-us/mem/intune/apps/company-portal-app)
- [Microsoft Learn — Proactive remediations](https://learn.microsoft.com/en-us/mem/analytics/proactive-remediations)
- [Microsoft Learn — Study guide for Exam MD-102: Endpoint Administrator](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/md-102)
