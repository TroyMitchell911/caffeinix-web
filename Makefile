.DEFAULT_GOAL := site

JOBS ?= $(shell nproc)
DIST ?= $(CURDIR)/dist
QEMU_WASM_OUTPUT ?= $(CURDIR)/output/qemu-wasm
GUEST_OUTPUT ?= $(CURDIR)/output/guest

.PHONY: dependencies
dependencies:
	npm ci

.PHONY: qemu-wasm
qemu-wasm:
	QEMU_WASM_OUTPUT="$(QEMU_WASM_OUTPUT)" \
		./scripts/build-qemu-wasm.sh

.PHONY: guest
guest:
	GUEST_OUTPUT="$(GUEST_OUTPUT)" JOBS="$(JOBS)" \
		./scripts/build-guest.sh

.PHONY: site
site: dependencies qemu-wasm guest
	DIST="$(DIST)" QEMU_WASM_OUTPUT="$(QEMU_WASM_OUTPUT)" \
		GUEST_OUTPUT="$(GUEST_OUTPUT)" npm run build

.PHONY: unit
unit: dependencies
	npm run test:unit

.PHONY: check
check: unit site
	DIST="$(DIST)" npm run check:site

.PHONY: browser-deps
browser-deps: dependencies
	npx playwright install chromium firefox

.PHONY: browser
browser: site
	npm run test:browser

.PHONY: test
test: check browser

.PHONY: serve
serve: site
	node scripts/serve.mjs --root "$(DIST)" --base /caffeinix-web/

.PHONY: act
act:
	act pull_request --job test
