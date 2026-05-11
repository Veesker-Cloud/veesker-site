---
title: "Sharing production data without leaking it: VeeskerDB Sandbox encryption design"
description: "How VeeskerDB Sandbox uses X25519 key exchange and ChaCha20-Poly1305 AEAD to share Oracle result sets between teammates without exposing plaintext to the relay."
date: "2026-05-11"
slug: "veeskerdb-sandbox-encryption-internals"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "security", "encryption", "sandbox"]
translation_slug: "veeskerdb-sandbox-criptografia-internos"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

The most dangerous moment in Oracle development is rarely a bad query. It is the moment someone needs production data to reproduce a bug.

The sequence is predictable. The bug only manifests with specific data shapes. The developer asks for a sample. The DBA exports a CSV from the production schema. The CSV travels through email or Slack. It lands on a laptop, gets opened in Excel, and three months later nobody remembers which services saw it in transit, where the file landed, or whether it was deleted. The data that was supposed to help fix a bug has quietly moved outside every governance boundary the organization thought it had.

This is not an edge case. It is the default workflow for teams that lack a governed data-sharing primitive. The alternative most teams reach for — a production-adjacent development database refreshed periodically — has its own failure modes: stale data, drift from production constraints, and a full DBA refresh cycle every time the schema changes.

VeeskerDB Sandbox (arriving H2 2026 as part of the Veesker Cloud layer) is designed around this problem. The core design principle is that the relay server — Veesker's infrastructure — should never hold plaintext at any point in the data path. Not in memory, not in logs, not in transit buffers. The encryption is end-to-end, between the sender's desktop and the recipient's desktop. The keys to decrypt never pass through our servers.

Here is the design.

## The threat model

Before the primitives, the threat model. What is the encryption actually defending against?

The primary concern is not an attacker who compromises the relay. The primary concern is the relay itself: a cloud service operated by a vendor who is not your company, subject to subpoenas you will never see, audited by processes outside your control, and staffed by engineers with administrative access. Even a fully trustworthy vendor cannot guarantee that a future legal order, a rogue insider, or a misconfigured log rotation policy will not expose data they never intended to retain.

The practical defense against this class of risk is straightforward: the vendor never holds plaintext. If the relay cannot read the content, it cannot leak it. There is no policy, no access control list, and no key management practice that is simpler than "we don't have the key."

A secondary concern is the network path itself. Encrypting transport with TLS protects against interception between client and relay, but TLS terminates at the relay — the server can read everything after termination. End-to-end encryption closes that gap: what arrives at the relay is already opaque ciphertext, regardless of what the transport layer does.

## X25519 key exchange

X25519 is Bernstein's elliptic-curve Diffie-Hellman function on Curve25519. It is the key exchange primitive in TLS 1.3, WireGuard, and Signal. The reason it is preferred over classic ECDH on NIST curves in security-conscious implementations is partly theoretical and partly practical: Curve25519 is specifically designed to minimize the risk of implementation bugs. The scalar multiplication runs in constant time by construction of the curve parameters, not by virtue of careful coding. The key size is fixed at 32 bytes, making key handling trivially correct.

The exchange in VeeskerDB Sandbox works as follows. Both the sender — the Veesker desktop instance creating the Sandbox share — and the recipient — the Veesker desktop instance receiving it — generate ephemeral X25519 key pairs. The public keys are exchanged through the relay. The relay sees the public keys and nothing else. Each party independently computes the shared secret using their own private key and the other party's public key. The result is identical on both sides by the Diffie-Hellman property.

Ephemeral key pairs matter here. The sender's private key is generated fresh for each Sandbox share and discarded after use. There is no persistent key material on either end that, if compromised at some later point, would allow decryption of historical shares. This property is called forward secrecy, and it means that a breach of either party's machine in the future does not retroactively expose Sandbox content from the past.

The 32-byte shared secret output from X25519 feeds directly into the symmetric cipher.

## ChaCha20-Poly1305

The encryption layer is ChaCha20-Poly1305, an authenticated encryption with associated data (AEAD) scheme standardized in RFC 8439. "Authenticated" is the critical word. The cipher simultaneously encrypts and authenticates: decryption fails loudly — with an explicit error, not silent corruption — if any bit of the ciphertext was modified in transit or at rest. A relay that tampers with a Sandbox blob does not produce garbled output. It produces a verification failure. Passive storage and silent modification are both detectable.

