ARG EMSDK_VERSION
ARG EMSDK_DIGEST

FROM emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST} AS build-base

ENV TARGET=/build/target
ENV CFLAGS="-O2 -matomics -mbulk-memory -DNDEBUG -sWASM_BIGINT \
    -DWASM_BIGINT -pthread -sMALLOC=mimalloc -sASYNCIFY=1"
ENV CXXFLAGS="$CFLAGS"
ENV LDFLAGS="-L$TARGET/lib -O2"
ENV CPATH="$TARGET/include"
ENV PKG_CONFIG_PATH="$TARGET/lib/pkgconfig"
ENV EM_PKG_CONFIG_PATH="$PKG_CONFIG_PATH"
ENV CHOST=wasm32-unknown-linux

RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    libglib2.0-dev \
    libltdl-dev \
    libtool \
    ninja-build \
    pkgconf \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir meson==1.5.0
RUN mkdir -p /build/target
WORKDIR /build

FROM build-base AS zlib-build
ARG ZLIB_SOURCE_SHA256
COPY zlib-source.tar.gz /tmp/
RUN echo "${ZLIB_SOURCE_SHA256}  /tmp/zlib-source.tar.gz" \
      | sha256sum --check \
    && mkdir /zlib \
    && tar -xzf /tmp/zlib-source.tar.gz -C /zlib --strip-components=1
WORKDIR /zlib
RUN emconfigure ./configure --prefix="$TARGET" --static
RUN make -j"$(nproc)" install

FROM build-base AS libffi-build
ARG LIBFFI_SOURCE_SHA256
COPY libffi-source.tar.gz /tmp/
RUN echo "${LIBFFI_SOURCE_SHA256}  /tmp/libffi-source.tar.gz" \
      | sha256sum --check \
    && mkdir /libffi \
    && tar -xzf /tmp/libffi-source.tar.gz \
      -C /libffi --strip-components=1
WORKDIR /libffi
RUN autoreconf -fiv
RUN LDFLAGS="$LDFLAGS -sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0" \
    emconfigure ./configure \
    --host="$CHOST" \
    --prefix="$TARGET" \
    --enable-static \
    --disable-shared \
    --disable-dependency-tracking \
    --disable-builddir \
    --disable-multi-os-directory \
    --disable-raw-api \
    --disable-structs \
    --disable-docs
RUN emmake make -j"$(nproc)" install SUBDIRS=include

FROM build-base AS glib-build
ARG GLIB_SOURCE_SHA256
ARG PCRE2_SOURCE_SHA256
ARG PCRE2_PATCH_SHA256
ARG GVDB_SOURCE_SHA256

RUN mkdir -p /stub "$TARGET/lib" \
    && printf '%s\n' \
      '#include <netdb.h>' \
      'int res_query(const char *name, int class, int type,' \
      '              unsigned char *dest, int len)' \
      '{' \
      '    h_errno = HOST_NOT_FOUND;' \
      '    return -1;' \
      '}' > /stub/res_query.c \
    && emcc $CFLAGS -c /stub/res_query.c -fPIC -o /stub/libresolv.o \
    && ar rcs /stub/libresolv.a /stub/libresolv.o \
    && cp /stub/libresolv.a "$TARGET/lib/"
COPY glib-source.tar.xz /tmp/
RUN echo "${GLIB_SOURCE_SHA256}  /tmp/glib-source.tar.xz" \
      | sha256sum --check \
    && mkdir /glib \
    && tar -xJf /tmp/glib-source.tar.xz -C /glib --strip-components=1
COPY pcre2-source.tar.gz /tmp/
COPY pcre2-patch.zip /tmp/
COPY gvdb-source.tar.gz /tmp/
RUN echo "${PCRE2_SOURCE_SHA256}  /tmp/pcre2-source.tar.gz" \
      | sha256sum --check \
    && echo "${PCRE2_PATCH_SHA256}  /tmp/pcre2-patch.zip" \
      | sha256sum --check \
    && echo "${GVDB_SOURCE_SHA256}  /tmp/gvdb-source.tar.gz" \
      | sha256sum --check \
    && mkdir -p /glib/subprojects/pcre2-10.40 \
      /glib/subprojects/gvdb \
    && tar -xzf /tmp/pcre2-source.tar.gz \
      -C /glib/subprojects/pcre2-10.40 --strip-components=1 \
    && python3 -m zipfile -e /tmp/pcre2-patch.zip \
      /glib/subprojects \
    && tar -xzf /tmp/gvdb-source.tar.gz \
      -C /glib/subprojects/gvdb --strip-components=1

