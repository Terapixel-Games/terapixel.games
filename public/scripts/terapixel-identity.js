(function () {
  if (typeof window === "undefined" || window.TerapixelIdentity) {
    return;
  }

  var GLOBAL_IDENTITY_KEY = "terapixel_identity_v1";
  var KNOWN_SAVE_KEYS = ["lumarush_save_v1", "color_crunch_save_v1"];
  var AUTH_MARKER_KEY = "tpx_auth";
  var URL_USER_ID_KEYS = [
    "terapixel_user_id",
    "tpx_user_id",
    "profile_id",
    "player_id",
    "playerId",
    "user_id",
  ];
  var URL_EMAIL_KEYS = ["terapixel_email", "email"];
  var URL_DISPLAY_KEYS = [
    "terapixel_display_name",
    "display_name",
    "displayName",
    "name",
  ];
  var URL_LOGOUT_KEYS = ["logout", "logged_out", "tpx_logout"];

  var configFromWindow = window.__TPX_AUTH_CONFIG || {};
  var AUTH_CONFIG = {
    loginUrl: String(configFromWindow.loginUrl || "").trim(),
    logoutUrl: String(configFromWindow.logoutUrl || "").trim(),
    sessionUrl: String(configFromWindow.sessionUrl || "").trim(),
    returnParam: String(configFromWindow.returnParam || "").trim() || "return_to",
    emailParam: String(configFromWindow.emailParam || "").trim() || "email",
    logoutMethod: String(configFromWindow.logoutMethod || "").trim().toUpperCase() || "POST",
    hydrateFromSessionOnLoad:
      String(configFromWindow.hydrateFromSessionOnLoad || "true").toLowerCase() !== "false",
  };

  var listeners = new Set();
  var observedSaveKeys = new Set(KNOWN_SAVE_KEYS);
  var saveSnapshots = new Map();
  var state = readGlobalIdentity();

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function safeParseJson(raw) {
    if (!raw || typeof raw !== "string") {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function normalizeIdentity(value) {
    var row = value && typeof value === "object" ? value : {};
    var userId = String(
      row.terapixel_user_id || row.user_id || row.userId || row.profile_id || row.player_id || ""
    ).trim();
    var displayName = String(
      row.terapixel_display_name || row.display_name || row.displayName || row.name || ""
    ).trim();
    var email = String(row.terapixel_email || row.email || "").trim().toLowerCase();
    return {
      authenticated: !!userId,
      terapixel_user_id: userId,
      terapixel_display_name: displayName,
      terapixel_email: email,
    };
  }

  function emptyIdentity() {
    return normalizeIdentity({});
  }

  function hasIdentity(value) {
    return !!(value && String(value.terapixel_user_id || "").trim());
  }

  function sameIdentity(a, b) {
    return (
      String(a.terapixel_user_id || "") === String(b.terapixel_user_id || "") &&
      String(a.terapixel_display_name || "") === String(b.terapixel_display_name || "") &&
      String(a.terapixel_email || "") === String(b.terapixel_email || "") &&
      Boolean(a.authenticated) === Boolean(b.authenticated)
    );
  }

  function readGlobalIdentity() {
    var parsed = safeParseJson(window.localStorage.getItem(GLOBAL_IDENTITY_KEY));
    return normalizeIdentity(parsed || {});
  }

  function writeGlobalIdentity(identity, source) {
    var normalized = normalizeIdentity(identity);
    var payload = {
      authenticated: normalized.authenticated,
      terapixel_user_id: normalized.terapixel_user_id,
      terapixel_display_name: normalized.terapixel_display_name,
      terapixel_email: normalized.terapixel_email,
      updated_at: nowSeconds(),
      source: String(source || "unknown"),
    };
    window.localStorage.setItem(GLOBAL_IDENTITY_KEY, JSON.stringify(payload));
  }

  function readSavePayload(saveKey) {
    var parsed = safeParseJson(window.localStorage.getItem(saveKey));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  }

  function readIdentityFromSave(saveKey) {
    var save = readSavePayload(saveKey);
    if (!save) {
      return emptyIdentity();
    }
    return normalizeIdentity({
      terapixel_user_id: save.terapixel_user_id,
      terapixel_display_name: save.terapixel_display_name,
      terapixel_email: save.terapixel_email,
    });
  }

  function writeIdentityIntoSave(saveKey, identity) {
    var save = readSavePayload(saveKey) || {};
    var normalized = normalizeIdentity(identity);
    save.terapixel_user_id = normalized.terapixel_user_id;
    save.terapixel_display_name = normalized.terapixel_display_name;
    save.terapixel_email = normalized.terapixel_email;
    window.localStorage.setItem(saveKey, JSON.stringify(save));
    saveSnapshots.set(saveKey, window.localStorage.getItem(saveKey) || "");
  }

  function trackSaveKey(saveKey) {
    if (!saveKey || typeof saveKey !== "string") {
      return;
    }
    observedSaveKeys.add(saveKey);
    saveSnapshots.set(saveKey, window.localStorage.getItem(saveKey) || "");
  }

  function emit(reason) {
    listeners.forEach(function (listener) {
      try {
        listener(getState(), { reason: reason || "unknown" });
      } catch (_err) {
        // Keep listeners isolated.
      }
    });
  }

  function setState(nextIdentity, reason) {
    var normalized = normalizeIdentity(nextIdentity);
    if (sameIdentity(state, normalized)) {
      return;
    }
    state = normalized;
    emit(reason || "state-changed");
  }

  function syncSavesFromIdentity(identity) {
    observedSaveKeys.forEach(function (saveKey) {
      var current = readIdentityFromSave(saveKey);
      if (sameIdentity(current, identity)) {
        return;
      }
      writeIdentityIntoSave(saveKey, identity);
    });
  }

  function setAuthenticatedIdentity(nextIdentity, reason) {
    var normalized = normalizeIdentity(nextIdentity);
    if (!hasIdentity(normalized)) {
      clearIdentity(reason || "clear");
      return;
    }
    writeGlobalIdentity(normalized, reason || "set-authenticated");
    syncSavesFromIdentity(normalized);
    setState(normalized, reason || "set-authenticated");
  }

  function clearIdentity(reason) {
    var cleared = emptyIdentity();
    writeGlobalIdentity(cleared, reason || "logout");
    syncSavesFromIdentity(cleared);
    setState(cleared, reason || "logout");
  }

  function reconcileIdentity(reason) {
    var globalIdentity = readGlobalIdentity();
    if (hasIdentity(globalIdentity)) {
      syncSavesFromIdentity(globalIdentity);
      setState(globalIdentity, reason || "reconcile:global");
      return;
    }

    var saveIdentity = null;
    observedSaveKeys.forEach(function (saveKey) {
      if (saveIdentity) {
        return;
      }
      var candidate = readIdentityFromSave(saveKey);
      if (hasIdentity(candidate)) {
        saveIdentity = candidate;
      }
    });

    if (saveIdentity) {
      writeGlobalIdentity(saveIdentity, "reconcile:save");
      syncSavesFromIdentity(saveIdentity);
      setState(saveIdentity, reason || "reconcile:save");
      return;
    }

    setState(emptyIdentity(), reason || "reconcile:empty");
  }

  function handleSaveMutation(saveKey, reason) {
    var saveIdentity = readIdentityFromSave(saveKey);
    if (hasIdentity(saveIdentity)) {
      setAuthenticatedIdentity(saveIdentity, reason || "save:login");
      return;
    }
    if (hasIdentity(state)) {
      clearIdentity(reason || "save:logout");
      return;
    }
    setState(emptyIdentity(), reason || "save:empty");
  }

  function pollKnownSaves() {
    observedSaveKeys.forEach(function (saveKey) {
      var raw = window.localStorage.getItem(saveKey) || "";
      var prev = saveSnapshots.get(saveKey);
      if (raw === prev) {
        return;
      }
      saveSnapshots.set(saveKey, raw);
      handleSaveMutation(saveKey, "poll:" + saveKey);
    });
  }

  function parseBooleanLike(value) {
    var normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }

  function extractIdentityFromObject(row) {
    if (!row || typeof row !== "object") {
      return emptyIdentity();
    }
    var direct = normalizeIdentity(row);
    if (hasIdentity(direct)) {
      return direct;
    }
    var candidates = [
      row.user,
      row.profile,
      row.identity,
      row.session,
      row.data,
      row.result,
      row.payload,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var nested = normalizeIdentity(candidates[i] || {});
      if (hasIdentity(nested)) {
        return nested;
      }
    }
    return emptyIdentity();
  }

  function buildUrlWithParams(baseUrl, params) {
    var url = new URL(baseUrl, window.location.origin);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function makeAuthReturnUrl() {
    var returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set(AUTH_MARKER_KEY, "1");
    return returnUrl.toString();
  }

  function tryConsumeIdentityFromUrl() {
    var url = new URL(window.location.href);
    var changed = false;
    var sawAuthMarker = parseBooleanLike(url.searchParams.get(AUTH_MARKER_KEY));

    var logoutRequested = URL_LOGOUT_KEYS.some(function (key) {
      var value = url.searchParams.get(key);
      return parseBooleanLike(value);
    });

    var userId = "";
    for (var i = 0; i < URL_USER_ID_KEYS.length; i += 1) {
      userId = String(url.searchParams.get(URL_USER_ID_KEYS[i]) || "").trim();
      if (userId) {
        break;
      }
    }

    var email = "";
    for (var j = 0; j < URL_EMAIL_KEYS.length; j += 1) {
      email = String(url.searchParams.get(URL_EMAIL_KEYS[j]) || "").trim().toLowerCase();
      if (email) {
        break;
      }
    }

    var displayName = "";
    for (var k = 0; k < URL_DISPLAY_KEYS.length; k += 1) {
      displayName = String(url.searchParams.get(URL_DISPLAY_KEYS[k]) || "").trim();
      if (displayName) {
        break;
      }
    }

    if (logoutRequested) {
      clearIdentity("url:logout");
      changed = true;
    } else if (userId) {
      setAuthenticatedIdentity(
        {
          terapixel_user_id: userId,
          terapixel_display_name: displayName,
          terapixel_email: email,
        },
        "url:identity"
      );
      changed = true;
    }

    var keysToRemove = [AUTH_MARKER_KEY]
      .concat(URL_LOGOUT_KEYS)
      .concat(URL_USER_ID_KEYS)
      .concat(URL_EMAIL_KEYS)
      .concat(URL_DISPLAY_KEYS);
    keysToRemove.forEach(function (key) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    if (changed) {
      var cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
      window.history.replaceState({}, "", cleaned);
    }

    return {
      sawAuthMarker: sawAuthMarker,
      hadUrlIdentity: !!userId || logoutRequested,
    };
  }

  async function checkSession() {
    if (!AUTH_CONFIG.sessionUrl) {
      return { ok: false, error: "session endpoint not configured" };
    }
    var response = await fetch(AUTH_CONFIG.sessionUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    var payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      return {
        ok: false,
        error:
          String(
            (payload && payload.error && payload.error.message) ||
              payload.message ||
              "session check failed"
          ) || "session check failed",
      };
    }

    if (payload && payload.authenticated === false) {
      return { ok: true, authenticated: false, identity: emptyIdentity() };
    }

    var identity = extractIdentityFromObject(payload);
    return { ok: true, authenticated: hasIdentity(identity), identity: identity };
  }

  async function hydrateFromSession(reason) {
    var session = await checkSession();
    if (!session.ok) {
      return session;
    }
    if (session.authenticated && hasIdentity(session.identity)) {
      setAuthenticatedIdentity(session.identity, reason || "session:authenticated");
    } else {
      clearIdentity(reason || "session:anonymous");
    }
    return session;
  }

  async function logoutViaPlatform() {
    if (!AUTH_CONFIG.logoutUrl) {
      clearIdentity("site-logout");
      return { ok: true, mode: "local" };
    }

    if (AUTH_CONFIG.logoutMethod === "REDIRECT") {
      var redirectUrl = buildUrlWithParams(AUTH_CONFIG.logoutUrl, {
        return_to: makeAuthReturnUrl(),
      });
      clearIdentity("site-logout");
      window.location.assign(redirectUrl);
      return { ok: true, mode: "redirect" };
    }

    try {
      await fetch(AUTH_CONFIG.logoutUrl, {
        method: AUTH_CONFIG.logoutMethod || "POST",
        credentials: "include",
      });
    } catch (_err) {
      // Local logout still proceeds.
    }
    clearIdentity("site-logout");
    return { ok: true, mode: "request" };
  }

  function getState() {
    return normalizeIdentity(state);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return function () {};
    }
    listeners.add(listener);
    listener(getState(), { reason: "subscribe:init" });
    return function () {
      listeners.delete(listener);
    };
  }

  function connectGameSave(saveKey, options) {
    trackSaveKey(saveKey);
    reconcileIdentity("connect:" + saveKey);
    var opts = options || {};
    if (opts.reloadOnGlobalAuthChange) {
      var previous = JSON.stringify(getState());
      subscribe(function (next, meta) {
        var current = JSON.stringify(next);
        if (previous === current) {
          return;
        }
        if (meta && /^storage:global:/.test(String(meta.reason || ""))) {
          window.location.reload();
        }
        previous = current;
      });
    }
    return { saveKey: saveKey };
  }

  function startLogin(emailHint) {
    if (!AUTH_CONFIG.loginUrl) {
      throw new Error("Site login is not configured.");
    }
    var params = {};
    params[AUTH_CONFIG.returnParam] = makeAuthReturnUrl();
    var normalizedEmail = String(emailHint || "").trim().toLowerCase();
    if (normalizedEmail) {
      params[AUTH_CONFIG.emailParam] = normalizedEmail;
    }
    var targetUrl = buildUrlWithParams(AUTH_CONFIG.loginUrl, params);
    window.location.assign(targetUrl);
  }

  function handleStorageEvent(event) {
    if (!event || !event.key) {
      return;
    }
    var key = String(event.key);
    if (key === GLOBAL_IDENTITY_KEY) {
      reconcileIdentity("storage:global:" + key);
      return;
    }
    if (observedSaveKeys.has(key)) {
      saveSnapshots.set(key, window.localStorage.getItem(key) || "");
      handleSaveMutation(key, "storage:save:" + key);
    }
  }

  window.addEventListener("storage", handleStorageEvent);
  observedSaveKeys.forEach(trackSaveKey);

  var urlState = tryConsumeIdentityFromUrl();
  reconcileIdentity("boot");

  if (
    AUTH_CONFIG.hydrateFromSessionOnLoad &&
    AUTH_CONFIG.sessionUrl &&
    (urlState.sawAuthMarker || !hasIdentity(state))
  ) {
    hydrateFromSession("boot:session").catch(function () {
      // Session hydration is optional.
    });
  }

  window.setInterval(pollKnownSaves, 1000);

  var api = {
    config: AUTH_CONFIG,
    getState: getState,
    subscribe: subscribe,
    connectGameSave: connectGameSave,
    setIdentity: function (identity) {
      setAuthenticatedIdentity(identity, "site-set-identity");
    },
    clearIdentity: function () {
      clearIdentity("site-clear");
    },
    checkSession: checkSession,
    hydrateFromSession: hydrateFromSession,
    startLogin: startLogin,
    logout: logoutViaPlatform,
  };

  window.TerapixelIdentity = api;

  function bindAuthUi() {
    var openButton = document.getElementById("tpx-auth-open");
    var modal = document.getElementById("tpx-auth-modal");
    var closeButton = document.getElementById("tpx-auth-close");
    var emailInput = document.getElementById("tpx-auth-email");
    var submitButton = document.getElementById("tpx-auth-submit");
    var logoutButton = document.getElementById("tpx-auth-logout");
    var statusText = document.getElementById("tpx-auth-status");
    var labelText = document.getElementById("tpx-auth-label");
    var accountNavItem = document.getElementById("tpx-account-nav");

    if (!openButton || !modal || !closeButton || !statusText || !labelText) {
      return;
    }

    var isBusy = false;

    function setBusy(nextBusy) {
      isBusy = !!nextBusy;
      if (submitButton) {
        submitButton.disabled = isBusy;
      }
      if (logoutButton) {
        logoutButton.disabled = isBusy;
      }
      if (closeButton) {
        closeButton.disabled = isBusy;
      }
      if (emailInput) {
        emailInput.disabled = isBusy;
      }
    }

    function formatStateLabel(value) {
      if (!value || !value.authenticated) {
        return "Guest";
      }
      if (value.terapixel_email) {
        return value.terapixel_email;
      }
      if (value.terapixel_display_name) {
        return value.terapixel_display_name;
      }
      var id = String(value.terapixel_user_id || "");
      return id ? "Profile " + id.slice(0, 8) : "Logged In";
    }

    function openModal() {
      modal.classList.remove("hidden");
    }

    function closeModal() {
      if (isBusy) {
        return;
      }
      modal.classList.add("hidden");
    }

    function render(currentState) {
      var authed = !!(currentState && currentState.authenticated);
      labelText.textContent = formatStateLabel(currentState);
      openButton.textContent = authed ? "Account" : "Login";
      labelText.classList.toggle("hidden", !authed);
      if (accountNavItem) {
        accountNavItem.classList.toggle("hidden", !authed);
      }
      if (submitButton) {
        submitButton.classList.toggle("hidden", authed);
      }
      if (emailInput) {
        emailInput.classList.toggle("hidden", authed);
      }
      if (logoutButton) {
        logoutButton.classList.toggle("hidden", !authed);
      }
      if (!authed) {
        if (!AUTH_CONFIG.loginUrl) {
          statusText.textContent = "Login is not configured yet.";
        } else {
          statusText.textContent = "Enter email and continue to login.";
        }
      } else {
        statusText.textContent = "Logged in. Logout here to sign out everywhere.";
      }
    }

    openButton.addEventListener("click", function () {
      render(api.getState());
      openModal();
      if (emailInput && !api.getState().authenticated) {
        emailInput.focus();
      }
    });

    closeButton.addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    if (submitButton) {
      submitButton.addEventListener("click", function () {
        var email = String((emailInput && emailInput.value) || "").trim().toLowerCase();
        if (!AUTH_CONFIG.loginUrl) {
          statusText.textContent = "Login is not configured yet.";
          return;
        }
        setBusy(true);
        statusText.textContent = "Redirecting to login...";
        try {
          api.startLogin(email);
        } catch (err) {
          setBusy(false);
          statusText.textContent = String(
            (err && err.message) || "Login could not be started."
          );
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async function () {
        setBusy(true);
        statusText.textContent = "Logging out...";
        try {
          await api.logout();
          statusText.textContent = "Logged out.";
          render(api.getState());
          await sleep(400);
          closeModal();
        } catch (err) {
          statusText.textContent = String(
            (err && err.message) || "Logout failed. Please try again."
          );
        } finally {
          setBusy(false);
        }
      });
    }

    subscribe(function (nextState) {
      render(nextState);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAuthUi);
  } else {
    bindAuthUi();
  }
})();
