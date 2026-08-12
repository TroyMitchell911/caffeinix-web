# Caffeinix browser demo plan

## Goal

Replace the server-hosted QEMU service with a static GitHub Pages site that
runs Caffeinix entirely on the visitor's machine.

The final runtime path is:

```text
web schedule or manual sync
    -> read the configured Caffeinix main commit
    -> compare it with guest.lock
    -> require successful kernel build and QEMU runtime checks
    -> build a pinned kernel and ext4 root image
    -> build a pinned qemu-system-riscv64 WebAssembly runtime
    -> publish immutable assets through GitHub Pages
    -> load the site in a visitor's browser
    -> run OpenSBI, Caffeinix, and BusyBox inside browser QEMU
    -> connect the browser terminal directly to the emulated UART
```

GitHub Pages only distributes static files. It does not execute QEMU, keep
sessions, proxy a terminal, or provide guest CPU and memory. Each visitor runs
an independent guest using that visitor's browser resources.

## Current integration state

The Caffeinix kernel repository currently has no web-specific commit or
cross-repository notification. Keep it that way. Its
`.github/workflows/ci.yml` runs `Kernel build` and `QEMU runtime` for pull
requests and pushes to `main`. Commit `f4c1034` (`ci: boot Caffeinix under
QEMU`) established that general runtime CI, but it is not coupled to
`caffeinix-web`.

The web workflow polls Caffeinix hourly and compares upstream `main` with
`guest.lock`. It owns guest discovery, browser testing, publication, and
deployment; Caffeinix owns its normal kernel build and QEMU runtime checks.

Caffeinix must contain no web repository name, dispatch event, web token,
Pages job, or web-only branch trigger. Forking or pushing Caffeinix therefore
runs only its normal kernel CI and can never notify or deploy this site.

## Repository reset

The existing `caffeinix-web` history describes the superseded Go, WebSocket,
Docker, GHCR, and Render design. Do not retain that history as ancestors of
the new `main` branch.

Develop and test the replacement on disposable local branches or worktrees.
After the final design passes all acceptance checks:

1. Verify that `origin` is still
   `git@github.com:TroyMitchell911/caffeinix-web.git`.
2. Verify that remote `main` has not moved from the value observed before the
   rewrite. Stop if it has moved unexpectedly.
3. Create an orphan branch with no parent commit.
4. Assemble the reviewed final patch series directly on that orphan branch.
5. Confirm that no commit in the new series can reach the old root.
6. Replace remote `main` with `git push --force-with-lease`.
7. Remove remote branches or tags that still retain the old history. At plan
   creation time the remote has only `main` and no tags.
8. Verify the remote commit graph and the deployed Pages site.
9. Remove obsolete local branches that retain the old history after the new
   site has been validated.

`--force-with-lease` provides the requested history replacement while refusing
to overwrite an unexpected concurrent update. A force-push removes references
to old commits; it does not guarantee that GitHub immediately garbage-collects
unreachable objects. This reset is for a clean public history, not secret-data
purging.

This is a one-time reset. Subsequent development uses normal reviewed,
fast-forward history and must not routinely force-push `main`.

## Final patch series

Build the new root history as a small Linux-style series. Fold tests and
documentation into the patch that introduces the corresponding behavior.

1. `web: run Caffeinix in the browser`
   - Add the static terminal and browser QEMU integration.
   - Connect terminal input and output directly to the emulated UART.
   - Add start, stop, reset, boot progress, and error handling.
   - Add cross-origin isolation support required by WebAssembly threads.
   - Remove the Go server, WebSocket protocol, and server-side QEMU model.
2. `build: package reproducible browser assets`
   - Pin QEMU-WASM, Caffeinix, OpenSBI, BusyBox, and musl inputs.
   - Build the kernel, root image, WebAssembly runtime, worker, and metadata.
   - Generate immutable asset names and a checksummed manifest.
   - Preserve licenses, notices, provenance, and corresponding source access.
   - Remove Docker, Render, and GHCR release machinery.
