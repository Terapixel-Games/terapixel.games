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

function shouldAppendSlash(pathname) {
  if (pathname === "/" || pathname.endsWith("/")) {
    return false;
  }

  // Treat extension-like paths as files, not routes.
  return !pathname.split("/").pop().includes(".");
}

function resolveNakamaRoute(pathname) {
  const routes = [
    {
      prefix: "/staging/nakama/lumarush",
      target: "STAGING_NAKAMA_LUMARUSH_ORIGIN",
      route: "staging-nakama-lumarush",
    },
    {
      prefix: "/staging/nakama/color-crunch",
      target: "STAGING_NAKAMA_COLOR_CRUNCH_ORIGIN",
      route: "staging-nakama-color-crunch",
    },
    {
      prefix: "/staging/nakama/colorcrunch",
      target: "STAGING_NAKAMA_COLOR_CRUNCH_ORIGIN",
      route: "staging-nakama-color-crunch",
    },
    {
      prefix: "/staging/nakama/speedsolitaire",
      target: "STAGING_NAKAMA_SPEEDSOLITAIRE_ORIGIN",
      route: "staging-nakama-speedsolitaire",
    },
    {
      prefix: "/staging/nakama/speed-solitaire",
      target: "STAGING_NAKAMA_SPEEDSOLITAIRE_ORIGIN",
      route: "staging-nakama-speedsolitaire",
    },
    {
      prefix: "/nakama/lumarush",
      target: "NAKAMA_LUMARUSH_ORIGIN",
      route: "nakama-lumarush",
    },
    {
      prefix: "/nakama/color-crunch",
      target: "NAKAMA_COLOR_CRUNCH_ORIGIN",
      route: "nakama-color-crunch",
    },
    {
      prefix: "/nakama/colorcrunch",
      target: "NAKAMA_COLOR_CRUNCH_ORIGIN",
      route: "nakama-color-crunch",
    },
    {
      prefix: "/nakama/speedsolitaire",
      target: "NAKAMA_SPEEDSOLITAIRE_ORIGIN",
      route: "nakama-speedsolitaire",
    },
    {
      prefix: "/nakama/speed-solitaire",
      target: "NAKAMA_SPEEDSOLITAIRE_ORIGIN",
      route: "nakama-speedsolitaire",
    },
  ];

  for (const entry of routes) {
    if (hasPrefix(pathname, entry.prefix)) {
      return {
        target: entry.target,
        pathname: stripPrefix(pathname, entry.prefix),
        noStore: true,
        route: entry.route,
      };
    }
  }

  return null;
}

function resolveRoute(pathname) {
  const nakamaRoute = resolveNakamaRoute(pathname);
  if (nakamaRoute) {
    return nakamaRoute;
  }

  if (hasPrefix(pathname, "/staging/v1/admin")) {
    return {
      target: "STAGING_CONTROL_PLANE_ORIGIN",
      pathname: stripPrefix(pathname, "/staging"),
      noStore: true,
      route: "staging-control-plane-admin-api",
    };
  }

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
      target: "STAGING_CONTROL_PLANE_ORIGIN",
      pathname: stripPrefix(pathname, "/staging"),
      noStore: true,
      route: "staging-control-plane-admin",
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
      noStore: true,
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

function routeRequiresOriginSecret(route) {
  return (
    route.target === "PROD_API_ORIGIN" ||
    route.target === "STAGING_API_ORIGIN" ||
    route.target === "CONTROL_PLANE_ORIGIN" ||
    route.target === "STAGING_CONTROL_PLANE_ORIGIN"
  );
}

function resolveOriginSecret(route, env) {
  if (!routeRequiresOriginSecret(route)) {
    return "";
  }
  if (route.target === "STAGING_API_ORIGIN" || route.target === "STAGING_CONTROL_PLANE_ORIGIN") {
    return String(env.ORIGIN_AUTH_SECRET_STAGING || "");
  }
  return String(env.ORIGIN_AUTH_SECRET_PROD || "");
}

function makeRequest(request, upstreamUrl, routeName, originSecret) {
  const headers = new Headers(request.headers);
  headers.set("x-terapixel-edge-route", routeName);
  if (originSecret) {
    headers.set("x-terapixel-origin-secret", originSecret);
  }

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

    const normalizedPathname =
      route.target === "PROD_SITE_ORIGIN" && shouldAppendSlash(route.pathname) ? `${route.pathname}/` : route.pathname;

    const upstreamPath = joinPath(parsedOrigin.pathname, normalizedPathname);
    const upstreamUrl = new URL(parsedOrigin.origin);
    upstreamUrl.pathname = upstreamPath;
    upstreamUrl.search = requestUrl.search;

    const originSecret = resolveOriginSecret(route, env);
    const upstreamRequest = makeRequest(request, upstreamUrl.toString(), route.route, originSecret);
    const upstreamResponse = await fetch(
      upstreamRequest,
      route.route.endsWith("api") ? { cf: { cacheTtl: 0, cacheEverything: false } } : undefined,
    );
    return applyCachePolicy(upstreamResponse, route.noStore);
  },
};
