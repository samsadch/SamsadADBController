---
goal: Give Android developers — and now AI agents — full control of a connected device from inside their IDE, with zero terminal commands and zero network calls.
domain: Developer tooling / Android
audience: Android developers using Android Studio, IntelliJ IDEA, VS Code, and AI coding agents (Claude Code, Claude Desktop, Cursor, Antigravity)
status: building
---

# PROJECT.md — ADB Controller by Samsad

> Single source of truth for project status, decisions, and roadmap. Structure follows PMBOK 7 loosely; sections without real content are omitted rather than filled with placeholders.

---

## Project Identification

| Field | Value |
|---|---|
| **Project Name** | ADB Controller by Samsad |
| **Owner / Maintainer** | Samsad Chalil Valappil |
| **Repository** | https://github.com/samsadch/SamsadADBController |
| **Current Version** | 1.1.0 (JetBrains plugin + VS Code extension), MCP server 0.0.1 |
| **Status** | Building — v1.1.0 shipped, MCP server Phase 0 complete and published to npm |
| **Last Updated** | 2026-09-24 |

---

## 1. Project Charter

### 1.1 Purpose

Android developers lose time to repetitive `adb` invocations: clearing app data, flipping dark mode, seeding SharedPreferences, inspecting a Room database, simulating a dead battery. Each is a terminal round-trip that breaks flow. ADB Controller collapses them into a single IDE sidebar panel that works offline, with no account, telemetry, or cloud dependency.

The next phase extends the same capability surface to **AI coding agents** via a Model Context Protocol (MCP) server, so an agent can see the device screen, drive the app, and diagnose crashes without a human relaying observations.

### 1.2 Objectives

- Zero terminal commands for the common Android debug loop.
- Feature parity across JetBrains IDEs and VS Code.
- 100% offline — no telemetry, no external APIs, no login.
- **New:** expose the full capability surface to MCP-compatible agents with zero configuration.

### 1.3 Success Criteria

- An agent can install, launch, drive, observe, and diagnose an app end-to-end with no human intervention.
- MCP server installable via a single `npx` command, or auto-registered by the VS Code extension.
- No regression to the existing offline guarantee.

---

## 2. Current State

### 2.1 Shipped (v1.1.0)

Both surfaces are feature-complete and published.

| Surface | Location | Size |
|---|---|---|
| JetBrains plugin (Kotlin) | `src/main/kotlin/com/samsad/adb/` | ~2,400 lines / 6 files |
| VS Code extension (TypeScript) | `vscode-extension/src/` | ~1,500 lines / 3 files |
| Shared core (TypeScript) | `packages/adb-core/src/` | ~1,000 lines / 12 files |
| MCP server (TypeScript) | `packages/adb-mcp/src/` | ~300 lines / 6 files |

The JavaScript side is an npm workspace rooted at the repository root. `@samsadch/adb-core` holds
the capability layer and is consumed by both the extension and the MCP server; the extension's
`src/adbExecutor.ts` is now a thin VS Code binding that reads settings and injects them as
plain config.

**Feature set (both surfaces):** device & package selection with Gradle auto-detect · virtual hardware nav bar · app lifecycle (restart / clear data / force stop / uninstall / app info) · device toggles (dark mode / layout bounds / animations) · battery & doze simulator · live SharedPreferences table editor · SQLite Database Inspector with query + cell editing · app data export · deep link tester · broadcast & intent tester · screenshot to clipboard.

### 2.2 Known Technical Debt

| Item | Location | Impact |
|---|---|---|
| **Shell-redirect quoting bug — two features silently do nothing** | `adb-core/src/screenshot.ts`, `storage.ts` | See Issue I1 below |
| `AdbExecutor.kt` at 856 lines, over the 400-line module cap | `src/main/kotlin/com/samsad/adb/services/` | Hard to extend safely |
| `AdbMainPanel.kt` at 794 lines, over the 250-line component cap | `src/main/kotlin/com/samsad/adb/ui/` | Same |
| `adbViewProvider.ts` at 1,423 lines | `vscode-extension/src/` | Same |
| Hardcoded 10s timeout in Kotlin `runAdb()` | `AdbExecutor.kt:106` | Fixed on the TS side in Phase 0; Kotlin still affected |
| Kotlin executor still duplicates the shared TS core | JetBrains plugin | Every feature is built twice; unification deferred past Phase 7 |
| Placeholder vendor metadata (`support@example.com`) | `plugin.xml:4` | Should be corrected before next release |

### 2.2.1 Issue I1 — shell-redirect quoting

