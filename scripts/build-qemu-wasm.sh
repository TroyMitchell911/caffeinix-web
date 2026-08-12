#!/usr/bin/env bash

set -euo pipefail

topdir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
output=${QEMU_WASM_OUTPUT:-$topdir/output/qemu-wasm}
lock=$topdir/qemu-wasm.lock
dockerfile=$topdir/build/qemu-wasm/Dockerfile
download_cache=${QEMU_WASM_DOWNLOAD_CACHE:-$topdir/output/downloads/qemu-wasm}

read_lock()
{
	local key=$1
	sed -n "s/^${key}=//p" "$lock"
}

repository=$(read_lock QEMU_WASM_REPOSITORY)
commit=$(read_lock QEMU_WASM_COMMIT)
emsdk_version=$(read_lock EMSDK_VERSION)
emsdk_digest=$(read_lock EMSDK_DIGEST)
memory=$(read_lock WASM_MEMORY_MB)
qemu_source_url=$(read_lock QEMU_WASM_SOURCE_URL)
qemu_source_sha256=$(read_lock QEMU_WASM_SOURCE_SHA256)
zlib_source_url=$(read_lock ZLIB_SOURCE_URL)
zlib_source_sha256=$(read_lock ZLIB_SOURCE_SHA256)
glib_source_url=$(read_lock GLIB_SOURCE_URL)
glib_source_sha256=$(read_lock GLIB_SOURCE_SHA256)
pcre2_source_url=$(read_lock PCRE2_SOURCE_URL)
pcre2_source_sha256=$(read_lock PCRE2_SOURCE_SHA256)
pcre2_patch_url=$(read_lock PCRE2_PATCH_URL)
pcre2_patch_sha256=$(read_lock PCRE2_PATCH_SHA256)
gvdb_source_url=$(read_lock GVDB_SOURCE_URL)
gvdb_source_sha256=$(read_lock GVDB_SOURCE_SHA256)
libffi_source_url=$(read_lock LIBFFI_SOURCE_URL)
libffi_source_sha256=$(read_lock LIBFFI_SOURCE_SHA256)
pixman_source_url=$(read_lock PIXMAN_SOURCE_URL)
pixman_source_sha256=$(read_lock PIXMAN_SOURCE_SHA256)
dtc_source_url=$(read_lock DTC_SOURCE_URL)
dtc_source_sha256=$(read_lock DTC_SOURCE_SHA256)
keycodemapdb_source_url=$(read_lock KEYCODEMAPDB_SOURCE_URL)
keycodemapdb_source_sha256=$(read_lock KEYCODEMAPDB_SOURCE_SHA256)
softfloat_source_url=$(read_lock SOFTFLOAT_SOURCE_URL)
softfloat_source_sha256=$(read_lock SOFTFLOAT_SOURCE_SHA256)
testfloat_source_url=$(read_lock TESTFLOAT_SOURCE_URL)
testfloat_source_sha256=$(read_lock TESTFLOAT_SOURCE_SHA256)
xterm_source_url=$(read_lock XTERM_SOURCE_URL)
xterm_source_sha256=$(read_lock XTERM_SOURCE_SHA256)
xterm_pty_source_url=$(read_lock XTERM_PTY_SOURCE_URL)
xterm_pty_source_sha256=$(read_lock XTERM_PTY_SOURCE_SHA256)

if [[ ! $commit =~ ^[0-9a-f]{40}$ ]]; then
	echo "invalid QEMU_WASM_COMMIT in $lock" >&2
	exit 1
fi
if [[ ! $memory =~ ^[0-9]+$ ]]; then
	echo "invalid WASM_MEMORY_MB in $lock" >&2
	exit 1
fi
for checksum in \
	"$qemu_source_sha256" \
	"$zlib_source_sha256" \
	"$glib_source_sha256" \
	"$pcre2_source_sha256" \
	"$pcre2_patch_sha256" \
	"$gvdb_source_sha256" \
	"$libffi_source_sha256" \
	"$pixman_source_sha256" \
	"$dtc_source_sha256" \
	"$keycodemapdb_source_sha256" \
	"$softfloat_source_sha256" \
	"$testfloat_source_sha256" \
	"$xterm_source_sha256" \
	"$xterm_pty_source_sha256"; do
	if [[ ! $checksum =~ ^[0-9a-f]{64}$ ]]; then
		echo "invalid source SHA-256 in $lock" >&2
		exit 1
	fi
done

build_key=$(
	sha256sum "$lock" "$dockerfile" "$0" |
		sha256sum | sed 's/ .*//'
)
if [ -f "$output/.build-key" ] &&
   [ "$(sed -n '1p' "$output/.build-key")" = "$build_key" ] &&
   [ -f "$output/qemu-system-riscv64.js" ] &&
   [ -f "$output/qemu-system-riscv64.wasm" ] &&
   [ -f "$output/qemu-system-riscv64.worker.js" ] &&
   [ -f "$output/sources/qemu-wasm-source.tar.gz" ]; then
	echo "Using cached QEMU-WASM $commit"
	exit 0
fi

for command in curl docker sha256sum sed mktemp; do
	if ! command -v "$command" >/dev/null 2>&1; then
		echo "missing build dependency: $command" >&2
		exit 1
	fi
