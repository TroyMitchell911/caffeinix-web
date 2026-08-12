#!/usr/bin/env bash

set -euo pipefail

topdir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
output=${GUEST_OUTPUT:-$topdir/output/guest}
downloads=${DOWNLOAD_DIR:-$topdir/output/downloads}
lock=$topdir/guest.lock
jobs=${JOBS:-$(nproc)}
cross_compile=${CROSS_COMPILE:-riscv64-linux-gnu-}

read_lock()
{
	local key=$1
	sed -n "s/^${key}=//p" "$lock"
}

caffeinix_repository=$(read_lock CAFFEINIX_REPOSITORY)
caffeinix_commit=${CAFFEINIX_COMMIT_OVERRIDE:-$(read_lock CAFFEINIX_COMMIT)}
opensbi_repository=$(read_lock OPENSBI_REPOSITORY)
opensbi_commit=$(read_lock OPENSBI_COMMIT)
opensbi_version=$(read_lock OPENSBI_VERSION)
musl_version=$(read_lock MUSL_VERSION)
busybox_version=$(read_lock BUSYBOX_VERSION)

for commit in "$caffeinix_commit" "$opensbi_commit"; do
	if [[ ! $commit =~ ^[0-9a-f]{40}$ ]]; then
		echo "invalid source commit in $lock: $commit" >&2
		exit 1
	fi
done

for command in \
	git make sed rg sha256sum mktemp date find touch ln \
	e2fsck mke2fs resize2fs tune2fs \
	"${cross_compile}gcc"; do
	if ! command -v "$command" >/dev/null 2>&1; then
		echo "missing guest build dependency: $command" >&2
		exit 1
	fi
done

compiler_version=$("${cross_compile}gcc" --version | sed -n '1p')
e2fsprogs_version=$(mke2fs -V 2>&1 | sed -n '1p')
build_key=$(
	{
		sha256sum "$lock" "$0"
		printf '%s\n' \
			"$caffeinix_commit" \
			"$compiler_version" \
			"$e2fsprogs_version"
	} | sha256sum | sed 's/ .*//'
)
if [ -f "$output/.build-key" ] &&
   [ "$(sed -n '1p' "$output/.build-key")" = "$build_key" ] &&
   [ -f "$output/kernel" ] &&
   [ -f "$output/root.ext4" ] &&
   [ -f "$output/opensbi.bin" ] &&
   [ -f "$output/sources/caffeinix-source.tar.gz" ]; then
	echo "Using cached Caffeinix guest $caffeinix_commit"
	exit 0
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/caffeinix-guest.XXXXXX")
cleanup()
{
	rm -rf -- "$work"
}
trap cleanup EXIT

clone_exact()
{
	local repository=$1
	local commit=$2
	local destination=$3

	git init --quiet "$destination"
	git -C "$destination" remote add origin "$repository"
	git -C "$destination" fetch --quiet --depth=1 origin "$commit"
	git -C "$destination" checkout --quiet --detach FETCH_HEAD
	if [ "$(git -C "$destination" rev-parse HEAD)" != "$commit" ]; then
		echo "fetched the wrong commit from $repository" >&2
		exit 1
	fi
}

caffeinix_source=$work/caffeinix
opensbi_source=$work/opensbi
clone_exact "$caffeinix_repository" "$caffeinix_commit" "$caffeinix_source"
clone_exact "$opensbi_repository" "$opensbi_commit" "$opensbi_source"

uuid=${caffeinix_commit:0:8}-${caffeinix_commit:8:4}
uuid=$uuid-${caffeinix_commit:12:4}-${caffeinix_commit:16:4}
uuid=$uuid-${caffeinix_commit:20:12}

toolchain=$work/toolchain
mkdir -p "$toolchain"
real_gcc=$(command -v "${cross_compile}gcc")
printf '#!/usr/bin/env bash\nexec %q %q "$@"\n' \
	"$real_gcc" "-ffile-prefix-map=$work=/usr/src" \
	> "$toolchain/riscv64-linux-gnu-gcc"
chmod +x "$toolchain/riscv64-linux-gnu-gcc"
for tool in ar as ld nm objcopy objdump ranlib readelf size strip; do
	real_tool=$(command -v "${cross_compile}${tool}")
	if [ -z "$real_tool" ]; then
		echo "missing guest build dependency: ${cross_compile}${tool}" >&2
		exit 1
	fi
	ln -s "$real_tool" "$toolchain/riscv64-linux-gnu-$tool"