`AdbRunner` quotes any argument containing a space, so an argument that embeds a `>` redirect
is quoted along with it. The redirect therefore never reaches the host shell: adb forwards the
whole string and the redirect executes **on the device**, writing to a host path that does not
exist there. Two shipped features depend on that redirect and so silently produce nothing:

- `captureScreenshot` — reports "Screenshot saved to /tmp/…" but no local file is written, and
  the macOS clipboard copy then reads a missing file.
- `exportAppData` — the SharedPreferences half works; the **databases half exports zero files**
  and the count silently excludes them.

Both were faithfully preserved by the Phase 0 extraction rather than fixed, so the refactor
stayed behaviour-preserving; both are marked with `BUG (pre-existing…)` comments in the source.
The fix is the same for each: stream `exec-out … cat` into a local write stream, as
`DatabaseService.pull()` already does correctly. Scheduled with Phase 1, which rewrites
screenshot capture anyway. The Kotlin plugin uses a different code path and is unaffected.

### 2.3 Dropped from Scope

**Wireless debugging / ADB Wi-Fi 2.0 integration** — designed 2026-09-23, dropped 2026-09-24 in favour of the MCP server. Android Studio Quail 3 already ships QR/mDNS pairing natively, so the differentiator was limited to plain IntelliJ and VS Code users. Revisit if MCP work completes early. The `runAdb()` timeout fix identified during that design remains valid and is carried into Phase 0 below.

---

## 3. Scope — MCP Server

### 3.1 Design Principle

Claude Code can already invoke `adb` through a shell. A thin MCP wrapper around shell commands therefore adds **negative** value — more tools to choose from, identical capability. Every proposed tool must pass this filter:

| A shell can't... | ...so the server provides |
|---|---|
| Return images | Screenshots as multimodal `image` content |
| Hold state between turns | Sticky device/package target, logcat ring buffer with cursor |
| Parse reliably | Typed JSON from `dumpsys`, `uiautomator`, SQLite |
| Gate destruction | `destructiveHint` annotations + explicit confirm on writes |
| Run at all | Claude Desktop, Cursor, Antigravity — no shell available |

### 3.2 Architecture Decision

**Standalone Node/TypeScript MCP server** built on `@modelcontextprotocol/sdk`, sharing an extracted `AdbExecutor` package with the VS Code extension.

Rejected alternative — embedding the server in the JetBrains plugin: MCP clients expect stdio transport, but the IDE owns stdin/stdout. Embedding forces HTTP-on-a-local-port and adds "is the IDE running?" as a failure mode. The standalone binary serves every client, and the IDE plugins stay pure UI.

The Kotlin plugin retains its own `AdbExecutor` for now; unifying all three is out of scope.

### 3.3 Out of Scope

- Rewriting the JetBrains plugin to consume the shared package.
- iOS / non-Android device support.
- Any network-dependent feature (preserves the offline guarantee).

---

## 4. Work Breakdown Structure

### Phase 0 — Foundation ✅ complete (2026-09-24)

Extracted `vscode-extension/src/adbExecutor.ts` into `@samsadch/adb-core`, consumed by both the
extension and the server. Added adb path resolution, normalized errors (never raw stderr),
configurable per-call timeouts, and the target-state store.

**Delivered:** npm workspace at the repo root · `@samsadch/adb-core` (12 modules, every file
inside its DAK size cap) · `@samsadch/adb-mcp` server skeleton on stdio · VS Code extension
rewired to the core with its duplicate `databaseService.ts` deleted · 10 unit tests on the
parsing and error-mapping logic · verified end-to-end against a physical Pixel 8 Pro
(Android 17, SDK 37).

**Deviations from plan:** `AdbConfig` injection replaced the core's two `require('vscode')`
calls, so the capability layer no longer depends on the IDE. The MCP package is ESM while the
core stays CommonJS — the MCP SDK resolves its type declarations through the ESM path, and
mixing the two caused a types/runtime mismatch under CommonJS.

| Tool | Description | Agent use case |
|---|---|---|
| `list_devices` | Connected devices with model, API level, emulator flag | "Which devices are available?" |
| `set_target` | Pins device + package for all subsequent calls | Set once at session start |
| `get_device_info` | OS version, SDK level, density, screen size, battery, night mode | "What am I testing on?" |

Also consume MCP **roots** to auto-detect `applicationId` from Gradle in the client workspace, reusing the existing Auto Detect logic. This removes the package parameter from every later tool.

### Phase 1 — Eyes & Hands 👁️

The core capability. Ships the agent's ability to see and drive the app.