ChaCha20 is a stream cipher; Poly1305 is a message authentication code. The combination is used in TLS 1.3 cipher suites and is the cipher of record in WireGuard. It is also notably software-friendly. AES-GCM achieves high throughput on CPUs with hardware AES-NI instructions — most modern x86-64 chips — but on hardware without that acceleration, AES-GCM in software is substantially slower. ChaCha20-Poly1305 performs consistently in software across hardware generations. For a desktop application that needs to handle large Oracle result sets on older enterprise hardware, that consistency matters.

Each encryption operation uses a randomly generated 96-bit nonce. The nonce is included in the ciphertext envelope so the recipient can decrypt correctly. At the data volumes involved in Sandbox shares, a random 96-bit nonce space does not create practical collision risk.

## What passes through the relay

A VeeskerDB Sandbox upload is:

1. The Oracle result set serialized to a compact binary format.
2. That binary encrypted with ChaCha20-Poly1305 using the shared secret derived from the X25519 exchange.
3. The ciphertext uploaded to the relay, tagged with an opaque identifier.

The relay stores ciphertext. It holds the opaque identifier. It does not hold the shared secret, because the shared secret was computed locally from key material that never left the respective desktop instances.

When the recipient opens the share, their Veesker client fetches the ciphertext from the relay using the identifier and decrypts it locally with the shared secret they independently derived. The relay sees a download of an opaque blob. The plaintext result set is reconstituted on the recipient's machine. It never existed in decryptable form anywhere else in the path.

What a network log of the relay's activity would show: blob identifiers, byte counts, timestamps. No schema names, no column values, no SQL text, no row data.

## What this means for compliance

The encryption design matters most in regulated environments. Healthcare organizations running Oracle databases with patient records. Financial institutions with transaction data. Government agencies working with controlled information. For these organizations, the compliance question is not just "is the data encrypted in transit" but "who has theoretical access to plaintext, and can I audit it."

For VeeskerDB Sandbox, the answer is: the sender's Veesker instance and the recipient's Veesker instance. The relay operator — Veesker — holds ciphertext, metadata about transfer timing and blob size, and nothing beyond that. That answer is auditable, explainable to a compliance officer or a penetration tester, and does not depend on trusting Veesker's internal practices beyond "they do not possess the decryption key."

This is different from the typical enterprise SaaS position, which is "we encrypt at rest and in transit, and only authorized employees can access your data." The latter is a process guarantee. What we are describing is a cryptographic guarantee: the key does not exist on our infrastructure, so the data cannot be read regardless of what our processes say.

## The local-first foundation

One reason this architecture is feasible is that Veesker is local-first by design. The desktop application does not phone home. Credentials live in the OS keychain — DPAPI on Windows, Keychain on macOS, Secret Service on Linux. The core IDE works fully offline. The Cloud layer, including VeeskerDB Sandbox, is an opt-in extension that adds a managed relay, not a hosted service that the desktop is a thin client for.

That architecture means the cryptographic operations can happen entirely within the desktop application, where the keys live. A tool that required a server-side component to function would have to trust the server with more — keys, session state, schema context. Veesker's server is deliberately positioned as a content-addressed relay that moves blobs around, not a compute environment that processes data on behalf of clients.

The Community Edition, available now under Apache 2.0, gives you the full local-first Oracle IDE — schema browser, PL/SQL editor, AI query assistance grounded in your live schema and version — without any Cloud dependency. VeeskerDB Sandbox is a Cloud layer feature, and the Cloud layer is opt-in.

## Coming H2 2026

VeeskerDB Sandbox is in development. The encryption design described here reflects the intended architecture; specific implementation details may change before general availability. If you are evaluating tooling for a team with strict data governance requirements and want input into the design, the waitlist is where that conversation is happening.

Founder pricing is locked at $29 USD per seat per month for waitlist members.

**[Join the Veesker Cloud waitlist](/#waitlist)** — and help us get the data-sharing design right before GA.

— *Veesker*
