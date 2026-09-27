---
target: landing page de Partly
total_score: 16
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Azahel De Jesus\\Desktop\\APP-PLATAFORMAS\\frontend\\src\\app\\landing\\landing-page\\landing-page.html"
target_fingerprint: "sha256:73a9e2a2d9ac3da57fb79f77c82dd3dfd2000e8a9f548b2176493405a5b3c016"
target_path: "C:\\Users\\Azahel De Jesus\\Desktop\\APP-PLATAFORMAS\\frontend\\src\\app\\landing\\landing-page\\landing-page.html"
timestamp: 2026-09-26T17-42-56Z
slug: pp-landing-landing-page-landing-page-html-8eb93428
closed: true
---
# Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | Partial form feedback; several apparent controls are inert. |
| 2 | Match System / Real World | 1/4 | Automatic and instant payment claims conflict with the documented manual review flow. |
| 3 | User Control and Freedom | 3/4 | Navigation exits are present, but autoplay and no-op controls weaken control. |
| 4 | Consistency and Standards | 2/4 | Account creation and waitlist language are mixed. |
| 5 | Error Prevention | 2/4 | Basic validation exists, but misleading claims create expectation errors. |
| 6 | Recognition Rather Than Recall | 3/4 | Core flows are visible; decorative and icon-heavy areas add interpretation cost. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Strong hierarchy, but repeated sections, badges, proof panels, and motion add noise. |
| 9 | Error Recovery | 1/4 | Generic errors do not explain recovery. |
| 10 | Help and Documentation | n/a | Persuade surface. |
| **Total** | | **16/32** | **Acceptable, lower threshold** |

# Design Specificity Verdict

Partly has product-specific content: prorated cycles, group capacity, MXN values, host/member roles, Shield, credentials, and an interactive product tour. Its credibility layer is weaker than its visual authorship because the landing promises automation and verified adoption that are not supported by the real transfer, receipt, and human-review workflow.

The deterministic scan returned 21 warnings: one image without `src`, 13 accent borders on rounded cards, three side-tab accents, two gradient-text patterns, one functional 10px label, and one width transition. Browser automation was unavailable, so no reliable user-visible overlay was produced.

# Overall Impression

The landing opens confidently and explains a distinctive Mexico-first product, but becomes repetitive and least credible at the highest-trust moments. The biggest opportunity is to make the product tour the central proof while aligning every payment, social-proof, and conversion claim with actual behavior.

# What's Working

1. The product is shown with concrete prices, dates, occupancy, roles, and cycle states.
2. Localization is product-deep through MXN, CLABE, prorated joins, ARCO links, and family-plan context.
3. Responsive layouts, deferred sections, and reduced-motion branches show thoughtful implementation intent.

# Priority Issues

## P1 — Payment claims contradict the real operating model

The page promises automatic collections, instant wallet settlement, and receipt-free coordination, while the actual model uses transfers, uploaded receipts, and human review. Replace these claims with the exact sequence and label illustrative data.

## P1 — Primary CTA intent is inconsistent

The navbar opens registration while hero and final CTA behave as a waitlist. Use one truthful registration action and one expectation everywhere.

## P1 — Showcase controls do not deliver their implied action

Platform arrows, testimonial navigation, and wallet withdrawals are inert or simulated. Connect meaningful routes, make demos explicit, or remove the controls.

## P2 — Accessibility gaps affect conversion and compact demos

Form labeling, focus visibility, live status, touch targets, and microtext require improvement.

## P2 — Repeated proof competes with the strongest proof

Metrics, product tour, comparison, security, owners, and testimonials repeatedly explain the same value. Keep the tour central and reduce surrounding repetition.

# Persona Red Flags

- Jordan cannot tell whether the primary CTA creates an account or joins a waitlist.
- Riley finds contradictory payment/security claims and visible controls that do nothing.
- Casey encounters a very long mobile narrative, tiny carousel targets, and extensive visual motion.
- Mariana, a Mexico-based trust-sensitive member, cannot see the precise transfer, receipt review, dispute, and credential-access sequence.

# Minor Observations

- Navigation state and mobile menu labels do not reflect actual state.
- Social links are visibly unfinished.
- Comic Sans survives in annotations.
- Copyright is stale.
- Existing QA screenshots show the former brand and cannot validate the current UI.

# Questions to Consider

Questions skipped: the user requested all fixes in one pass.