| Tool | Description | Agent use case |
|---|---|---|
| `take_screenshot` | PNG as multimodal `image` content, downscaled to ~1024px | "Is the checkout button aligned?" |
| `dump_view_hierarchy` | `uiautomator dump` → flat JSON: text, resource-id, content-desc, bounds, clickable | "Find the Submit button and its bounds" |
| `tap_element` | Taps by text / resource-id / content-desc, resolved via the hierarchy | "Tap Sign In" |
| `tap_coordinates` | Raw (x, y) fallback | When the hierarchy is unavailable |
| `input_text` | Types into the focused field | "Enter test@example.com" |
| `press_key` | Named keys: BACK, HOME, RECENTS, ENTER, LOCK, VOL± | "Press Back, verify the backstack" |
| `swipe_screen` | Directional or coordinate swipe | "Scroll to the bottom of the list" |
| `open_deep_link` | Dispatches a URI scheme / App Link | "Jump straight to the promo screen" |

`open_deep_link` sits here rather than with intents because for an agent it is *navigation* — one deep link replaces six taps.

### Phase 2 — Diagnostics 📋

| Tool | Description | Agent use case |
|---|---|---|
| `get_logcat` | Background ring buffer with a `since` cursor; filters by package/tag/level, hard line cap | "Show the last 50 OkHttp errors" |
| `get_crash_log` | Extracts `FATAL EXCEPTION`, ANR traces, and `Force finishing` blocks only | "Why did it crash after checkout?" |

The `since` cursor is what makes this beat a shell call — the agent reads only what is new since its last action instead of re-dumping the whole buffer each turn.

### Phase 3 — Lifecycle ⚡

| Tool | Description | Agent use case |
|---|---|---|
| `install_apk` | Installs from `build/outputs/apk/`, auto-selects the debug variant, `-r -t` | "Build and install on the emulator" |
| `app_control` | `action`: launch / restart / force_stop / clear_data / clear_and_restart / uninstall | "Clear data and test first-run" |
| `list_packages` | Filterable, debuggable-only option | "Is Play Services installed?" |

Completes the build → install → drive → verify loop. With Phases 0–3 an agent can perform a full manual QA pass unattended.

### Phase 4 — Storage 🗄️

| Tool | Description | Agent use case |
|---|---|---|
| `list_databases` | `.db` files under `/data/data/<pkg>/databases/` | "What Room DBs exist?" |
| `query_database` (read) | SELECT only by default, row limit enforced | "Was user 101 saved?" |
| `query_database` (write) | INSERT/UPDATE/DELETE — requires `confirm: true`, force-stops the app first | "Seed a test row" |
| `read_shared_prefs` | Key-values from any prefs XML | "Read `is_logged_in`" |
| `write_shared_prefs` | Sets a single key, not whole-XML replacement | "Set `show_onboarding=false`, verify startup" |
| `export_app_data` | Pulls DBs + prefs into the workspace | "Export so I can inspect locally" |

### Phase 5 — Environment 🔋

| Tool | Description | Agent use case |
|---|---|---|
| `power_sim` | `action`: battery_level / charging / doze_enter / doze_exit / app_standby / reset | "Battery 5%, check the low-power banner" |
| `display_toggle` | `action`: dark_mode / layout_bounds / animations | "Dark mode, screenshot, check contrast" |
| `send_broadcast` | Explicit/implicit intent with extras | "Send the push payload broadcast" |
| `open_app_settings` | System App Info screen | "Test the notification permission toggle" |

Return an explicit "emulator only" error where injection is unsupported on physical devices, rather than passing adb's stderr through.

### Phase 6 (original plan) — Resources & Prompts 📚

> Not built. Carried forward as a cross-cutting item in §9 — the phase number has been reused
> by the current roadmap.

**Resources (browsable state, no tool call required):**

- `adb://devices` — live device list
- `adb://device/info` — OS, SDK, density, battery
- `adb://device/screen` — current screenshot buffer
- `adb://{pkg}/prefs/{file}` — SharedPreferences contents
- `adb://{pkg}/db/{name}/schema` — database schema
- `adb://logcat/tail` — with `resources/updated` notifications

**Prompts (pre-packaged workflows):**

- `diagnose_crash` — crash trace + foreground activity + recent logs + DB state
- `verify_screen_ui` — screenshot + hierarchy + contrast / touch-target checks
- `test_deep_link_flow` — dispatch, screenshot destination, assert DB state
- `fresh_install_walkthrough` — clear data, launch, drive onboarding, report

### Phase 7 (original plan) — Packaging 🛠️