done
build_cross=$toolchain/riscv64-linux-gnu-

if ! rg -q "^musl_version=${musl_version}$" \
     "$caffeinix_source/tests/scripts/build-rootfs.sh"; then
	echo "guest.lock musl version does not match Caffeinix" >&2
	exit 1
fi
if ! rg -q "^busybox_version=${busybox_version}$" \
     "$caffeinix_source/tests/scripts/build-rootfs.sh"; then
	echo "guest.lock BusyBox version does not match Caffeinix" >&2
	exit 1
fi

source_epoch=$(git -C "$caffeinix_source" show -s --format=%ct HEAD)
export LC_ALL=C
export TZ=UTC
export SOURCE_DATE_EPOCH=$source_epoch
export KBUILD_BUILD_TIMESTAMP="@$source_epoch"
export KBUILD_BUILD_USER=caffeinix
export KBUILD_BUILD_HOST=browser
export E2FSPROGS_FAKE_TIME=$source_epoch

make -C "$caffeinix_source" -j"$jobs" \
	CROSS_COMPILE="$build_cross"
make -C "$opensbi_source" -j"$jobs" \
	CROSS_COMPILE="$build_cross" \
	PLATFORM=generic

guest_work=$work/guest
real_mke2fs=$(command -v mke2fs)
mke2fs_wrapper=$toolchain/mke2fs
printf '%s\n' \
	'#!/usr/bin/env bash' \
	'set -euo pipefail' \
	'previous=' \
	'for argument in "$@"; do' \
	'    if [ "$previous" = -d ]; then' \
	"        find \"\$argument\" -exec touch -h -d '@$source_epoch' {} +" \
	'        break' \
	'    fi' \
	'    previous=$argument' \
	'done' \
	"exec \"$real_mke2fs\" -U '$uuid' -E 'hash_seed=$uuid' \"\$@\"" \
	> "$mke2fs_wrapper"
chmod +x "$mke2fs_wrapper"

DOWNLOAD_DIR="$downloads" \
TEST_OUTPUT="$guest_work" \
JOBS="$jobs" \
PATH="$toolchain:$PATH" \
CROSS_COMPILE="$build_cross" \
	"$caffeinix_source/tests/scripts/build-rootfs.sh"

root_image=$guest_work/root.ext4
e2fsck -fy "$root_image"
resize2fs -M "$root_image"
resize2fs "$root_image" 16M
tune2fs -U "$uuid" "$root_image"
e2fsck -fn "$root_image"
check_time=$(date -u -d "@$source_epoch" +%Y%m%d%H%M%S)
tune2fs -C 0 -T "$check_time" "$root_image"
e2fsck -fn "$root_image"

staging=$work/output
mkdir -p "$staging/sources"
install -m 0644 "$caffeinix_source/output/kernel" "$staging/kernel"
install -m 0644 "$root_image" "$staging/root.ext4"
install -m 0644 \
	"$opensbi_source/build/platform/generic/firmware/fw_dynamic.bin" \
	"$staging/opensbi.bin"

git -C "$caffeinix_source" archive \
	--format=tar.gz \
	--prefix="caffeinix-${caffeinix_commit}/" \
	--output="$staging/sources/caffeinix-source.tar.gz" \
	"$caffeinix_commit"
git -C "$opensbi_source" archive \
	--format=tar.gz \
	--prefix="opensbi-${opensbi_commit}/" \
	--output="$staging/sources/opensbi-source.tar.gz" \
	"$opensbi_commit"
install -m 0644 \
	"$downloads/musl-${musl_version}.tar.gz" \
	"$staging/sources/"
install -m 0644 \
	"$downloads/busybox-${busybox_version}.tar.bz2" \
	"$staging/sources/"

printf '%s\n' \
	"CAFFEINIX_REPOSITORY=$caffeinix_repository" \
	"CAFFEINIX_COMMIT=$caffeinix_commit" \
	"OPENSBI_REPOSITORY=$opensbi_repository" \
	"OPENSBI_COMMIT=$opensbi_commit" \
	"OPENSBI_VERSION=$opensbi_version" \
	"MUSL_VERSION=$musl_version" \
	"BUSYBOX_VERSION=$busybox_version" > "$staging/build.env"
printf '%s\n' "$build_key" > "$staging/.build-key"

mkdir -p "$output"
cp -a "$staging/." "$output/"

echo "Built Caffeinix guest $caffeinix_commit in $output"
