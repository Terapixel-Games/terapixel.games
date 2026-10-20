"""Check public build configuration and gcloud's source manifest without logging values."""
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

KEYS = {
    "PUBLIC_TPX_IDENTITY_LOGIN_URL", "PUBLIC_TPX_IDENTITY_LOGOUT_URL",
    "PUBLIC_TPX_IDENTITY_SESSION_URL", "PUBLIC_TPX_IDENTITY_RETURN_PARAM",
    "PUBLIC_TPX_IDENTITY_EMAIL_PARAM", "PUBLIC_TPX_IDENTITY_LOGOUT_METHOD",
    "PUBLIC_TPX_IDENTITY_HYDRATE_SESSION_ON_LOAD", "PUBLIC_TPX_BUILD_ID",
}


def validate(config, manifest):
    values = {}
    for line in config.splitlines():
        if not line.strip():
            continue
        key, separator, value = line.partition("=")
        if not separator or key not in KEYS or key in values:
            raise ValueError("Build configuration must contain only the expected public keys, once each")
        values[key] = value
    if values.keys() != KEYS:
        raise ValueError("Missing public build configuration keys")
    if not re.fullmatch(r"[0-9a-f]{40}", values["PUBLIC_TPX_BUILD_ID"]):
        raise ValueError("Build revision must be a full commit SHA")
    for key, value in values.items():
        if key.endswith("_URL") and value:
            url = urlsplit(value)
            if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
                raise ValueError("Public endpoint URLs must not contain credentials")
    files = {line.removeprefix("./") for line in manifest.splitlines()}
    if ".env.production" not in files or "Dockerfile" not in files:
        raise ValueError("Upload manifest must include public build configuration and Dockerfile")
    for name in files:
        if name.startswith(".git/") or name == ".git" or name.startswith("gha-creds-") or (name.startswith(".env") and name != ".env.production"):
            raise ValueError("Upload manifest includes a prohibited credential or environment file")


if __name__ == "__main__":
    try:
        validate(Path(sys.argv[1]).read_text(), sys.stdin.read())
    except (ValueError, OSError) as error:
        sys.exit(str(error))
    print("Production upload manifest and public configuration verified (values withheld).")