> Mostly delivered: `npx @samsadch/adb-mcp` is live, and the HTTP transport covers Android
> Studio. The VS Code `mcpServerDefinitionProvider` and the JetBrains "Copy MCP config" button
> remain unbuilt. The phase number has been reused by the current roadmap in §9.

| Target | Mechanism |
|---|---|
| Claude Code / Desktop / Cursor | `npx @samsadch/adb-mcp` |
| VS Code extension | `mcpServerDefinitionProvider` — auto-registers and spawns the server, zero config |
| JetBrains plugin | Bundled server executable + a "Copy MCP config" button that emits the correct JSON block |

Zero-config VS Code registration is the highest-value packaging item: it turns "install an extension" into "your agent can now drive Android" with no JSON editing.

---

## 5. Cross-Cutting Engineering Rules

| Rule | Rationale |
|---|---|
| Annotate every tool (`readOnlyHint` / `destructiveHint` / `idempotentHint`) | Required for an always-on ADB server to be safe to leave enabled |
| `confirm: true` on uninstall, clear_data, prefs writes, SQL writes | Agent loops amplify single mistakes |
| Hard caps on rows, log lines, UI nodes, and image dimensions | `dumpsys` and logcat output will otherwise exhaust a context window |
| Sticky target — never repeat device/package parameters | Cuts per-call tokens and a common class of agent error |
| Normalized errors with a suggested next action | "Device offline — run list_devices" beats raw stderr |
| Tool naming: flat for hot-path, grouped `action` enum for cold-path | Keeps the catalogue near 20 tools; agents degrade past ~20 |

---

## 6. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `query_database` write path clobbers live app writes — the pull/edit/push cycle loses anything the app wrote in between | High | High | Force-stop before write; require `confirm: true`; investigate on-device `run-as sqlite3` as the durable fix |
| R2 | `uiautomator dump` returns unusable trees for Jetpack Compose apps without `testTagsAsResourceId = true` | High | Medium | Document in the tool description; fall back to screenshot; detect and warn |
| R3 | Screenshot token cost (~1,500 tokens at full resolution) discourages agent use | High | Medium | Downscale to ~1024px before returning |
| R4 | Tool-catalogue bloat degrades agent tool selection | Medium | Medium | Group cold-path tools behind `action` enums; cap at ~20 tools |
| R5 | Duplicate Kotlin/TypeScript executors drift as MCP features land | Medium | Medium | Accept for now; shared package covers TS surfaces only; revisit post-Phase 7 |
| R6 | `uiautomator dump` fails on `FLAG_SECURE` screens and mid-animation | Medium | Low | Retry once after a short delay, then fall back to screenshot |
| R7 | Agent runs a destructive tool unprompted | Low | High | Annotations + confirm gates (see Section 5) |
| R8 | §9 Phase 7 build tools execute untrusted code **on the host** — a `build.gradle.kts` runs arbitrary JVM code at configuration time. Combined with `--http --allow-external` this is remote code execution on the developer's machine | Medium | Critical | Gate every build tool behind an explicit `--allow-build`, default off; refuse build tools outright on a non-loopback bind |
| R9 | Gradle builds outlive MCP client request timeouts — a cold build is minutes, clients give up far sooner | High | Medium | Job model: `gradle_build` returns a job id immediately; `get_build_status` / `get_build_log` poll. New infrastructure, not just another tool file |
| R10 | Catalogue reaches ~100 tools across Phases 6–13, degrading agent tool selection (extends R4) | High | Medium | Group each new phase behind `action` enums from the start; consider per-phase opt-in flags so a client loads only what it needs |

---