3. `ci: publish the browser demo`
   - Test the static site and boot the guest in a headless browser.
   - Publish only generated static output with GitHub Pages Actions.
   - Update the pinned guest only after the matching Caffeinix commit passes
     its authoritative kernel and QEMU workflows.
   - Poll the configured upstream and adopt a newer tested main commit.

Every commit must be buildable, use a Linux-style subject, wrap its message at
72 columns, and carry a `Signed-off-by` trailer. Temporary experiments and
fixup commits must not appear in the new root history.

## Polling update contract

Caffeinix is the source of truth for kernel correctness. The web repository
is the source of truth for browser packaging and Pages deployment. Do not
copy browser build logic into the kernel repository or make kernel tests
depend on Pages availability.

The web workflow runs hourly at minute 23 (`23 * * * *`) and by manual
dispatch. The off-hour minute avoids concentrating work at the top of the
hour. It reads the configured upstream repository and branch, resolves the
branch to a full commit ID, and compares that ID with `guest.lock`. If they
are equal, the run ends without building, committing, or deploying anything.

Before adopting a different commit, the web workflow independently verifies
that:

- the configured repository and branch match the production allowlist;
- the branch resolves to a full valid object ID;
- `Kernel build` and `QEMU runtime` both completed successfully for that
  exact commit;
- the commit is still the current head of the configured branch immediately
  before promotion;
- the commit differs from the one recorded in `guest.lock`.

If the checks are missing, running, cancelled, or failed, exit successfully
without changing production. The next scheduled run tries again. If two
scheduled runs overlap, repository concurrency serializes promotion and the
later run rechecks both the branch head and `guest.lock` before writing.

Keep the production source explicit in a tracked lock or configuration file:

```text
CAFFEINIX_REPOSITORY=https://github.com/TroyMitchell911/caffeinix.git
CAFFEINIX_BRANCH=main
CAFFEINIX_COMMIT=<last adopted full commit ID>
```

The production schedule must never accept repository, branch, commit, or
deploy-mode overrides from untrusted event payloads. Candidate testing uses a
separate manual path that cannot reach the production commit or deployment
jobs.

The configured Caffeinix repository is public, so discovery and check lookup
require no cross-repository write credential. Only the web workflow receives
write permission to update its own lock and deploy its own Pages site. Never
add a web token or secret to Caffeinix.

## Source and generated artifacts

Keep source, lock files, build scripts, tests, and documentation in Git. Do
not commit generated WebAssembly, kernel, root filesystem, or source archives
to repository history.

GitHub Actions publishes a Pages artifact containing at least:

```text
index.html
assets/app-<version>.js
assets/app-<version>.css
assets/qemu-system-riscv64-<version>.wasm
assets/qemu-system-riscv64-<version>.worker.js
assets/opensbi-<version>.bin
assets/kernel-<caffeinix-commit>
assets/root-<caffeinix-commit>.ext4
assets/manifest.json
sources/
```

Use relative or base-aware URLs so the application works below the
`/caffeinix-web/` GitHub Pages project path. Keep the complete published site
below the GitHub Pages size limit and keep individual downloads small enough
for practical cold starts.

The manifest records source repositories, exact commits or release tags,
build configuration, sizes, and SHA-256 hashes. The kernel and root image must
always come from the same Caffeinix commit.

## Phase WEB1: prove the RISC-V browser runtime

Status: completed.

The pinned QEMU-WASM runtime boots the pinned Caffeinix guest through OpenSBI
with one or two harts. The measured configuration uses a 512 MiB fixed
WebAssembly heap, 64 MiB guest RAM, and a 16 MiB writable ext4 root. Browser
startup downloads 30.6 MB; smaller WebAssembly heaps failed during guest boot.

- Pin a reviewed QEMU-WASM revision instead of tracking its moving branch.
- Build only the `riscv64-softmmu` target and required firmware assets.
- Boot the current Caffeinix kernel and ext4 root image through OpenSBI.
- Prove UART input and output without a WebSocket or local helper process.
- Measure WebAssembly size, startup time, browser memory, and idle CPU use.
- Determine a safe fixed WebAssembly memory budget from measurements rather
  than inheriting QEMU-WASM's large example allocation.
