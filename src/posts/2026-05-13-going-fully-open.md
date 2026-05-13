---
title: "Going fully open: one repo, one binary, all source public"
description: "The private Cloud Edition repository is being archived. All Veesker code — including premium features — is now in the public Apache 2.0 repository. A subscription still unlocks premium capabilities at runtime, but the source for every feature is public."
date: "2026-05-13"
slug: "going-fully-open"
lang: "en"
kind: "manifesto"
tags: ["open-source", "architecture", "transparency"]
read_minutes: 4
author: "geraldo+claude"
hero: "/datamap-hero.png"
---

For the past several months, Veesker shipped as two repositories: the public Community Edition under Apache 2.0, and a private Cloud Edition that held the source for premium features. The idea was standard open-core strategy — keep the paid code proprietary, sell access to it.

That model produced a friction we underestimated.

Every feature that crossed the CE/CL boundary required maintaining two parallel codebases. Every security fix had to be cherry-picked. Every schema browser improvement shipped first in CE, then ported to CL. The two repos drifted. Sprint B produced an auth nonce fix that landed in CL and took three weeks to reach CE. Sprint C's encryption work had to be duplicated. The maintenance surface was genuinely double.

More importantly, it contradicted what Veesker is for.

Veesker's pitch to DBAs and Oracle engineers is that it is trustworthy. It has a tamper-evident audit chain. It stores credentials in the OS keychain and never in plaintext. It runs AI queries through the sidecar, not the browser, so nothing touches `api.anthropic.com` without going through code you can read. That trustworthiness argument is weaker when a significant portion of the application is compiled from source you cannot inspect.

## What changed

As of 2026-05-13, the private `veesker-cloud-edition` repository is being archived. All of its code is migrating into the public [`veesker-community-edition`](https://github.com/Veesker-Cloud/veesker-community-edition) repository.

There is now one repository. One binary. One Apache 2.0 codebase.

Premium features — Veesker Vision (force-directed schema graph), VeeskerDB Sandbox (encrypted Oracle data slices), schema-aware AI — are in the public repo. Their source is readable, compilable, auditable. What a subscription provides is the runtime entitlement: when you authenticate to `api.veesker.cloud`, the API issues a feature flag that unlocks those capabilities in the running app. The gate logic is also in the public code. You can see exactly how it works.

This is the Docker model. Docker Engine is open source. Docker Desktop is open source. The paid plans give you commercial-use rights and hosted services — not access to hidden code. Veesker follows the same pattern.

## What this means for users

**If you use Veesker for free:** nothing changes in practice. You keep all the features you had. The binary you download is the same binary as before. The only difference is that the source for features you haven't unlocked is now visible.

**If you are a paid subscriber:** nothing changes in practice. Your subscription still unlocks the same premium features. The entitlement flow (authenticate → receive feature flag → features activate) works identically. The feature code is now open, which means you can audit exactly what you are paying to unlock.

**If you were watching the CL repo:** use the CE repo going forward. The CL repo will remain archived for historical reference but receives no new commits.

## On internal docs

As part of the cleanup, we removed internal planning documents from the public tree — implementation specs, AI session logs, architecture decision records. These were committed to the CL repo and were never intended as user-facing documentation. They contained no credentials or user data; the removal is about clarity, not concealment. The app's safety-critical code remains fully visible in the same files it has always been in.

## What is still private

The backend service — `api.veesker.cloud` — remains a private repository. It handles authentication, subscription entitlements, the VeeskerDB Sandbox relay, and billing. The desktop app's relationship to this backend is fully visible in the public code: the API calls, the data that passes through them, the trust model.

If you find a security issue in the backend service, report it to **security@veesker.cloud** the same as any other vulnerability.

---

The goal with this change is to make Veesker's trustworthiness argument complete. Every line of application code is now readable. The audit chain, the credential storage, the AI data path, the premium feature gates — all of it is in the open. That is the version of open source that actually means something for a tool that connects to production databases.
