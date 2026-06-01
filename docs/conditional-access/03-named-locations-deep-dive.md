---
id: 03-named-locations-deep-dive
title: Named Locations — What They Actually Do
sidebar_label: "[03] · Named Locations Deep Dive"
---

# Named Locations — What They Actually Do

**Series:** Conditional Access  
**Format:** Concept + Lab  
**Difficulty:** Intermediate  
**Exam alignment:** SC-300 · AZ-500  

---

Named locations are one of the most misunderstood conditions in Conditional Access. Engineers assume they work like a firewall IP allowlist. They don't. This post explains the actual evaluation logic — then gives you a lab to see it for yourself.

---

## Before You Start

This post assumes you already know:
- How CA policy conditions work (users, apps, platforms, locations)
- What Grant controls and Block controls do
- How to read a sign-in log entry including the Conditional Access tab

**New to Conditional Access?** Complete [Challenge 02 — Conditional Access Policies on azurecertprep](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02) first, then come back here.

---

## The Concept

### What named locations actually are

A named location in Entra ID is a label you assign to one or more IP ranges or countries. You define it once, then reference it as a condition in CA policies. That's it — it's a reusable tag for a network boundary.

There are two types:

| Type | Based on | Use case |
|---|---|---|
| IP ranges | CIDR notation | Office networks, VPNs, trusted egress IPs |
| Countries | IP geolocation | Block sign-ins from specific regions |

### The evaluation model (this is what engineers get wrong)

Named location conditions do **not** evaluate the device's network position. They evaluate the **IP address that Entra ID sees on the sign-in request** — which is the egress IP of whatever is making the authentication request.

This matters because:
- A user on a corporate device using a split-tunnel VPN may egress to the internet directly — their sign-in will appear to come from their home ISP, not the corporate IP range
- A user connecting through a forward proxy will appear to come from the proxy's IP, not their actual network
- Entra ID does not know about your internal network topology — only the IP it sees on the HTTP request

### Trusted vs. non-trusted locations

You can mark an IP-based named location as **Trusted**. This flag:
- Affects **Identity Protection** risk scoring — sign-ins from trusted IPs get lower risk scores
- Can be used as a CA condition (`compliant network` check in some policies)
- Does NOT automatically exempt users from CA policies — trust is a signal, not a bypass

### The "All trusted locations" shortcut

When building a CA policy location condition, Entra ID offers "All trusted locations" as a pre-built option. This references every IP-based named location marked as trusted, dynamically — if you add a new trusted location later, it's automatically included.

---

## The Lab

### Step 1 — Create a named location for your office or VPN

Navigate to: `Entra > Protection > Conditional Access > Named locations > + IP ranges location`

- **Name:** `Corp-Office` (or `Corp-VPN` if using VPN egress)
- **IP ranges:** enter your office's egress IP in CIDR format (e.g., `203.0.113.0/24`)
- **Mark as trusted location:** ✅ checked

**Expected result:** Location appears in the Named locations list with a shield icon indicating trusted status.

---

### Step 2 — Create a CA policy that uses the location condition

Navigate to: `Entra > Protection > Conditional Access > Policies > + New policy`

Configure:
- **Users:** your own test account only
- **Cloud apps:** All cloud apps
- **Conditions > Locations:** Include `Any location`, Exclude `Corp-Office`
- **Grant:** Require multi-factor authentication
- **Enable policy:** Report-only

This policy means: require MFA for any sign-in that does NOT come from Corp-Office.

**Expected result:** Policy saves and appears in Report-only state.

---

### Step 3 — Sign in from two different network conditions and compare

Sign in to [myapps.microsoft.com](https://myapps.microsoft.com) twice:
1. While connected to the network whose IP you added in Step 1
2. While on a different network (home, mobile hotspot)

Check `Entra > Monitoring > Sign-in logs` for each sign-in. Open the Conditional Access tab and find your policy.

**Expected result:**
- Sign-in from Corp-Office network → `Report-only: Success` (excluded by location, MFA not required)
- Sign-in from other network → `Report-only: Failure` (not excluded, MFA would have been required)

---

### Step 4 — Check what IP Entra ID actually saw

In each sign-in log entry, check the **Location** tab (not the Conditional Access tab). It shows the IP address Entra ID evaluated. Confirm this matches your expectation.

If the IP shown is unexpected — a proxy, a CDN, a VPN exit node — that's your sign that the named location evaluation won't behave as you assumed.

**Expected result:** IP shown in sign-in logs matches the egress IP you defined in the named location.

---

## Key Takeaways

**Named locations evaluate egress IP, not network position.**  
If your user's traffic doesn't egress from a known IP, the location condition won't recognize them as "on-network." Split-tunnel VPNs and direct-to-internet breakouts are common causes of unexpected failures.

**Trusted status is a signal, not a bypass.**  
Marking a location as trusted affects risk scoring, not CA enforcement. A trusted location still gets evaluated by every CA policy unless explicitly excluded.

**"All trusted locations" is a dynamic reference.**  
Add it to your exclusion conditions once; it picks up new trusted locations automatically. Use it instead of listing individual locations — it's easier to maintain.

## Exam Alignment

**SC-300:**
- Configure Conditional Access policies — location conditions
- Troubleshoot Conditional Access — identifying why a location condition isn't matching

**AZ-500:**
- Implement Conditional Access — network-based controls

## References

- [Microsoft Learn — Conditional Access: Location condition](https://learn.microsoft.com/en-us/entra/identity/conditional-access/location-condition)
- [Microsoft Learn — Named locations in Entra ID](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-assignment-network)
- [azurecertprep — Challenge 02 — Conditional Access Policies](https://azurecertprep.github.io/docs/sc-500/identity-access-governance/challenge-02)
