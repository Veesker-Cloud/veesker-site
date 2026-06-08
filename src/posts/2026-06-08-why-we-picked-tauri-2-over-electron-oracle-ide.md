---
title: "Why we picked Tauri 2 over Electron for an Oracle IDE"
description: "Tauri 2 cut Veesker's installer to 12 MB, uses native OS WebViews instead of bundled Chromium, and hands security-sensitive work to a Rust backend that owns Oracle credentials properly."
date: "2026-06-08"
slug: "why-we-picked-tauri-2-over-electron-oracle-ide"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "tauri", "electron", "desktop-apps", "developer-tools"]
translation_slug: "por-que-escolhemos-tauri-2-em-vez-de-electron-oracle-ide"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Building a desktop developer tool in 2025 meant making one architectural choice before anything else: how do you render the UI? Native widgets — Qt, Win32, SwiftUI — are the performance ideal and the maintenance nightmare. A web renderer is the productivity win and the deployment liability. In the middle is a third path that became genuinely viable in the last two years: Tauri 2, which gives you the web UI layer you actually want to work in, backed by a Rust binary that owns the system integration and security primitives.

Electron was the obvious first consideration. It is proven, well-documented, and runs on everything. VS Code runs on it. GitHub Desktop runs on it. The problem is that Electron ships Chromium — not "uses a browser" in a vague sense, but ships a full copy of the Chromium browser embedded in your application, with its own V8, its own Node.js, its own process tree. On macOS, a bare Electron app lands at around 180 MB installed. An app that adds any meaningful dependency set crosses 200 MB without much effort. For a download going through corporate IT, that is a speed bump. For developers on slow VPN links, it is a patience test.

Veesker's installer is 12 MB on all three platforms. That is Tauri's actual impact, not a marketing number. Here is how that happens.

## The system WebView, not a bundled browser

Tauri 2 does not ship a browser. It asks the operating system for a WebView — WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux — and renders into that. Those WebViews are already on the machine as system components. Your application pays no download cost for them.

The trade-off is rendering consistency. Electron is Chromium everywhere: if something renders correctly in Chrome, it renders correctly in Electron. Tauri's three WebViews are not the same engine, and they do not share identical CSS and JS behavior. We ran into this with a `backdrop-filter` quirk on Linux WebKitGTK and a date-formatting inconsistency in Safari's JS engine on macOS. Both were one-line fixes once identified.

For a developer tool where the surface area is mostly tables, syntax highlighting, code editors, and panels, this is a tractable problem. The inconsistency risk is real but the surface is much smaller than it would be for a consumer app with rich animations and complex responsive layouts. We have shipped working UX on all three platforms; the edge cases are manageable, not showstoppers.

## Process model and memory

Electron's process model comes from Chromium: a main process, one or more renderer processes, a GPU process, utility processes. Each renderer is sandboxed and communicates with the main process via IPC. With three query tabs and a schema browser open, you are looking at four to six processes depending on the Electron version, and each renderer holds its own V8 heap. This is not a flaw in Electron — it is how Chromium is designed, and the isolation is the point — but it means memory scales with the number of open frames as much as with the data being handled.

Tauri 2's process model is simpler: one Rust process that owns the backend, one WebView process for the UI. The Rust backend handles all system calls, file I/O, database connections, and the IPC surface the frontend can reach. The WebView renders the React application and sends typed commands across the IPC bridge. There is no Node.js runtime in the rendering side. If the UI needs to do something that requires elevated access or a native API, it calls an explicitly defined Tauri command — a Rust function registered at app startup.

For an IDE with potentially a dozen Oracle connections open simultaneously, each backed by an OCI connection pool, the memory profile of the backend is driven by actual work: active connections, cached query results, schema metadata. The frontend pays what the UI framework and state cost. The two do not share a heap.

## Credentials and the security architecture

