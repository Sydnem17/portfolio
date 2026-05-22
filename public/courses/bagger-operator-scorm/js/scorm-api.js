/* Minimal SCORM 1.2 runtime helper */
const Scorm12 = (() => {
  let api = null;
  let initialized = false;

  function findAPI(win) {
    let tries = 0;
    while (win && tries < 10) {
      if (win.API) return win.API;
      win = win.parent;
      tries += 1;
    }
    return null;
  }

  function getAPI() {
    if (api) return api;
    api = findAPI(window);
    if (!api && window.opener) api = findAPI(window.opener);
    return api;
  }

  function init() {
    const scormApi = getAPI();
    if (!scormApi) return false;
    const ok = scormApi.LMSInitialize('') === 'true';
    initialized = ok;
    return ok;
  }

  function setValue(key, value) {
    const scormApi = getAPI();
    if (!scormApi || !initialized) return false;
    return scormApi.LMSSetValue(key, String(value)) === 'true';
  }

  function commit() {
    const scormApi = getAPI();
    if (!scormApi || !initialized) return false;
    return scormApi.LMSCommit('') === 'true';
  }

  function finish() {
    const scormApi = getAPI();
    if (!scormApi || !initialized) return false;
    const ok = scormApi.LMSFinish('') === 'true';
    initialized = false;
    return ok;
  }

  return { init, setValue, commit, finish };
})();
