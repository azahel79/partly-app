# Tequio — Product Context

<!-- impeccable:product-schema 1 -->

## Platform

Tequio is a responsive web application. Its public landing experience introduces the product, while authenticated areas support buyers, group hosts, providers, support staff, moderators, and administrators.

## Product Purpose

Tequio helps people in Mexico organize and share digital subscriptions so each member can pay only their corresponding portion. It brings group discovery, membership, payment evidence, credential access, support, and administration into one product experience.

## Users

- **Primary:** people in Mexico who want to join or share digital subscriptions and pay only their proportional share.
- **Group hosts and sellers:** people who create and manage subscription groups, members, payment periods, and access credentials.
- **Providers and wholesale operators:** people who fulfill or manage subscription inventory and orders.
- **Support, moderation, and administration:** internal operators who review evidence, resolve issues, manage commissions, and keep the marketplace trustworthy.

## Positioning

Tequio should feel like a trustworthy, clear, and approachable way to share subscriptions. Its differentiators are verified groups, prorated payments, protected credentials, and the Tequio Shield trust and protection promise.

The product should communicate practical savings without sacrificing security or clarity. It is not positioned as an anonymous listing board or as an automated payment processor.

## Operating Context

- The initial market and primary audience are in Mexico.
- The interface language is primarily Spanish.
- Payments and commissions currently rely on transfers, uploaded receipts, and human review rather than an automated payment gateway.
- The application is functional and under active development; production readiness still depends on consolidating documentation, tests, production configuration, and Git history.

## Core Capabilities

- Explore and compare available subscription groups.
- Create, join, and manage subscription groups and member profiles.
- Calculate and communicate proportional or prorated payment amounts.
- Upload, review, and track payment receipts.
- Protect and reveal shared credentials through controlled authenticated flows.
- Support commissions, wholesale operations, providers, support cases, and moderation.
- Present Tequio Shield as the product's trust and protection layer.

## Public Information Architecture

The public experience uses a shared navigation and footer shell across the home page, payment-cycle guide, comparison, security, terms, and privacy routes. These remain real routes for direct linking and search visibility; code-first product examples live inside the landing rather than creating a separate route for every mockup. Login, registration, the authenticated panel, and administration keep their own layouts.

The home page supports two explicit entry intentions: joining an existing group and publishing free spaces from a plan. Public inventory and plan comparisons should use active backend data whenever available. Network failures and empty catalogs must be explained with a recovery action instead of silently substituting invented availability.

## Constraints and Product Truth

- Do not imply that Tequio processes payments automatically while the flow depends on bank transfers and human verification.
- Do not present unverified adoption, savings, availability, or trust claims as real product data.
- The “10,000 usuarios” statement is **demonstrative content pending validation**. It must be visibly labeled as demonstrative or replaced before production; it is not evidence of actual usage.
- Product examples and previews may use representative data, but they must not be mistaken for live marketplace inventory or verified customer activity.

## Brand Commitments

- The product name is **Tequio**.
- Preserve the approved Tequio logo and wordmark proportions.
- Preserve the established green, deep navy, and warm cream visual identity.
- Preserve the current typography direction, recognizable structure, and friendly rounded character while improving hierarchy, consistency, accessibility, and polish.
- Future design work should refine the established product rather than replace its identity.

## Evidence on Hand

- Existing Angular landing page and authenticated application surfaces.
- Existing NestJS and PostgreSQL backend covering groups, payments, commissions, providers, support, and moderation.
- Existing Tequio wordmark, icon, dark variant, and platform logo assets.
- Existing responsive, focus-visible, and reduced-motion behaviors in the frontend styles.
- Product flows and interface examples are available in the repository; usage and adoption metrics are not currently verified.

## Product Principles

1. **Make trust visible.** Explain verification, protection, responsibilities, and review states where they affect a decision.
2. **Make each amount understandable.** Show what a person pays, why, when, and what evidence or action is still needed.
3. **Keep sharing human.** Use clear Spanish, friendly guidance, and recognizable people-and-group contexts without hiding important conditions.
4. **Protect access by default.** Treat credentials, receipts, and personal information as sensitive throughout the experience.
5. **Separate examples from facts.** Demonstrative content must be clearly identifiable and never presented as verified product performance.
6. **Improve without losing familiarity.** Build on the current structure, colors, typography direction, and interaction patterns.

## Accessibility and Inclusion

- Maintain keyboard-visible focus and meaningful interaction states.
- Respect reduced-motion preferences.
- Keep contrast, text sizing, touch targets, and responsive behavior suitable for common mobile and desktop use.
- Use direct, locally understandable Spanish and avoid assuming prior knowledge of subscription-sharing terminology.
- Never rely on color alone to communicate payment, verification, protection, or error states.