## 7. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-23 | Designed ADB Wi-Fi 2.0 integration | Android 17 + platform-tools 37 made mDNS pairing scriptable |
| 2026-09-24 | **Dropped** Wi-Fi integration | Studio Quail 3 ships it natively; differentiator too narrow |
| 2026-09-24 | Build an MCP server as the next major feature | Extends the whole capability surface to AI agents |
| 2026-09-24 | Standalone Node/TS server, not IDE-embedded | MCP clients expect stdio; the IDE owns stdin/stdout |
| 2026-09-24 | Share `AdbExecutor` between the server and VS Code extension only | Kotlin unification is disproportionate effort for the benefit |
| 2026-09-24 | Keep `AdbExecutor` as a facade over the new modules | Lets the 1,400-line `adbViewProvider.ts` keep its call sites unchanged |
| 2026-09-24 | Preserve the shell-redirect bug rather than fix it during extraction | Keeps the refactor behaviour-preserving and the diff trustworthy; fix scheduled with Phase 1 (Issue I1) |
| 2026-09-24 | MCP package is ESM, core stays CommonJS | The SDK's type declarations resolve through its ESM path |
| 2026-09-24 | Publish `0.0.1` from a laptop now, not `0.1.0` | Reserves the `@samsad` scope and proves the `npx` path; keeps `0.1.0` for the real Phase 1+2 release. Provenance is per-version, so a later move to GitHub Actions costs nothing |
| 2026-09-26 | Add a streamable HTTP transport alongside stdio | Android Studio's Gemini integration accepts only `httpUrl`; without it the server is unreachable from the IDE Android developers actually use |
| 2026-09-26 | Extend scope past the device, to the build → test → debug loop (§9) | The 51 shipped tools all act on an already-running app. The rest of a Kotlin developer's day — Gradle, tests, crashes, profiling — was entirely uncovered |
| 2026-09-26 | Build tools stay opt-in behind `--allow-build` | They execute untrusted host code, a materially different threat model from device shell commands (R8) |
| 2026-09-26 | Sequence Phases 6 and 9 first, defer Phase 7 | Both are small, add no new security surface, and cover the two failure modes hit in practice: no device attached, and hand-reading logcat. Gradle is the bigger prize but needs a job-model design pass (R9) |
| 2026-09-26 | Add Phase 13 (DataStore + process death) | The shipped storage tools target SharedPreferences and SQLite; DataStore is what Google now recommends, and nothing on-device decodes it. Process-death restoration is a common bug class with no convenient reproduction |
| 2026-09-26 | Reject five reviewed proposals as already shipped (§9.11) | `query_room_db`, `tap_element`, `type_text` and `inject_deeplink` duplicate existing tools; the `run-as` sandbox they describe already underpins `databaseService.ts`. Recorded rather than silently dropped, so the same ideas are not re-proposed |

---

## 8. Current Status & Next Steps

> ⚠️ **Sections 4–7 above are stale.** They describe the original Phase 0–7 plan. Phases 1–5
> have since been built (51 tools) outside the sessions that maintain this file; the phase
> tables have not been rewritten to match. Treat Sections 8 and 9 as current — §9 reuses the
> numbers 6 and 7 for new work.

**Status:** v1.1.0 shipped on both marketplaces. MCP server at **51 tools**, published at
`0.0.2`, with both stdio and streamable HTTP transports.

**Published** under the `@samsadch` scope (the `samsad` npm org was unavailable):