done

mkdir -p "$download_cache"

download()
{
	local url=$1
	local name=$2
	local checksum=$3
	local destination=$download_cache/$name
	local temporary

	if [ -f "$destination" ] &&
	   printf '%s  %s\n' "$checksum" "$destination" |
		sha256sum --check --status; then
		return
	fi

	temporary=$(mktemp "$download_cache/.${name}.XXXXXX")
	if ! curl --retry 12 --retry-delay 2 --retry-all-errors \
		--connect-timeout 30 --max-time 600 \
		--fail --location --silent --show-error "$url" \
		-o "$temporary"; then
		rm -f -- "$temporary"
		return 1
	fi
	printf '%s  %s\n' "$checksum" "$temporary" |
		sha256sum --check
	mv -f -- "$temporary" "$destination"
}

download "$qemu_source_url" qemu-wasm-source.tar.gz \
	"$qemu_source_sha256"
download "$zlib_source_url" zlib-source.tar.gz \
	"$zlib_source_sha256"
download "$glib_source_url" glib-source.tar.xz \
	"$glib_source_sha256"
download "$pcre2_source_url" pcre2-source.tar.gz \
	"$pcre2_source_sha256"
download "$pcre2_patch_url" pcre2-patch.zip \
	"$pcre2_patch_sha256"
download "$gvdb_source_url" gvdb-source.tar.gz \
	"$gvdb_source_sha256"
download "$libffi_source_url" libffi-source.tar.gz \
	"$libffi_source_sha256"
download "$pixman_source_url" pixman-source.tar.gz \
	"$pixman_source_sha256"
download "$dtc_source_url" dtc-source.tar.gz \
	"$dtc_source_sha256"
download "$keycodemapdb_source_url" keycodemapdb-source.tar.gz \
	"$keycodemapdb_source_sha256"
download "$softfloat_source_url" softfloat-source.tar.gz \
	"$softfloat_source_sha256"
download "$testfloat_source_url" testfloat-source.tar.gz \
	"$testfloat_source_sha256"
download "$xterm_source_url" xterm-source.tgz \
	"$xterm_source_sha256"
download "$xterm_pty_source_url" xterm-pty-source.tgz \
	"$xterm_pty_source_sha256"

tag="caffeinix-qemu-wasm:${build_key:0:16}"
docker build \
	--file "$dockerfile" \
	--tag "$tag" \
	--build-arg "QEMU_WASM_REPOSITORY=$repository" \
	--build-arg "QEMU_WASM_COMMIT=$commit" \
	--build-arg "EMSDK_VERSION=$emsdk_version" \
	--build-arg "EMSDK_DIGEST=$emsdk_digest" \
	--build-arg "QEMU_WASM_SOURCE_SHA256=$qemu_source_sha256" \
	--build-arg "ZLIB_SOURCE_SHA256=$zlib_source_sha256" \
	--build-arg "GLIB_SOURCE_SHA256=$glib_source_sha256" \
	--build-arg "PCRE2_SOURCE_SHA256=$pcre2_source_sha256" \
	--build-arg "PCRE2_PATCH_SHA256=$pcre2_patch_sha256" \
	--build-arg "GVDB_SOURCE_SHA256=$gvdb_source_sha256" \
	--build-arg "LIBFFI_SOURCE_SHA256=$libffi_source_sha256" \
	--build-arg "PIXMAN_SOURCE_SHA256=$pixman_source_sha256" \
	--build-arg "DTC_SOURCE_SHA256=$dtc_source_sha256" \
	--build-arg "KEYCODEMAPDB_SOURCE_SHA256=$keycodemapdb_source_sha256" \
	--build-arg "SOFTFLOAT_SOURCE_SHA256=$softfloat_source_sha256" \
	--build-arg "TESTFLOAT_SOURCE_SHA256=$testfloat_source_sha256" \
	--build-arg "XTERM_SOURCE_SHA256=$xterm_source_sha256" \
	--build-arg "XTERM_PTY_SOURCE_SHA256=$xterm_pty_source_sha256" \
	--build-arg "WASM_MEMORY_MB=$memory" \
	"$download_cache"

output_parent=$(dirname -- "$output")
mkdir -p "$output_parent"
staging=$(mktemp -d "$output_parent/.qemu-wasm.XXXXXX")
old_output=
container=$(docker create "$tag" /bin/true)
cleanup()
{
	docker rm --force "$container" >/dev/null 2>&1 || true
	if [ -n "$staging" ]; then
		rm -rf -- "$staging"
	fi
	if [ -n "$old_output" ]; then
		if [ ! -e "$output" ]; then
			mv -- "$old_output" "$output"
		else
			rm -rf -- "$old_output"
		fi
	fi
}
trap cleanup EXIT

docker cp "$container:/out/." "$staging/"
printf '%s\n' "$build_key" > "$staging/.build-key"
if [ -e "$output" ]; then
	old_output=$(mktemp -d "$output_parent/.qemu-wasm-old.XXXXXX")
	rmdir -- "$old_output"
	mv -- "$output" "$old_output"
fi
mv -- "$staging" "$output"
staging=
if [ -n "$old_output" ]; then
	rm -rf -- "$old_output"
	old_output=
fi

echo "Built QEMU-WASM $commit in $output"
