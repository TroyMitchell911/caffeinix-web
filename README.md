# Caffeinix browser console

Caffeinix runs as a static site at
<https://troymitchell911.github.io/caffeinix-web/>. The visitor's browser runs
OpenSBI, the Caffeinix RISC-V kernel, and a musl/BusyBox userspace inside
QEMU WebAssembly. GitHub Pages only serves files; it does not host a VM or a
terminal backend.

Each tab owns an independent writable in-memory ext4 image. Stop terminates
the QEMU threads, and Reset starts from the published clean image. There is no
guest network device, persistent disk, WebSocket, API server, container
runtime, or shared session.

## Browser requirements

The emulator needs WebAssembly threads, `SharedArrayBuffer`, and a secure
context. GitHub Pages cannot set COOP and COEP response headers, so the site
uses a pinned same-origin `coi-serviceworker` to establish cross-origin
isolation. A first visit may reload once after registering that worker.

Current desktop Chromium and Firefox are tested. A phone layout and a real
one-hart boot are tested with mobile Chromium emulation. The default VM uses
two harts and 64 MiB of guest RAM inside a fixed 512 MiB WebAssembly heap.
Start is explicit so merely opening the page does not reserve that memory.

## Build

The build consumes only pinned inputs from [`guest.lock`](guest.lock) and
[`qemu-wasm.lock`](qemu-wasm.lock). Generated kernels, filesystems, source
archives, and WebAssembly files stay under `output/` and `dist/`; they are not
committed.

Required host tools are Docker, Node.js 22 or newer, npm, Git, curl, make,
ripgrep, the standard `riscv64-linux-gnu-` GCC/binutils tools, e2fsprogs, and
dosfstools.

On Arch Linux:

```sh
sudo pacman -S --needed \
  docker nodejs npm git curl make ripgrep \
  riscv64-linux-gnu-gcc riscv64-linux-gnu-binutils \
  e2fsprogs dosfstools
sudo systemctl enable --now docker
```

On Ubuntu 24.04 or newer, install the equivalent packages and provide a
Node.js 22 installation:

```sh
sudo apt-get update
sudo apt-get install \
  docker.io npm git curl make ripgrep \
  gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu \
  e2fsprogs dosfstools
sudo systemctl enable --now docker
node --version
```

Build the complete Pages directory:

```sh
make -j"$(nproc)" site
```

The first build creates the pinned QEMU-WASM tool image and can take several
minutes and several gigabytes of temporary Docker storage. Later builds reuse
both Docker layers and content-keyed outputs. The guest build clones the exact
Caffeinix and OpenSBI commits, builds the kernel and firmware, uses
Caffeinix's pinned musl/BusyBox root-image builder, and reduces the ext4 image
to 16 MiB while retaining writable space. Build paths, timestamps, filesystem
identifiers, and directory hashes are normalized so identical inputs produce
byte-identical kernel, OpenSBI, and root-image outputs.

Serve the site below the same project path used by GitHub Pages:

```sh
make serve
```

Then open <http://127.0.0.1:4173/caffeinix-web/>.

## Test

Install the browser engines once, then run all checks:

```sh
make browser-deps
make -j"$(nproc)" test
```

The suite verifies source locks, generated-file hashes, relative Pages URLs,
desktop and mobile layouts, Chromium and Firefox boots, one- and two-hart
startup, UART input, BusyBox commands, writable ext4 operations, Stop, and a
clean restart.

The GitHub Actions test job can also run locally in `act`:

```sh
act pull_request --job test
```

## Guest updates

The web repository polls Caffeinix `main` at minute 23 of every hour. It
adopts a new commit only when `Kernel build` and `QEMU runtime` are successful
for that exact commit. After building and booting the candidate in browsers,
the workflow rechecks the upstream branch head and lock before committing the
new pin. The resulting `main` push rebuilds and deploys Pages.

No token, notification workflow, repository name, or web-only trigger is
installed in Caffeinix. Forks of the kernel therefore run only their normal
kernel CI. The polling workflow has read access to the public kernel and write
access only to this repository.

An isolated manual candidate workflow can test an exact unmerged kernel
commit. It cannot update `guest.lock` or deploy production.

## Source and licenses

The published site contains source archives for Caffeinix, QEMU-WASM,
OpenSBI, BusyBox, and musl, plus an exact manifest with SHA-256 hashes. Build
dependency provenance and license locations are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The web application is GPL-3.0-only. Bundled components retain their upstream
licenses.