- First prove one hart, then prove at least two harts with MTTCG.

Acceptance:

- a locally served static directory boots to the Caffeinix shell;
- `echo`, `pwd`, `ls`, `cat`, `mkdir`, `touch`, `cp`, and `rm` work;
- terminal input remains interactive after repeated command execution;
- stopping and restarting produces a fresh guest;
- one- and two-hart guests boot without a browser-side deadlock;
- no process other than the static test server runs on the host.

## Phase WEB2: replace the server application

Status: completed.

- Retain the existing visual language where useful, but remove all API and
  WebSocket assumptions.
- Run QEMU in browser workers so boot and guest execution do not block the UI.
- Display download, verification, initialization, firmware, kernel, and shell
  readiness separately.
- Feed xterm.js directly from the QEMU terminal device.
- Keep the QEMU command line in reviewed application code; do not accept raw
  command-line input from URL parameters or visitors.
- Provide reviewed one- and two-hart choices only. Default to two harts and
  64 MiB of guest RAM inside the measured 512 MiB WebAssembly heap.
- Run the ext4 image as an in-memory snapshot. Do not silently persist guest
  writes across sessions.
- Cache immutable downloads using browser storage, while Reset always creates
  a clean guest from the published image.
- Keep all executable assets same-origin and avoid runtime CDN dependencies.

Guest networking and persistent disks are out of scope. Browser guests cannot
open arbitrary host sockets; networking would require a separately designed
WebSocket or WebTransport proxy.

Acceptance:

- no Go, Docker, Render, GHCR, WebSocket, or server session code remains;
- two visitors can run guests independently with no shared backend state;
- closing a tab terminates its workers and releases guest resources;
- a failed or unsupported browser receives a useful diagnostic;
- a warm reload reuses verified cached assets;
- the generated site contains no absolute `/` paths that break project Pages.

## Phase WEB3: enable WebAssembly threads on Pages

Status: completed.

- Serve the application over HTTPS.
- Establish cross-origin isolation for `SharedArrayBuffer` and pthread-backed
  QEMU workers.
- Because GitHub Pages cannot configure arbitrary COOP and COEP headers, pin
  and audit `coi-serviceworker` and load it from the same origin.
- Detect `crossOriginIsolated` before starting QEMU and fail clearly if the
  service worker cannot establish it.
- Ensure the worker, WebAssembly, firmware, kernel, and root image are all
  available under the service worker scope.
- Test the required initial service-worker registration and reload behavior.

Acceptance:

- `crossOriginIsolated` is true before QEMU starts;
- WebAssembly workers start on the GitHub Pages project URL;
- one- and two-hart boots pass on current desktop Chromium and Firefox;
- an update cannot mix old JavaScript with a new worker or guest image;
- all third-party browser code is pinned and covered by notices.

Safari and mobile browsers are best-effort until their memory, worker, and
cross-origin-isolation behavior has been measured. They must fail cleanly
rather than hanging or presenting a dead terminal.

## Phase WEB4: make guest publication reproducible

Status: completed.

Two clean guest builds produce byte-identical kernel, OpenSBI, and ext4 image
outputs. Published asset paths incorporate content hashes, and the manifest
verifies every file before release and every runtime input before boot.

- Keep a lock file for the exact Caffeinix commit and every external input.
- Reuse Caffeinix's supported test rootfs builder rather than maintaining a
  second userspace recipe in this repository.
- Build the kernel and root image from one checkout and record both hashes.
- Produce corresponding-source archives or durable exact-source links needed
  by the licenses of distributed binaries.
- Separate the rarely changing QEMU-WASM engine cache from per-Caffeinix guest
  assets.
- Never trust a cache without incorporating source revision, compiler version,
  configuration, and relevant patches into its key.
- Make a local release command produce the same Pages directory as CI.

Acceptance:

- two clean builds from identical locked inputs produce equivalent manifests;
- the manifest's hashes match every booted binary;
- changing `guest.lock` cannot retain a stale kernel or root image;
- a normal checkout contains no generated binary blobs;
- all distributed components have recorded source and license provenance.