COPY --from=zlib-build /build/ /build/
COPY --from=libffi-build /build/ /build/

WORKDIR /glib
ENV CFLAGS="-Wno-error=incompatible-function-pointer-types \
    -Wincompatible-function-pointer-types -O2 -matomics -mbulk-memory \
    -DNDEBUG -pthread -sWASM_BIGINT -sMALLOC=mimalloc -sASYNCIFY=1"
ENV CXXFLAGS="$CFLAGS"
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -euo pipefail' \
    'old="-Werror=unused-command-line-argument"' \
    'new="-Wno-error=unused-command-line-argument"' \
    'command=$1' \
    'shift' \
    'arguments=()' \
    'for argument in "$@"; do' \
    '    arguments+=("${argument//$old/$new}")' \
    'done' \
    '"$command" "${arguments[@]}"' > /emcc-meson-wrap.sh \
    && chmod +x /emcc-meson-wrap.sh
RUN printf '%s\n' \
    '[host_machine]' \
    "system = 'emscripten'" \
    "cpu_family = 'wasm32'" \
    "cpu = 'wasm32'" \
    "endian = 'little'" \
    '' \
    '[binaries]' \
    "c = ['bash', '/emcc-meson-wrap.sh', 'emcc']" \
    "cpp = ['bash', '/emcc-meson-wrap.sh', 'em++']" \
    "ar = 'emar'" \
    "ranlib = 'emranlib'" \
    "pkgconfig = ['pkg-config', '--static']" > /cross.meson
RUN meson setup _build \
    --prefix="$TARGET" \
    --cross-file=/cross.meson \
    --wrap-mode=nodownload \
    --default-library=static \
    --buildtype=release \
    --force-fallback-for=pcre2,gvdb \
    -Dselinux=disabled \
    -Dxattr=false \
    -Dlibmount=disabled \
    -Dnls=disabled \
    -Dtests=false \
    -Dglib_assert=false \
    -Dglib_checks=false
RUN sed -i -E \
    -e '/#define HAVE_CLOSE_RANGE 1/d' \
    -e '/#define HAVE_EPOLL_CREATE 1/d' \
    -e '/#define HAVE_KQUEUE 1/d' \
    -e '/#define HAVE_POSIX_SPAWN 1/d' \
    -e '/#define HAVE_FALLOCATE 1/d' \
    _build/config.h \
    && meson install -C _build

FROM build-base AS pixman-build
ARG PIXMAN_SOURCE_SHA256
COPY pixman-source.tar.gz /tmp/
RUN echo "${PIXMAN_SOURCE_SHA256}  /tmp/pixman-source.tar.gz" \
      | sha256sum --check \
    && mkdir /pixman \
    && tar -xzf /tmp/pixman-source.tar.gz \
      -C /pixman --strip-components=1
WORKDIR /pixman
RUN emconfigure ./configure --prefix="$TARGET"
RUN emmake make -j"$(nproc)" install

FROM build-base AS qemu-build
ARG QEMU_WASM_REPOSITORY
ARG QEMU_WASM_COMMIT
ARG QEMU_WASM_SOURCE_SHA256
ARG DTC_SOURCE_SHA256
ARG KEYCODEMAPDB_SOURCE_SHA256
ARG SOFTFLOAT_SOURCE_SHA256
ARG TESTFLOAT_SOURCE_SHA256
ARG XTERM_SOURCE_SHA256
ARG XTERM_PTY_SOURCE_SHA256
ARG WASM_MEMORY_MB

COPY --from=zlib-build /build/ /build/
COPY --from=glib-build /build/ /build/
COPY --from=pixman-build /build/ /build/

COPY xterm-source.tgz /tmp/
COPY xterm-pty-source.tgz /tmp/
RUN echo "${XTERM_SOURCE_SHA256}  /tmp/xterm-source.tgz" \
      | sha256sum --check \
    && echo "${XTERM_PTY_SOURCE_SHA256}  /tmp/xterm-pty-source.tgz" \
      | sha256sum --check \
    && npm install --offline --no-save --ignore-scripts \
      /tmp/xterm-source.tgz /tmp/xterm-pty-source.tgz
