(function () {
  var BUILD_KEY = "crm_build_id";
  var RELOAD_ONCE_KEY = "crm_build_reload_once";

  function clearClientCaches() {
    var tasks = [];
    if ("caches" in window) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        })
      );
    }
    if ("serviceWorker" in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    return Promise.all(tasks);
  }

  window.crmForceAppUpdate = function () {
    localStorage.removeItem(BUILD_KEY);
    sessionStorage.removeItem(RELOAD_ONCE_KEY);
    return clearClientCaches().finally(function () {
      location.reload();
    });
  };

  function fetchWithTimeout(url, ms) {
    return Promise.race([
      fetch(url, { cache: "no-store" }),
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, ms);
      }),
    ]);
  }

  fetchWithTimeout("/build-version.json?_=" + Date.now(), 8000)
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (payload) {
      if (!payload) return;
      var nextId = String(payload.builtAt || payload.version || "");
      if (!nextId) return;
      var prevId = localStorage.getItem(BUILD_KEY);
      if (!prevId) {
        localStorage.setItem(BUILD_KEY, nextId);
        return;
      }
      if (prevId === nextId) return;
      localStorage.setItem(BUILD_KEY, nextId);
      if (sessionStorage.getItem(RELOAD_ONCE_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_ONCE_KEY, "1");
      return clearClientCaches().finally(function () {
        location.reload();
      });
    })
    .catch(function () { /* ignore */ });
})();
