# Third-party notices

The build pins every executable browser component. The generated Pages site
contains this notice, individual browser-library license texts under
`licenses/`, and corresponding source archives under `sources/`.

## Runtime and guest

- QEMU-WASM, commit `0ef7b4e2814b231705d8371dd7997f5b72e70baf`, is
  derived from QEMU and distributed under GPL-2.0. Its exact source archive is
  published as `sources/qemu-wasm-source.tar.gz`.
- Caffeinix is GPL-3.0-only. The exact pinned source is published as
  `sources/caffeinix-source.tar.gz`.
- OpenSBI 1.7 is BSD-2-Clause. Its exact source is published as
  `sources/opensbi-source.tar.gz`.
- BusyBox 1.38.0 is GPL-2.0-only. Its release archive is published under
  `sources/`.
- musl 1.2.6 is MIT licensed. Its release archive is published under
  `sources/`.

## Browser libraries

- xterm.js 6.0.0 and `@xterm/addon-fit` 0.11.0 are MIT licensed. Their license
  texts are published as `licenses/xterm.txt` and
  `licenses/xterm-addon-fit.txt`. The xterm.js 4.19.0 source consumed by the
  QEMU-WASM terminal bridge is published as `sources/xterm-source.tgz`.
- xterm-pty 0.10.1 is MIT licensed. Its license is published as
  `licenses/xterm-pty.txt`, and its source package as
  `sources/xterm-pty-source.tgz`.
- coi-serviceworker 0.1.7 is pinned to upstream commit
  `7b1d2a092d0d2dd2b7270b6f12f13605de26f214` and is MIT licensed. The local
  formatting-adjusted copy retains its copyright notice; the license is
  published as `licenses/coi-serviceworker.txt`.

## QEMU-WASM build dependencies

The pinned builder uses Emscripten SDK 3.1.50 image digest
`sha256:b6ea0e55fdc95be36427df6df7892d5e5e27f0440cfcf442a55f784aba09a4fa`.
QEMU-WASM links or incorporates these pinned dependencies:

- zlib 1.3.1, zlib license, published as
  `sources/zlib-1.3.1.tar.gz`;
- GLib 2.75.0, LGPL-2.1-or-later, published as
  `sources/glib-2.75.0.tar.xz`;
- PCRE2 10.40 and its Meson WrapDB patch, BSD-3-Clause, published as
  `sources/pcre2-10.40.tar.gz` and
  `sources/pcre2_10.40-3_patch.zip`;
- GVDB commit `0854af0fdb6d527a8d1999835ac2c5059976c210`,
  LGPL-2.1-or-later, published as `sources/gvdb-source.tar.gz`;
- pixman 0.42.2, commit `37216a32839f59e8dcaa4c3951b3fcfc3f07852c`,
  MIT;
- libffi commit `adbcf2b247696dde2667ab552cb93e0c79455c84`, MIT;
- device-tree-compiler commit
  `b6910bec11614980a21e46fbccc35934b671bd81`, GPL-2.0-or-later;
- keycodemapdb commit `f5772a62ec52591ff6870b7e8ef32482371f22c6`,
  BSD-3-Clause and GPL-2.0-or-later;
- Berkeley SoftFloat commit
  `b64af41c3276f97f0e181920400ee056b9c88037` and Berkeley TestFloat
  commit `e7af9751d9f9fd3b47911f51a5cfd08af256a9ab`, BSD-3-Clause.

Their exact sources are published as `sources/pixman-source.tar.gz`,
`sources/libffi-source.tar.gz`, `sources/dtc-source.tar.gz`, and
`sources/keycodemapdb-source.tar.gz`, `sources/softfloat-source.tar.gz`,
and `sources/testfloat-source.tar.gz`.

The Docker build recipe records the exact inputs and is the preferred form
for reproducing the WebAssembly binary. Upstream source locations are:

- <https://github.com/ktock/qemu-wasm>
- <https://github.com/emscripten-core/emscripten>
- <https://zlib.net/>
- <https://gitlab.gnome.org/GNOME/glib>
- <https://github.com/PCRE2Project/pcre2>
- <https://gitlab.gnome.org/GNOME/gvdb>
- <https://gitlab.freedesktop.org/pixman/pixman>
- <https://github.com/libffi/libffi>
- <https://github.com/dgibson/dtc>
- <https://gitlab.com/qemu-project/keycodemapdb>
- <https://gitlab.com/qemu-project/berkeley-softfloat-3>
- <https://gitlab.com/qemu-project/berkeley-testfloat-3>