- [`@samsadch/adb-core`](https://www.npmjs.com/package/@samsadch/adb-core) — 0.0.1 on
  2026-09-24, 0.0.2 on 2026-09-26
- [`@samsadch/adb-mcp`](https://www.npmjs.com/package/@samsadch/adb-mcp) — verified via
  `npx -y @samsadch/adb-mcp` from a clean download

**HTTP transport (2026-09-26).** Android Studio's Gemini integration accepts only an `httpUrl`
and cannot spawn a stdio process, so the server gained a `--http` mode built on the SDK's
`StreamableHTTPServerTransport`. stdio remains the default, so existing configs are unaffected.

It binds to `127.0.0.1` only. These tools run arbitrary shell commands on the attached device
and read app data, so a non-loopback bind requires an explicit `--allow-external` and prints a
warning. DNS-rebinding protection is on, and each HTTP session gets its own server instance so
one client's sticky target never leaks into another's — verified with two concurrent clients.

**Lesson — CI runs a different Node than your laptop.** The publish workflow failed on
`node --test test/`: Node 26 resolves a bare directory, Node 22 tries to `require()` it. An
explicit glob (`test/*.test.mjs`) works on every version. Reproduce CI failures against the
runner's Node version before guessing.

**Lesson — `bin` paths must not start with `./`.** `npm publish` silently strips a `bin` entry
whose path is `./out/index.js`, leaving an installable package with no executable. `npm pack`
does *not* apply this normalization, so `pack`-based checks pass. It was caught only because
the publish log was read in full. Always scan publish output for `npm warn publish` lines, and
verify a release by installing the tarball and running `node_modules/.bin/<name>`.

**Immediate next steps:**

1. ✅ `0.0.3` published 2026-09-26 via the CI workflow, carrying the HTTP transport. End-to-end
   verification from Android Studio's MCP Servers panel still outstanding.
2. Start §9 Phase 6 (emulator lifecycle) and Phase 9 (crash intelligence).
3. Rewrite Sections 4–7 to match the 51 tools that actually shipped.
4. Backport the configurable-timeout fix to the Kotlin `AdbExecutor`.
5. Publish the site's marketplace links once the VS Code and JetBrains listings are refreshed
   for the MCP feature set.

**Open questions:**

- Whether the JetBrains plugin should bundle a Node runtime to launch the server, or just
  document the `npx` path.
- Whether to add ESLint to the workspace; there is currently no linter on the TypeScript side.
- Whether the npm description — which advertises databases, SharedPreferences, logcat and
  screenshots — should be trimmed until every claim maps to a shipped tool.

---

## 9. Roadmap — Phases 6–13

> Supersedes the Phase 6–7 entries in §4, which are retained only as a record of the original
> plan. Drafted 2026-09-26; nothing below is built. Phase 13 and several tools in Phases 7, 9
> and 12 were added later the same day from a second round of review — §9.11 records which
> proposals from that round were dropped as already shipped.

### 9.1 The gap this closes

All 51 shipped tools share one trait: **they act on an already-running app on an
already-attached device.** That is one half of Android work. The other half — build, test,
crash, profile — is entirely uncovered, and it is where a Kotlin developer spends most of the
day.

The clearest symptom: when the Pixel dropped off wireless debugging during the 2026-09-26
session, `list_devices` returned *"No devices connected"* and the agent had no tool with which
to fix it. It could drive a device but not obtain one.

The §3.1 filter still applies to every tool below — if a shell does it just as well, it does
not ship. Two things keep this honest:

- In Claude Code these tools compete with `Bash`, which can already run Gradle. In **Android
  Studio's Gemini they compete with nothing** — it has no shell at all. That is the real
  audience for Phases 7 and 8.
- Parsing is the other differentiator. `get_last_crash` beats `adb logcat | grep` because it
  returns *one structured exception*, not 10,000 lines for the model to wade through.

Feasibility was confirmed against the local SDK on 2026-09-26: `emulator`, `avdmanager`,
`sdkmanager`, `apkanalyzer` (all under `cmdline-tools/latest/bin` or `emulator/`) and `aapt2`
(`build-tools/36.0.0`) are present. `bundletool` is not, and would need resolving before any
AAB tool ships.

### 9.2 Phase 6 — Emulator & device lifecycle 📱

Unblocks every other phase. Today a missing device is a dead end.

| Tool | Backing command | Agent use case |
|---|---|---|
| `list_avds` | `emulator -list-avds` | "What can I boot?" |
| `start_emulator` / `stop_emulator` | `emulator -avd <n>` · `adb emu kill` | "Boot a Pixel 8 API 34" |
| `create_avd` | `avdmanager create avd` | "I need an API 30 device to reproduce this" |
| `wait_for_device` | `adb wait-for-device` + `sys.boot_completed` poll | Gate every later call on a *usable* device, not just a listed one |
| `pair_wireless` / `connect_wireless` | `adb pair` · `adb connect` | The §2.3 Wi-Fi work, resurfacing as a tool rather than a UI feature |
| `reboot_device` | `adb reboot` | "Reboot and check the boot receiver" |

Note `wait_for_device`: `adb devices` reports a device before it is ready, and the resulting
race is a classic flaky-automation source. Polling `sys.boot_completed` is the whole value.

### 9.3 Phase 7 — Gradle & build 🏗️

Highest value, heaviest design cost. An agent that cannot build cannot close the loop.

| Tool | Description |
|---|---|
| `gradle_build` / `gradle_clean` / `gradle_tasks` | The basics, via the job model below |
| `gradle_install_debug` | Assemble + install the debug variant |
| `build_and_launch` | Composite: assemble → install → start → tail logcat |
| `analyze_last_build_error` | Parse `./gradlew --scan` or raw build output; strip Kotlin-daemon and AGP-internal boilerplate; surface the **root** syntax / KSP / Hilt annotation-processing error |
| `audit_dependency_conflicts` | `app:dependencies` → BOM version skew, duplicate-class warnings, transitive mismatches |
| `clean_stale_caches` | Targeted invalidation of `.gradle/caches`, `.cxx`, build cache — not a scorched-earth wipe of the whole Studio cache |
| `run_android_lint` · `run_detekt` · `run_ktlint` | Static analysis, results returned parsed |

`analyze_last_build_error` is probably the single highest-value tool in this phase. An AGP
failure routinely buries the one real error — a missing Hilt `@Inject`, a KSP version
mismatch — under a thousand lines of daemon noise. Extracting the root cause is pure parsing,
which is exactly the §3.1 filter. `clean_stale_caches` matters because the usual remedy is
deleting everything and waiting ten minutes for a full re-index.

Two blockers must be solved before any of it ships:

1. **Host execution is a different threat model (R8).** Everything today runs on the *device*.
   Gradle runs arbitrary JVM code from `build.gradle.kts` on the *developer's machine*. Gate
   behind `--allow-build`, default off, and refuse entirely on a non-loopback bind.
2. **Builds outlive request timeouts (R9).** Needs a job model — `gradle_build` returns a job
   id, `get_build_status` and `get_build_log` poll. This is new infrastructure.

`gradle_dependencies` deserves note: dependency-conflict resolution is miserable by hand and
almost purely mechanical, which makes it unusually good agent work.

### 9.4 Phase 8 — Testing ✅

| Tool | Description |
|---|---|
| `run_unit_tests` | JVM tests via the Gradle job model |
| `run_instrumented_tests` | `connectedAndroidTest` — depends on Phase 6 for a device |
| `run_single_test` | `--tests "com.foo.BarTest.baz"` — the tight red/green loop |
| `summarize_test_report` | Parse the JUnit XML into pass/fail/trace, rather than making the agent read the HTML report |
| `capture_failure_screenshots` | Pull screenshots for failed instrumented tests |

`summarize_test_report` is the one that passes §3.1 most clearly — the raw report is HTML built
for a browser, and parsing it is exactly what a shell cannot do reliably.

### 9.5 Phase 9 — Crash, ANR & stacktrace intelligence 🔍

`get_logcat` exists but returns a firehose. This phase is where Kotlin specifically hurts:
coroutine stacks are deep and noisy, and R8 makes release traces unreadable.

| Tool | Why it beats a shell |
|---|---|
| `get_last_crash` | Returns the last `FATAL EXCEPTION` block for a package, parsed — not the surrounding 10k lines. Includes the app's own preceding log lines (ViewModel / state logs) as crash context, since the exception alone rarely explains *why* |
| `deobfuscate_stacktrace` | R8 `retrace` against `mapping.txt`; turns `a.b.c(SourceFile:1)` into real symbols |
| `get_anr_trace` | Pulls `/data/anr/traces.txt`, isolates the blocked main thread, and reports **lock contention and deadlock cycles** — which thread holds the monitor the main thread is waiting on |
| `get_tombstone` | Native/NDK crashes |
| `tail_logcat_filtered` | Package + level + tag, with the app's PID resolved automatically |
| `watch_for_crash` | Run an action, report any crash it caused — closes the act/observe loop |

Supersedes the `get_crash_log` sketch in §4 Phase 2.

### 9.6 Phase 10 — Performance & profiling 📊

`get_startup_time` (`am start -W`, cold/warm) · `get_frame_stats` (`dumpsys gfxinfo` → jank
percentiles) · `dump_heap` (hprof for leak hunting) · `get_network_stats` ·
`record_perfetto_trace` · `generate_baseline_profile`

`get_app_memory` already ships and belongs to this family.

Perfetto traces are large binary artifacts — the tool must return a *path and a summary*, never
the trace itself, or it will exhaust a context window (cf. R3).

### 9.7 Phase 11 — APK / AAB inspection 📦

| Tool | Backing tool |
|---|---|
| `inspect_apk` | `aapt2 badging` — min/target SDK, permissions, activities |
| `apk_size_breakdown` | `apkanalyzer` |
| `compare_apks` | Size regression between two builds — "what did this PR cost us?" |
| `list_manifest_permissions` | Merged-manifest permissions, with the library that introduced each |

AAB support needs `bundletool`, which is not installed locally (§9.1).

### 9.8 Phase 12 — Compose & modern UI 🎨

`dump_view_hierarchy` returns the legacy View tree, which is largely **empty for a Compose
app** — this is R2, and it worsens as the ecosystem moves to Compose.

| Tool | Description |
|---|---|
| `dump_compose_semantics` | The Compose semantics tree, including `testTag` |
| `capture_annotated_screen` | Screenshot **with element bounding boxes and coordinates drawn on it** |
| `get_recomposition_counts` | Find the composable re-rendering 400 times a second |
| `accessibility_audit` | Touch-target size, contrast, missing content descriptions |
| `screenshot_diff` | Visual regression between two captures |

`capture_annotated_screen` is the standout, and it is not Compose-specific — it works against
the legacy View tree too. Today an agent needs two calls to act on a screen (`take_screenshot`
to see it, `dump_view_hierarchy` to locate anything) and must then correlate a picture with a
JSON tree by hand. One image with the boxes already drawn collapses that into a single call
and removes the correlation step entirely, which is where agents currently misfire. It is
independently shippable ahead of the rest of this phase — see §9.10.

Extending the shipped `tap_element` to resolve `testTag` follows directly from
`dump_compose_semantics`; it is an upgrade to an existing tool, not a new one.

This phase retires R2 rather than mitigating it.

### 9.9 Phase 13 — Modern state & process lifecycle 🧬

Added 2026-09-26. The shipped storage tools cover SQLite and SharedPreferences — the state APIs
of 2015. Two gaps remain, both confirmed absent from the codebase (zero references to
`DataStore` or `am kill`).

| Tool | Description |
|---|---|
| `inspect_datastore` | Decode and read **Jetpack DataStore** — both Preferences and Proto — straight off the device |
| `write_datastore` | Set a single key, mirroring the existing `set_shared_preference` semantics. `confirm: true`, per §5 |
| `trigger_process_death` | `am kill <pkg>` (background kill, *not* force-stop), then relaunch — reproducing exactly what Android does under memory pressure |

**Why `inspect_datastore` matters:** DataStore is Google's recommended replacement for
SharedPreferences, so the shipped prefs tools are aimed at a shrinking target. It is also
strictly harder — the files are Protobuf, not XML, so there is no shell one-liner. Proto
DataStore additionally needs the app's `.proto` schema to decode meaningfully; Preferences
DataStore uses a known internal schema and should ship first. Today the only way to see this
state is to add temporary logging and rebuild.

**Why `trigger_process_death` matters:** restoring from background process death is one of the
most commonly broken paths in Android apps, because testing it by hand means backgrounding the
app and waiting for the system to reclaim it — or fishing the "Don't keep activities" toggle
out of Developer Options, which is a blunter simulation. `am kill` reproduces it on demand,
making `SavedStateHandle` and `rememberSaveable` restoration directly testable. Note the
distinction from the shipped `stop_app`: `am force-stop` clears state that a real system kill
leaves behind, so force-stop is the *wrong* primitive for this test and would give a false pass.

### 9.10 Carried forward — Resources & Prompts

The original §4 Phase 6 (MCP resources such as `adb://devices` and prompts such as
`diagnose_crash`) was never built and is not scheduled here. It is now more valuable, not less:
`diagnose_crash` becomes a genuinely strong prompt once Phase 9 lands. Treat it as a
cross-cutting item to revisit after Phase 9.

### 9.11 Already shipped — deliberately not re-scoped

Several proposals reviewed on 2026-09-26 describe tools that already exist. Recorded here so
the roadmap does not re-promise them, per the convention-before-creation rule:

| Proposed | Shipped equivalent |
|---|---|
| `query_room_db` | `query_database`, `list_databases`, `list_database_tables`, `get_table_schema`, `get_table_data`, `inspect_database_overview` — already read-only by default with a row cap, and already via `run-as` |
| `tap_element`, `type_text` | `tap_element`, `input_text` |
| `inject_deeplink` | `open_deep_link` |
| `tail_crash_trace` | Folded into §9.5 `get_last_crash` + `watch_for_crash` |
| `dump_anr_traces` | Folded into §9.5 `get_anr_trace`, which gained deadlock detection from it |

The `run-as` sandbox mechanism these describe is already the foundation of
`databaseService.ts`. What was genuinely missing was never the access path — it was DataStore
decoding (§9.9) and Compose-aware targeting (§9.8).

### 9.12 Sequencing

| Order | Phases | Rationale |
|---|---|---|
| Quick win | `capture_annotated_screen` (§9.8) | Does not depend on the rest of Phase 12. Halves the call count for every UI interaction and removes the screenshot↔hierarchy correlation step agents get wrong |
| 1st | **6 + 9** | Small, no new security surface, and they cover the two failure modes actually hit: no device attached, and hand-reading logcat. Phase 9 is where an agent clearly beats a human — retracing a stack is mechanical work nobody enjoys |
| 2nd | **13** | Small, self-contained, and reuses the existing `run-as` plumbing. `trigger_process_death` is a handful of lines for a bug class that is otherwise painful to reproduce |
| 3rd | **7**, then 8 | Biggest prize, but needs the job model (R9) and the `--allow-build` gate (R8) designed first. Phase 8 is nearly free once 7 exists. If Phase 7 must be cut to one tool, make it `analyze_last_build_error` |
| 4th | 11, 12 | Independent of the rest; 12 retires R2 |
| Last | 10 | Most valuable with a mature app under test, least valuable in isolation |