## Phase WEB5: test and deploy through GitHub Actions

Status: completed.

The local suite boots desktop Chromium, mobile Chromium emulation, and desktop
Firefox through the same service-worker isolation path required by Pages.
It covers one and two harts, UART input, ext4 writes, Stop, and clean restart.
The final orphan history is also executed by `act` before publication.

- Run formatting, JavaScript, manifest, license, and static-path checks.
- Serve the exact candidate Pages directory in a headless browser test.
- Assert cross-origin isolation before launching the emulator.
- Boot through OpenSBI, wait for the shell prompt, execute a command, and
  verify its serial output.
- Exercise both one- and two-hart guests. Keep native QEMU CI in Caffeinix as
  the authoritative SMP, timing, and performance test environment.
- Upload the generated directory with the official Pages artifact action and
  deploy it with the official Pages deployment action.
- Use `pages: write` and `id-token: write` only in the deployment job.
- Serialize deployments so an older workflow cannot replace a newer guest.
- Publish from Actions, not a generated `gh-pages` branch.

Guest update policy:

1. On the scheduled or manual production run, resolve the configured
   Caffeinix `main` to one full commit ID.
2. Compare it with `guest.lock` and stop immediately if they match.
3. Confirm that the exact commit passed the required Caffeinix workflows and
   is still the current production head.
4. Build all guest-specific assets from that exact commit.
5. Run the browser boot smoke test before changing production state.
6. Recheck upstream `main` and `guest.lock` after the tests to close races.
7. Commit the adopted lock with the existing bot identity and a DCO trailer.
8. Deploy the already tested Pages artifact from the same workflow run.

Acceptance:

- pull requests build and boot-test without deploying;
- only reviewed web `main` or the production polling job deploys Pages;
- deployment failure leaves the last successful site available;
- the public URL boots Caffeinix and reports the expected source commit;
- the site makes no request to a Render service or other runtime backend.

## Polling integration test

GitHub Pages has one production site and does not provide an automatic Pages
preview for every branch. Test branches therefore build the exact candidate
site, boot it in a headless browser, and upload it as a downloadable Actions
artifact. They must never update production `guest.lock`, push web `main`, or
deploy the production Pages environment.

If a remote preview is needed, only the web repository needs a temporary
integration branch:

```text
caffeinix-web: test/browser-pages
```

Caffeinix needs no web branch, workflow change, secret, or test-only commit.
An ordinary Caffeinix feature branch and pull request may be used later as a
candidate guest because its existing pull-request CI already produces the
checks that the web workflow needs to verify.

### Stage 1: test polling logic locally

1. Build the complete Pages directory locally from clean locked inputs.
2. Run JavaScript, manifest, license, static-path, and browser boot tests.
3. Unit-test polling decisions with recorded API responses for:
   - upstream and lock at the same commit;
   - a newer commit with checks still running;
   - a commit with a failed or cancelled required check;
   - a successful commit that stops being branch head during the build;
   - a successful stable commit ready for promotion;
   - two overlapping sync attempts.
4. Run a read-only integration test against the real public Caffeinix `main`
   and verify the returned full commit and named check results.
5. Run `actionlint` and use `act` for jobs that do not require GitHub Pages.
   Treat `act` as a syntax and local-job check only.
6. Exercise the changed-commit path with a temporary lock file containing an
   older known-good Caffeinix commit. Do not modify the tracked production
   lock during this test.

The local tests must prove that polling is idempotent and fail-closed: an API
error or ambiguous check state never promotes a guest.

### Stage 2: test the orphan web branch

1. Run the exact orphan branch through `act` before changing remote `main`.
2. When a hosted preview is useful, push the disconnected candidate as
   `test/browser-pages` and manually run its read-only CI workflow.
3. Build a Pages-shaped artifact from the pinned guest and boot it in current
   desktop Chromium and Firefox.
