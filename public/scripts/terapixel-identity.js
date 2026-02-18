(function () {
  if (typeof window === "undefined" || window.TerapixelIdentity) {
    return;
  }

  var GLOBAL_IDENTITY_KEY = "terapixel_identity_v1";
  var SITE_DEVICE_KEY = "terapixel_site_device_id_v1";
  var SITE_USERNAME_KEY = "terapixel_site_username_v1";
  var KNOWN_SAVE_KEYS = ["lumarush_save_v1", "color_crunch_save_v1"];

  var configFromWindow = window.__TPX_AUTH_CONFIG || {};
  var AUTH_CONFIG = {
    nakamaBaseUrl:
      String(configFromWindow.nakamaBaseUrl || "").trim() ||
      "https://lumarush-nakama.onrender.com",
    nakamaServerKey: String(configFromWindow.nakamaServerKey || "").trim(),
    authGameId: String(configFromWindow.authGameId || "").trim() || "lumarush",
    authPlatform: String(configFromWindow.authPlatform || "").trim() || "terapixel",
  };

  var listeners = new Set();
  var observedSaveKeys = new Set(KNOWN_SAVE_KEYS);
  var saveSnapshots = new Map();
  var state = readGlobalIdentity();
  var siteSession = null;

  function nowMs() {
    return Date.now();
  }

  function shallowEqualIdentity(a, b) {
    return (
      String(a.terapixel_user_id || "") === String(b.terapixel_user_id || "") &&
      String(a.terapixel_display_name || "") === String(b.terapixel_display_name || "") &&
      String(a.terapixel_email || "") === String(b.terapixel_email || "") &&
      Boolean(a.authenticated) === Boolean(b.authenticated)
    );
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
      row.terapixel_user_id || row.user_id || row.userId || ""
    ).trim();
    var displayName = String(
      row.terapixel_display_name || row.display_name || row.displayName || ""
    ).trim();
    var email = String(
      row.terapixel_email || row.email || row.linked_email || ""
    )
      .trim()
      .toLowerCase();
    var authenticated = !!userId;
    return {
      authenticated: authenticated,
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

  function readGlobalIdentity() {
    var parsed = safeParseJson(window.localStorage.getItem(GLOBAL_IDENTITY_KEY));
    return normalizeIdentity(parsed || {});
  }

  function writeGlobalIdentity(nextIdentity, source) {
    var identity = normalizeIdentity(nextIdentity);
    var payload = {
      authenticated: identity.authenticated,
      terapixel_user_id: identity.terapixel_user_id,
      terapixel_display_name: identity.terapixel_display_name,
      terapixel_email: identity.terapixel_email,
      updated_at: Math.floor(nowMs() / 1000),
      source: String(source || "").trim() || "unknown",
    };
    window.localStorage.setItem(GLOBAL_IDENTITY_KEY, JSON.stringify(payload));
  }

  function readSavePayload(saveKey) {
    var raw = window.localStorage.getItem(saveKey);
    var parsed = safeParseJson(raw);
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
    var save = readSavePayload(saveKey);
    if (!save) {
      save = {};
    }
    var normalized = normalizeIdentity(identity);
    save.terapixel_user_id = normalized.terapixel_user_id;
    save.terapixel_display_name = normalized.terapixel_display_name;
    save.terapixel_email = normalized.terapixel_email;
    window.localStorage.setItem(saveKey, JSON.stringify(save));
    saveSnapshots.set(saveKey, window.localStorage.getItem(saveKey) || "");
  }

  function clearIdentityInSave(saveKey) {
    writeIdentityIntoSave(saveKey, emptyIdentity());
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
        // Keep listener fanout isolated.
      }
    });
  }

  function setState(nextIdentity, reason) {
    var normalized = normalizeIdentity(nextIdentity);
    if (shallowEqualIdentity(state, normalized)) {
      return;
    }
    state = normalized;
    emit(reason || "state-changed");
  }

  function syncAllKnownSavesFromIdentity(identity) {
    observedSaveKeys.forEach(function (saveKey) {
      var current = readIdentityFromSave(saveKey);
      if (shallowEqualIdentity(current, identity)) {
        return;
      }
      writeIdentityIntoSave(saveKey, identity);
    });
  }

  function setAuthenticatedIdentity(nextIdentity, reason) {
    var normalized = normalizeIdentity(nextIdentity);
    if (!hasIdentity(normalized)) {
      clearIdentity(reason);
      return;
    }
    writeGlobalIdentity(normalized, reason || "identity-set");
    syncAllKnownSavesFromIdentity(normalized);
    setState(normalized, reason || "identity-set");
  }

  function clearIdentity(reason) {
    var empty = emptyIdentity();
    writeGlobalIdentity(empty, reason || "logout");
    observedSaveKeys.forEach(function (saveKey) {
      clearIdentityInSave(saveKey);
    });
    setState(empty, reason || "logout");
  }

  function reconcileIdentity(reason) {
    var fromGlobal = readGlobalIdentity();
    if (hasIdentity(fromGlobal)) {
      syncAllKnownSavesFromIdentity(fromGlobal);
      setState(fromGlobal, reason || "reconcile:global");
      return;
    }

    var fromSaves = null;
    observedSaveKeys.forEach(function (saveKey) {
      if (fromSaves) {
        return;
      }
      var fromSave = readIdentityFromSave(saveKey);
      if (hasIdentity(fromSave)) {
        fromSaves = fromSave;
      }
    });

    if (fromSaves) {
      writeGlobalIdentity(fromSaves, "reconcile:save");
      syncAllKnownSavesFromIdentity(fromSaves);
      setState(fromSaves, reason || "reconcile:save");
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
      var previous = saveSnapshots.get(saveKey);
      if (previous === raw) {
        return;
      }
      saveSnapshots.set(saveKey, raw);
      handleSaveMutation(saveKey, "poll:" + saveKey);
    });
  }

  function decodeJwtExp(token) {
    try {
      var parts = String(token || "").split(".");
      if (parts.length < 2) {
        return 0;
      }
      var payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var json = atob(payloadB64);
      var payload = JSON.parse(json);
      return Number(payload.exp || 0) * 1000;
    } catch (_err) {
      return 0;
    }
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return String(Math.floor(Math.random() * 1e12));
  }

  function getOrCreateSiteDeviceId() {
    var current = String(window.localStorage.getItem(SITE_DEVICE_KEY) || "").trim();
    if (current) {
      return current;
    }
    current = "site-" + randomId();
    window.localStorage.setItem(SITE_DEVICE_KEY, current);
    return current;
  }

  function getOrCreateSiteUsername() {
    var current = String(window.localStorage.getItem(SITE_USERNAME_KEY) || "").trim();
    if (current) {
      return current;
    }
    current = "site" + randomId().replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
    window.localStorage.setItem(SITE_USERNAME_KEY, current);
    return current;
  }

  function basicAuthValue(serverKey) {
    return "Basic " + btoa(String(serverKey || "").trim() + ":");
  }

  async function authenticateSiteDevice(forceRefresh) {
    if (!AUTH_CONFIG.nakamaServerKey) {
      throw new Error("Site login is not configured.");
    }
    if (!forceRefresh && siteSession && siteSession.token && siteSession.expiresAtMs > nowMs() + 30 * 1000) {
      return siteSession;
    }
    var deviceId = getOrCreateSiteDeviceId();
    var username = getOrCreateSiteUsername();
    var baseUrl = AUTH_CONFIG.nakamaBaseUrl.replace(/\/+$/, "");
    var url =
      baseUrl +
      "/v2/account/authenticate/device?create=true&username=" +
      encodeURIComponent(username);
    var body = {
      id: deviceId,
      vars: {
        platform: AUTH_CONFIG.authPlatform,
        game: AUTH_CONFIG.authGameId,
        terapixel_user_id: "",
      },
    };
    var response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthValue(AUTH_CONFIG.nakamaServerKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    var payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok || !payload.token) {
      throw new Error("Failed to initialize site auth session.");
    }
    var expiresAtMs = decodeJwtExp(payload.token);
    if (!expiresAtMs || !isFinite(expiresAtMs)) {
      expiresAtMs = nowMs() + 5 * 60 * 1000;
    }
    siteSession = {
      token: String(payload.token),
      expiresAtMs: expiresAtMs,
    };
    return siteSession;
  }

  function parseRpcPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return {};
    }
    if (payload.payload && typeof payload.payload === "string") {
      return safeParseJson(payload.payload) || {};
    }
    if (payload.payload && typeof payload.payload === "object") {
      return payload.payload;
    }
    return payload;
  }

  async function callRpc(rpcId, data) {
    var baseUrl = AUTH_CONFIG.nakamaBaseUrl.replace(/\/+$/, "");
    var payloadBody = JSON.stringify(JSON.stringify(data || {}));
    for (var attempt = 0; attempt < 2; attempt += 1) {
      var session = await authenticateSiteDevice(attempt > 0);
      var response = await fetch(baseUrl + "/v2/rpc/" + encodeURIComponent(rpcId), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + session.token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payloadBody,
      });
      var payload = await response.json().catch(function () {
        return {};
      });
      if (response.status === 401) {
        siteSession = null;
        continue;
      }
      if (!response.ok) {
        var message =
          (payload &&
            payload.message) ||
          (payload &&
            payload.error &&
            payload.error.message) ||
          "RPC request failed.";
        throw new Error(String(message));
      }
      return parseRpcPayload(payload);
    }
    throw new Error("Unable to authenticate session for RPC request.");
  }

  function getProfileIdFromStatus(status) {
    return String(
      status.primaryProfileId ||
        status.primary_profile_id ||
        status.secondaryProfileId ||
        status.secondary_profile_id ||
        status.profile_id ||
        status.profileId ||
        ""
    ).trim();
  }

  async function startSiteLogin(email) {
    var normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.indexOf("@") <= 0) {
      throw new Error("Enter a valid email address.");
    }
    var start = await callRpc("tpx_account_magic_link_start", {
      email: normalizedEmail,
    });
    return {
      email: normalizedEmail,
      start: start,
    };
  }

  async function checkSiteLoginStatus() {
    return callRpc("tpx_account_magic_link_status", {
      clear_after_read: false,
    });
  }

  async function waitForSiteLoginCompletion(email, options) {
    var normalizedEmail = String(email || "").trim().toLowerCase();
    var timeoutMs = Number((options && options.timeoutMs) || 5 * 60 * 1000);
    var intervalMs = Number((options && options.intervalMs) || 3000);
    var onProgress =
      options && typeof options.onProgress === "function" ? options.onProgress : null;
    var startedAt = nowMs();

    while (nowMs() - startedAt <= timeoutMs) {
      var status = await checkSiteLoginStatus();
      if (status && status.completed) {
        var profileId = getProfileIdFromStatus(status);
        if (!profileId) {
          throw new Error("Login completed but profile id was missing.");
        }
        setAuthenticatedIdentity(
          {
            terapixel_user_id: profileId,
            terapixel_display_name: "",
            terapixel_email: String(status.email || normalizedEmail || "").trim().toLowerCase(),
          },
          "site-login"
        );
        return status;
      }
      if (onProgress) {
        onProgress(status || {});
      }
      await new Promise(function (resolve) {
        window.setTimeout(resolve, intervalMs);
      });
    }
    throw new Error("Timed out waiting for email link completion.");
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
    return {
      saveKey: saveKey,
    };
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
  reconcileIdentity("boot");
  window.setInterval(pollKnownSaves, 1000);

  var api = {
    getState: getState,
    subscribe: subscribe,
    connectGameSave: connectGameSave,
    startLogin: startSiteLogin,
    waitForLoginCompletion: waitForSiteLoginCompletion,
    checkLoginStatus: checkSiteLoginStatus,
    logout: function () {
      clearIdentity("site-logout");
    },
    setIdentity: function (identity) {
      setAuthenticatedIdentity(identity, "site-set-identity");
    },
    config: AUTH_CONFIG,
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

    if (!openButton || !modal || !closeButton || !statusText || !labelText) {
      return;
    }

    var pollInFlight = false;

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

    function setBusy(isBusy) {
      if (submitButton) {
        submitButton.disabled = isBusy;
      }
      if (logoutButton) {
        logoutButton.disabled = isBusy;
      }
      if (emailInput) {
        emailInput.disabled = isBusy;
      }
      if (closeButton) {
        closeButton.disabled = isBusy;
      }
    }

    function showModal() {
      modal.classList.remove("hidden");
    }

    function hideModal() {
      modal.classList.add("hidden");
      setBusy(false);
      pollInFlight = false;
    }

    function render(stateValue) {
      var authed = !!(stateValue && stateValue.authenticated);
      labelText.textContent = formatStateLabel(stateValue);
      openButton.textContent = authed ? "Account" : "Login";
      if (submitButton) {
        submitButton.classList.toggle("hidden", authed);
      }
      if (emailInput) {
        emailInput.classList.toggle("hidden", authed);
      }
      if (logoutButton) {
        logoutButton.classList.toggle("hidden", !authed);
      }
      if (!authed && !pollInFlight) {
        statusText.textContent = "Enter your email to receive a magic link.";
      } else if (authed) {
        statusText.textContent = "Logged in. Logout here to sign out everywhere.";
      }
    }

    openButton.addEventListener("click", function () {
      render(api.getState());
      showModal();
      if (emailInput && !api.getState().authenticated) {
        emailInput.focus();
      }
    });

    closeButton.addEventListener("click", hideModal);
    modal.addEventListener("click", function (event) {
      if (event.target === modal && !pollInFlight) {
        hideModal();
      }
    });

    if (logoutButton) {
      logoutButton.addEventListener("click", function () {
        api.logout();
        statusText.textContent = "Logged out.";
        render(api.getState());
      });
    }

    if (submitButton) {
      submitButton.addEventListener("click", async function () {
        if (!emailInput) {
          return;
        }
        var email = String(emailInput.value || "").trim().toLowerCase();
        if (!email) {
          statusText.textContent = "Enter a valid email address.";
          return;
        }
        pollInFlight = true;
        setBusy(true);
        statusText.textContent = "Sending magic link...";
        try {
          await api.startLogin(email);
          statusText.textContent = "Email sent. Waiting for link click...";
          await api.waitForLoginCompletion(email, {
            timeoutMs: 5 * 60 * 1000,
            intervalMs: 3000,
            onProgress: function () {
              statusText.textContent = "Waiting for link click...";
            },
          });
          statusText.textContent = "Login complete.";
          render(api.getState());
          window.setTimeout(hideModal, 600);
        } catch (err) {
          statusText.textContent = String(
            (err && err.message) || "Login failed. Please try again."
          );
          setBusy(false);
          pollInFlight = false;
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
