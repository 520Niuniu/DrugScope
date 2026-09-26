import base64
import getpass
import hashlib
import json
import secrets
import sys


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def hash_password(password: str) -> str:
    salt = base64url(secrets.token_bytes(16))
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    return f"scrypt${salt}${base64url(derived)}"


def main() -> int:
    email = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    if not email or "@" not in email:
        print("Usage: python scripts/hash-password.py user@example.com", file=sys.stderr)
        return 1

    password = getpass.getpass("Password: ")
    if len(password) < 12:
        print("Password must contain at least 12 characters.", file=sys.stderr)
        return 1

    user = {
        "email": email,
        "name": email,
        "passwordHash": hash_password(password),
    }
    print(json.dumps(user, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