COPY qemu-wasm-source.tar.gz /tmp/
COPY dtc-source.tar.gz /tmp/
COPY keycodemapdb-source.tar.gz /tmp/
COPY softfloat-source.tar.gz /tmp/
COPY testfloat-source.tar.gz /tmp/
RUN echo "${QEMU_WASM_SOURCE_SHA256}  /tmp/qemu-wasm-source.tar.gz" \
      | sha256sum --check \
    && echo "${DTC_SOURCE_SHA256}  /tmp/dtc-source.tar.gz" \
      | sha256sum --check \
    && echo "${KEYCODEMAPDB_SOURCE_SHA256}  /tmp/keycodemapdb-source.tar.gz" \
      | sha256sum --check \
    && echo "${SOFTFLOAT_SOURCE_SHA256}  /tmp/softfloat-source.tar.gz" \
      | sha256sum --check \
    && echo "${TESTFLOAT_SOURCE_SHA256}  /tmp/testfloat-source.tar.gz" \
      | sha256sum --check \
    && mkdir -p /qemu \
    && tar -xzf /tmp/qemu-wasm-source.tar.gz \
      -C /qemu --strip-components=1 \
    && mkdir -p /qemu/subprojects/dtc \
      /qemu/subprojects/keycodemapdb \
      /qemu/subprojects/berkeley-softfloat-3 \
      /qemu/subprojects/berkeley-testfloat-3 \
    && tar -xzf /tmp/dtc-source.tar.gz \
      -C /qemu/subprojects/dtc --strip-components=1 \
    && tar -xzf /tmp/keycodemapdb-source.tar.gz \
      -C /qemu/subprojects/keycodemapdb --strip-components=1 \
    && tar -xzf /tmp/softfloat-source.tar.gz \
      -C /qemu/subprojects/berkeley-softfloat-3 --strip-components=1 \
    && tar -xzf /tmp/testfloat-source.tar.gz \
      -C /qemu/subprojects/berkeley-testfloat-3 --strip-components=1 \
    && cp -a /qemu/subprojects/packagefiles/berkeley-softfloat-3/. \
      /qemu/subprojects/berkeley-softfloat-3/ \
    && cp -a /qemu/subprojects/packagefiles/berkeley-testfloat-3/. \
      /qemu/subprojects/berkeley-testfloat-3/

WORKDIR /build/qemu
RUN common_flags="-O3 -Wno-error=unused-command-line-argument \
      -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE \
      -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM \
      -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=${WASM_MEMORY_MB}MB \
      -sWASM_BIGINT -sMALLOC=mimalloc \
      --js-library=/build/node_modules/xterm-pty/emscripten-pty.js \
      -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js" \
    && emconfigure /qemu/configure \
      --static \
      --target-list=riscv64-softmmu \
      --cpu=wasm32 \
      --cross-prefix= \
      --without-default-features \
      --disable-download \
      --enable-system \
      --enable-fdt=internal \
      --with-coroutine=fiber \
      --enable-virtfs \
      --extra-cflags="$common_flags" \
      --extra-cxxflags="$common_flags" \
      --extra-ldflags=-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS
RUN emmake make -j"$(nproc)" qemu-system-riscv64
RUN mkdir -p /out/sources \
    && cp qemu-system-riscv64 /out/qemu-system-riscv64.js \
    && cp qemu-system-riscv64.wasm /out/ \
    && cp qemu-system-riscv64.worker.js /out/ \
    && cp /tmp/qemu-wasm-source.tar.gz \
      /tmp/dtc-source.tar.gz \
      /tmp/keycodemapdb-source.tar.gz \
      /tmp/softfloat-source.tar.gz \
      /tmp/testfloat-source.tar.gz \
      /tmp/xterm-source.tgz \
      /tmp/xterm-pty-source.tgz \
      /out/sources/ \
    && printf '%s\n' \
      "QEMU_WASM_REPOSITORY=${QEMU_WASM_REPOSITORY}" \
      "QEMU_WASM_COMMIT=${QEMU_WASM_COMMIT}" \
      "WASM_MEMORY_MB=${WASM_MEMORY_MB}" > /out/build.env
COPY --from=zlib-build /tmp/zlib-source.tar.gz /out/sources/zlib-1.3.1.tar.gz
COPY --from=glib-build /tmp/glib-source.tar.xz /out/sources/glib-2.75.0.tar.xz
COPY --from=glib-build /tmp/pcre2-source.tar.gz /out/sources/pcre2-10.40.tar.gz
COPY --from=glib-build /tmp/pcre2-patch.zip /out/sources/pcre2_10.40-3_patch.zip
COPY --from=glib-build /tmp/gvdb-source.tar.gz /out/sources/
COPY --from=libffi-build /tmp/libffi-source.tar.gz /out/sources/
COPY --from=pixman-build /tmp/pixman-source.tar.gz /out/sources/

FROM scratch
COPY --from=qemu-build /out /out