4. Run one- and two-hart boots and the BusyBox smoke commands.
5. Run the sync workflow in branch-safe dry-run mode with a temporary older
   lock. It must discover current Caffeinix `main`, compare it, verify its
   checks, build it, and upload the candidate artifact.
6. Confirm that every test-branch job has read-only repository permissions,
   creates no Git commit, and cannot enter the Pages deployment environment.

Service-worker behavior and actual Pages deployment cannot be proven
completely by `act`; they require GitHub-hosted runs. The polling decision and
candidate build do not require any event from Caffeinix.

### Stage 3: test an unmerged kernel candidate

This optional path proves that the browser package can be tested with an
unmerged kernel without adding web logic to the kernel repository:

1. Push a normal Caffeinix feature branch and open a draft pull request.
2. Wait for its existing `Kernel build` and `QEMU runtime` checks to pass.
3. Manually run the web candidate workflow with the Caffeinix repository and
   exact pull-request head commit.
4. Require the same named checks for that exact commit.
5. Build the kernel and root image, boot the browser guest, and upload the
   candidate Pages artifact.
6. Prove that candidate mode cannot update `guest.lock` or deploy Pages.

Candidate inputs are accepted only by a separate manual test workflow with
`contents: read` permission and no Pages environment. The scheduled production
workflow ignores all candidate repository, branch, commit, and deploy inputs.

### Stage 4: cut over and prove production polling

1. Recheck remote `main` and perform the planned orphan-history cutover.
2. Configure GitHub Pages to deploy through Actions.
3. Let web `main` build and deploy the pinned, known-good Caffeinix commit.
4. Verify the public URL, manifest, reset behavior, and cached second boot.
5. Run the production sync manually and confirm that an unchanged upstream
   commit exits without a build, commit, or deployment.
6. Observe at least one scheduled workflow run and confirm the same no-op
   behavior while upstream is unchanged.
7. On the next legitimate Caffeinix `main` merge, do not add a dummy web test
   commit to the kernel. Let the scheduled web workflow discover it.
8. Confirm that pending or failed kernel checks postpone adoption until a
   later poll.
9. After both required checks pass, confirm that one poll builds, browser-tests,
   records, and deploys the exact new commit.
10. Read the public `manifest.json` and require its Caffeinix commit to equal
    the current upstream `main` commit.
11. Delete `test/browser-pages` locally and remotely if it was created.
12. Confirm that the web remote exposes only the new `main` history and that
    Caffeinix contains no web-specific commit or configuration.

Do not create or merge an empty Caffeinix commit merely to test polling. The
changed-upstream path is fully rehearsed with a temporary lock and candidate
artifact; its final production proof happens on the next real kernel merge.

## Phase WEB6: perform the history cutover

Status: completed.

- Freeze changes to the old remote `main` during final validation.
- Reconstruct the three final patches on an orphan branch.
- Run whitespace, license, clean-build, browser, one-hart, two-hart, caching,
  and GitHub Pages path tests against that exact branch.
- Present the final commit list and test evidence before changing the remote.
- Force-update only `TroyMitchell911/caffeinix-web` `main`, using an expected
  old object ID with `--force-with-lease`.
- Configure repository Pages source as GitHub Actions.
- Verify the public deployment, source manifest, terminal, reset, and cache.
- Run the polling and candidate integration stages above.
- Remove obsolete remote references and then obsolete local references only
  after the production polling proof passes.

At plan creation time, remote `main` is
`1449b0f79774ca5188add9b514c0f9cc9591ac0e`, with no other remote branches or
tags. Re-read this state immediately before cutover; do not treat the recorded
value as authorization to overwrite a later unexpected commit.

## Out of scope

- running QEMU on GitHub Pages infrastructure;
- preserving the old Go or container deployment as a fallback;
- guest networking, remote port forwarding, or shared sessions;
- persistent writable root disks or user accounts;
- treating browser QEMU performance as a kernel performance benchmark;
- committing generated release binaries to Git history;
- deleting existing GHCR package versions or the external Render service.

GHCR package deletion and Render service deletion change external resources
outside the Git history reset and require separate explicit authorization.