Every Oracle developer using Veesker stores credentials somewhere. Connection strings, passwords, wallet paths, wallet passwords. The correct place for those is the OS credential store — DPAPI on Windows, Keychain on macOS, Secret Service on Linux — not a plaintext JSON file in the app directory.

Tauri 2 makes this straightforward because the backend is Rust. The `keyring` crate gives a cross-platform abstraction over all three OS stores. Credentials are written to the OS store at connection save time and read back at connection open time. The WebView never sees a password in plaintext — the Rust command that opens a connection reads from the credential store and hands the OCI connection object directly to the connection pool. The JS layer sees only a connection handle and a session status.

In an Electron model, you can achieve something similar with native modules in the main process, but the architecture does not push you toward it. The natural path in Electron is for credentials to live in the Node.js main process memory, reachable from renderers if context isolation is not carefully maintained. Tauri 2 inverts this: the Rust backend owns secrets by design, and the WebView cannot reach across that boundary without an explicitly registered command.

For enterprise Oracle environments, that architecture matters. Security teams reviewing the tool for approval have a clear model to audit: credentials go into the OS store via a named Rust command, they come out of the OS store via a named Rust command, the web layer never handles them directly. That is an auditable surface.

## Oracle Instant Client initialization

Bundling Oracle Instant Client — the shared libraries that enable OCI Thick mode connections — requires the application to resolve a native library path at startup and call the OCI initialization routine before any connection is attempted.

In Electron, this means working around the ASAR archive format (which packages app files and doesn't play well with native library loading), using Electron's `app.getPath` helpers to find the right resource directory, and ensuring the OCI init fires from the main process before any renderer asks for a connection. It is solvable but requires care.

In Tauri, the Rust binary runs the OCI initialization in the main function before the WebView opens. There is no ASAR, no module system, no JavaScript in the path. The library path is resolved from the executable location and the bundled resource directory, OCI initializes, and every subsequent connection goes through Thick mode. The connection pool is a Rust struct that owns the OCI environment and hands connections out to commands as needed.

This is the architecture described in more detail in the [Thick mode auto-discovery post](/blog/oracle-9i-to-26ai-thick-mode-auto-discovery): the decision to always use Thick mode is enforced at the binary level, and Tauri's architecture makes that easier to guarantee than Electron's would have.

## What we actually gave up

The Tauri 2 choice is not free. The honest list:

**The npm backend ecosystem.** If a useful Oracle-related Node.js library existed that we wanted to run server-side, it does not run in Tauri's backend. Rust crates are the backend package story. For developer tool needs this is generally fine, and for anything OCI-related the Rust bindings are solid — but it is a real constraint if you were planning to lean on the Node.js ecosystem for backend logic.

**Community size.** Electron has years of documented solutions, conference talks, and Stack Overflow answers. Tauri 2 is newer and the community is smaller. We hit two non-obvious issues — a WebView2 bootstrapping edge case on fresh Windows Server installations, and a Linux system tray icon initialization race — that took real time to diagnose. The answers existed, but finding them required more digging.

**Some CSS predictability.** The multi-engine WebView situation described above is a real trade-off, not a footnote. It cost us a few hours of cross-platform testing on the initial build and occasionally surfaces when we ship new UI components. The cost is manageable; it is not zero.

## The outcome in numbers

Veesker's installer is 12 MB. Cold boot to usable UI takes under two seconds on a mid-range machine. Memory footprint with three active Oracle connections and a schema browser open sits well under 200 MB. These are not theoretical claims — they reflect the current shipping version on all three platforms.

The architecture choices made the hard things easier: credential storage, Thick mode initialization, a clean backend/frontend security boundary. The easy thing we gave up was the bundled Chromium, and the cost of not having it turned out to be lower than the cost of having it.

Veesker is free to download under Apache 2.0. The Community Edition runs fully offline — no cloud account required, no telemetry, no phone-home. If you manage an Oracle estate and want a tool built with this kind of care for the underlying architecture, [download Veesker](/download).

— *Veesker*
