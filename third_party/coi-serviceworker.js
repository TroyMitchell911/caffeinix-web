/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, MIT */
let coepCredentialless = false;

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (event) => {
    if (!event.data) {
      return;
    }
    if (event.data.type === "deregister") {
      self.registration.unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    } else if (event.data.type === "coepCredentialless") {
      coepCredentialless = event.data.value;
    }
  });

  self.addEventListener("fetch", (event) => {
    const original = event.request;
    if (original.cache === "only-if-cached" && original.mode !== "same-origin") {
      return;
    }

    const request = coepCredentialless && original.mode === "no-cors"
      ? new Request(original, { credentials: "omit" })
      : original;
    event.respondWith(fetch(request).then((response) => {
      if (response.status === 0) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.set(
        "Cross-Origin-Embedder-Policy",
        coepCredentialless ? "credentialless" : "require-corp",
      );
      if (!coepCredentialless) {
        headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      }
      headers.set("Cross-Origin-Opener-Policy", "same-origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch((error) => console.error(error)));
  });
} else {
  (() => {
    const reloaded = sessionStorage.getItem("coiReloadedBySelf");
    sessionStorage.removeItem("coiReloadedBySelf");
    const degrading = reloaded === "coepdegrade";
    const options = {
      shouldRegister: () => !reloaded,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => location.reload(),
      quiet: false,
      ...window.coi,
    };
    const serviceWorker = navigator.serviceWorker;
    const controlling = serviceWorker && serviceWorker.controller;

    if (controlling && !window.crossOriginIsolated) {
      sessionStorage.setItem("coiCoepHasFailed", "true");
    }
    const failed = sessionStorage.getItem("coiCoepHasFailed");

    if (controlling) {
      const degrade = options.coepDegrade()
        && !(degrading || window.crossOriginIsolated);
      controlling.postMessage({
        type: "coepCredentialless",
        value: degrade || (failed && options.coepDegrade())
          ? false
          : options.coepCredentialless(),
      });
      if (degrade) {
        if (!options.quiet) {
          console.log("Reloading page to degrade COEP.");
        }
        sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
        options.doReload("coepdegrade");
      }
      if (options.shouldDeregister()) {
        controlling.postMessage({ type: "deregister" });
      }
    }

    if (window.crossOriginIsolated !== false || !options.shouldRegister()) {
      return;
    }
    if (!window.isSecureContext) {
      if (!options.quiet) {
        console.log("COOP/COEP requires a secure context.");
      }
      return;
    }
    if (!serviceWorker) {
      if (!options.quiet) {
        console.error("COOP/COEP service worker is unavailable.");
      }
      return;
    }

    serviceWorker.register(document.currentScript.src).then((registration) => {
      if (!options.quiet) {
        console.log("COOP/COEP service worker registered", registration.scope);
      }
      registration.addEventListener("updatefound", () => {
        if (!options.quiet) {
          console.log("Reloading for an updated COOP/COEP service worker.");
        }
        sessionStorage.setItem("coiReloadedBySelf", "updatefound");
        options.doReload();
      });
      if (registration.active && !serviceWorker.controller) {
        if (!options.quiet) {
          console.log("Reloading under COOP/COEP service worker control.");
        }
        sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
        options.doReload();
      }
    }, (error) => {
      if (!options.quiet) {
        console.error("COOP/COEP service worker registration failed:", error);
      }
    });
  })();
}
