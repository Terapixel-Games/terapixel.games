const HEALTH_PATH = "/_edge/health";

function hasPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function stripPrefix(pathname, prefix) {
  const stripped = pathname.slice(prefix.length);
  return stripped === "" ? "/" : stripped;
}

function joinPath(basePath, pathname) {
  const left = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return `${left}${pathname}`;
}

function parseOrigin(origin) {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function resolveRoute(pathname) {
  if (hasPrefix(pathname, "/v1/admin")) {
    return {
      target: "CONTROL_PLANE_ORIGIN",
      pathname,
      noStore: true,
      route: "control-plane-admin-api",
    };
  }

  if (hasPrefix(pathname, "/staging/api")) {
    return {
      target: "STAGING_API_ORIGIN",
      pathname: stripPrefix(pathname, "/staging/api"),
      noStore: true,
      route: "staging-api",
    };
  }

  if (hasPrefix(pathname, "/api")) {
    return {
      target: "PROD_API_ORIGIN",
      pathname: stripPrefix(pathname, "/api"),
      noStore: true,
      route: "prod-api",
    };
  }

  if (hasPrefix(pathname, "/staging/admin")) {
    return {
      target: "STAGING_SITE_ORIGIN",
      pathname: "/staging/index.html",
      noStore: true,
      route: "staging-admin-spa",
    };
  }

  if (hasPrefix(pathname, "/staging")) {
    return {
      target: "STAGING_SITE_ORIGIN",
      pathname,
      noStore: true,
      route: "staging-site",
    };
  }

  if (hasPrefix(pathname, "/admin")) {
    return {
      target: "CONTROL_PLANE_ORIGIN",
      pathname,
      noStore: false,
      route: "control-plane-admin",
    };
  }

  return {
    target: "PROD_SITE_ORIGIN",
    pathname,
    noStore: false,
    route: "prod-site",
  };
}

function applyCachePolicy(response, noStore) {
  if (!noStore) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function makeRequest(request, upstreamUrl, routeName) {
  const headers = new Headers(request.headers);
  headers.set("x-terapixel-edge-route", routeName);

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "follow",
  });
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === HEALTH_PATH) {
      return Response.json({
        ok: true,
        service: "terapixel-edge-router",
      });
    }

    const route = resolveRoute(requestUrl.pathname);
    const origin = env[route.target];
    if (!origin) {
      return new Response(`Missing required binding: ${route.target}`, { status: 500 });
    }

    const parsedOrigin = parseOrigin(origin);
    if (!parsedOrigin) {
      return new Response(`Invalid origin URL in binding: ${route.target}`, { status: 500 });
    }

    const upstreamPath = joinPath(parsedOrigin.pathname, route.pathname);
    const upstreamUrl = new URL(parsedOrigin.origin);
    upstreamUrl.pathname = upstreamPath;
    upstreamUrl.search = requestUrl.search;

    const upstreamRequest = makeRequest(request, upstreamUrl.toString(), route.route);
    const upstreamResponse = await fetch(
      upstreamRequest,
      route.route.endsWith("api") ? { cf: { cacheTtl: 0, cacheEverything: false } } : undefined,
    );
    return applyCachePolicy(upstreamResponse, route.noStore);
  },
};
