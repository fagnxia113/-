# -*- coding: utf-8 -*-
"""
Web admin authentication module.

Single toggle (ADMIN_AUTH_ENABLED) + file-based credentials.
First login sets initial password; supports web change-password and CLI reset.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import hmac
import logging
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

from dotenv import dotenv_values

logger = logging.getLogger(__name__)

COOKIE_NAME = "dsa_session"
PBKDF2_ITERATIONS = 100_000
RATE_LIMIT_WINDOW_SEC = 300
RATE_LIMIT_MAX_FAILURES = 5
SESSION_MAX_AGE_HOURS_DEFAULT = 24
MIN_PASSWORD_LEN = 6
VALID_ROLES = ("admin", "user")

# Lazy-loaded state
_auth_enabled: Optional[bool] = None
_session_secret: Optional[bytes] = None
_password_hash_salt: Optional[bytes] = None
_password_hash_stored: Optional[bytes] = None
_rate_limit: dict[str, Tuple[int, float]] = {}
_rate_limit_lock = None


def _get_lock():
    """Lazy init threading lock for rate limit dict."""
    global _rate_limit_lock
    if _rate_limit_lock is None:
        import threading
        _rate_limit_lock = threading.Lock()
    return _rate_limit_lock


def _ensure_env_loaded() -> None:
    """Ensure .env is loaded before reading config."""
    from src.config import setup_env
    setup_env()


def _get_data_dir() -> Path:
    """Return DATA_DIR as parent of DATABASE_PATH."""
    db_path = os.getenv("DATABASE_PATH", "./data/stock_analysis.db")
    return Path(db_path).resolve().parent


def _get_credential_path() -> Path:
    """Path to stored password hash file."""
    return _get_data_dir() / ".admin_password_hash"


def _is_auth_enabled_from_env() -> bool:
    """Read ADMIN_AUTH_ENABLED from .env file."""
    _ensure_env_loaded()
    env_file = os.getenv("ENV_FILE")
    env_path = Path(env_file) if env_file else Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return False
    values = dotenv_values(env_path)
    val = (values.get("ADMIN_AUTH_ENABLED") or "").strip().lower()
    return val in ("true", "1", "yes")


def rotate_session_secret() -> bool:
    """Rotate the session signing secret to invalidate all active sessions."""
    global _session_secret
    data_dir = _get_data_dir()
    secret_path = data_dir / ".session_secret"
    data_dir.mkdir(parents=True, exist_ok=True)
    new_secret = secrets.token_bytes(32)
    try:
        tmp_path = secret_path.with_suffix(".tmp")
        tmp_path.write_bytes(new_secret)
        tmp_path.chmod(0o600)
        tmp_path.replace(secret_path)
        _session_secret = new_secret
        logger.info("Session secret rotated successfully")
        return True
    except OSError as e:
        logger.error("Failed to rotate .session_secret: %s", e)
        return False


def _load_session_secret() -> Optional[bytes]:
    """Load or create session secret."""
    global _session_secret
    if _session_secret is not None:
        return _session_secret

    data_dir = _get_data_dir()
    secret_path = data_dir / ".session_secret"

    try:
        if secret_path.exists():
            _session_secret = secret_path.read_bytes()
            if len(_session_secret) != 32:
                logger.warning("Invalid .session_secret length, regenerating")
                _session_secret = None
                if rotate_session_secret():
                    return _session_secret
                return None
            return _session_secret

        data_dir.mkdir(parents=True, exist_ok=True)
        new_secret = secrets.token_bytes(32)
        try:
            with open(secret_path, "xb") as f:
                f.write(new_secret)
            secret_path.chmod(0o600)
        except FileExistsError:
            _session_secret = secret_path.read_bytes()
        else:
            _session_secret = new_secret
        return _session_secret
    except OSError as e:
        logger.error("Failed to create or read .session_secret: %s", e)
        return None


def _parse_password_hash(value: str) -> Optional[Tuple[bytes, bytes]]:
    """Parse salt_b64:hash_b64. Returns (salt, hash) or None."""
    if not value or ":" not in value:
        return None
    parts = value.strip().split(":", 1)
    if len(parts) != 2:
        return None
    try:
        salt_b64, hash_b64 = parts[0].strip(), parts[1].strip()
        salt = base64.standard_b64decode(salt_b64)
        stored_hash = base64.standard_b64decode(hash_b64)
        if salt and stored_hash:
            return (salt, stored_hash)
    except (ValueError, TypeError):
        pass
    return None


def _verify_password_hash(submitted: str, salt: bytes, stored_hash: bytes) -> bool:
    """Verify submitted password against stored pbkdf2 hash."""
    computed = hashlib.pbkdf2_hmac(
        "sha256",
        submitted.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return hmac.compare_digest(computed, stored_hash)


def _load_credential_from_file() -> bool:
    """Load credential from file into module globals. Returns True if loaded."""
    global _password_hash_salt, _password_hash_stored

    path = _get_credential_path()
    if not path.exists():
        _password_hash_salt = None
        _password_hash_stored = None
        return False

    try:
        raw = path.read_text().strip()
        parsed = _parse_password_hash(raw)
        if parsed is None:
            logger.warning("Invalid .admin_password_hash format, ignoring")
            return False
        _password_hash_salt, _password_hash_stored = parsed
        return True
    except OSError as e:
        logger.error("Failed to read credential file: %s", e)
        return False


def refresh_auth_state() -> None:
    """Reload auth-related state from disk and env."""
    global _auth_enabled, _session_secret
    _auth_enabled = None
    _session_secret = None
    _load_credential_from_file()


def is_auth_enabled() -> bool:
    """Return whether admin authentication is enabled (ADMIN_AUTH_ENABLED=true)."""
    global _auth_enabled
    if _auth_enabled is not None:
        return _auth_enabled
    _auth_enabled = _is_auth_enabled_from_env()
    return _auth_enabled


def has_stored_password() -> bool:
    """Return whether a valid stored password hash exists on disk."""
    return _load_credential_from_file()


def verify_stored_password(password: str) -> bool:
    """Verify password against stored credential even when auth is disabled."""
    if not has_stored_password():
        return False
    return _verify_password_hash(password, _password_hash_salt, _password_hash_stored)


def is_password_set() -> bool:
    """Return whether initial password has been set (credential file exists and valid)."""
    if not is_auth_enabled():
        return False
    return has_stored_password()


def is_password_changeable() -> bool:
    """Return whether password can be changed via web/CLI (always True when auth enabled)."""
    return is_auth_enabled()


def _get_session_secret() -> Optional[bytes]:
    """Return session signing secret."""
    if not is_auth_enabled():
        return None
    return _load_session_secret()


def _validate_password(pwd: str) -> Optional[str]:
    """Return error message if invalid, None if valid."""
    if not pwd or not pwd.strip():
        return "密码不能为空"
    if len(pwd) < MIN_PASSWORD_LEN:
        return f"密码至少 {MIN_PASSWORD_LEN} 位"
    return None


def set_initial_password(password: str) -> Optional[str]:
    """
    Set initial password (first-time setup). Returns error message or None on success.
    Atomic write with 0o600 permissions.
    """
    err = _validate_password(password)
    if err:
        return err

    data_dir = _get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    cred_path = _get_credential_path()

    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.standard_b64encode(salt).decode("ascii")
    hash_b64 = base64.standard_b64encode(derived).decode("ascii")
    content = f"{salt_b64}:{hash_b64}"

    try:
        tmp_path = cred_path.with_suffix(".tmp")
        tmp_path.write_text(content)
        tmp_path.chmod(0o600)
        tmp_path.replace(cred_path)
        _load_credential_from_file()
        return None
    except OSError as e:
        logger.error("Failed to write credential file: %s", e)
        return "密码保存失败"


def verify_password(password: str) -> bool:
    """Verify password against stored credential. Constant-time where applicable."""
    if not is_auth_enabled():
        return True
    return verify_stored_password(password)


def change_password(current: str, new: str) -> Optional[str]:
    """
    Change password. Verifies current, writes new hash. Returns error message or None on success.
    """
    if not is_auth_enabled():
        return "认证功能未启用"
    if not is_password_set():
        return "尚未设置密码"

    if not current or not current.strip():
        return "请输入当前密码"
    if not _verify_password_hash(current, _password_hash_salt, _password_hash_stored):
        return "当前密码错误"

    err = _validate_password(new)
    if err:
        return err

    cred_path = _get_credential_path()
    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        new.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.standard_b64encode(salt).decode("ascii")
    hash_b64 = base64.standard_b64encode(derived).decode("ascii")
    content = f"{salt_b64}:{hash_b64}"

    try:
        tmp_path = cred_path.with_suffix(".tmp")
        tmp_path.write_text(content)
        tmp_path.chmod(0o600)
        tmp_path.replace(cred_path)
        # Reload into memory so subsequent verify_password uses new hash
        _load_credential_from_file()
        return None
    except OSError as e:
        logger.error("Failed to write credential file: %s", e)
        return "密码保存失败"


def create_session() -> str:
    """Create a signed session payload. Format: nonce.ts.signature."""
    secret = _get_session_secret()
    if not secret:
        return ""
    nonce = secrets.token_urlsafe(32)
    ts = str(int(time.time()))
    payload = f"{nonce}.{ts}"
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_session(value: str) -> bool:
    """Verify session cookie and check expiry."""
    secret = _get_session_secret()
    if not secret or not value:
        return False
    parts = value.split(".")
    if len(parts) != 3:
        return False
    nonce, ts_str, sig = parts[0], parts[1], parts[2]
    payload = f"{nonce}.{ts_str}"
    expected = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        ts = int(ts_str)
    except ValueError:
        return False
    try:
        max_age_hours = int(os.getenv("ADMIN_SESSION_MAX_AGE_HOURS", str(SESSION_MAX_AGE_HOURS_DEFAULT)))
    except ValueError:
        max_age_hours = SESSION_MAX_AGE_HOURS_DEFAULT
    if time.time() - ts > max_age_hours * 3600:
        return False
    return True


def get_client_ip(request) -> str:
    """Get client IP, respecting TRUST_X_FORWARDED_FOR.

    When behind a single trusted reverse proxy, the proxy appends the real
    client IP as the rightmost entry in X-Forwarded-For.  We use [-1] instead
    of [0] so that an attacker cannot spoof an arbitrary leftmost value to
    rotate rate-limit buckets and bypass brute-force protection.
    """
    if os.getenv("TRUST_X_FORWARDED_FOR", "false").lower() == "true":
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    if request.client:
        return request.client.host or "127.0.0.1"
    return "127.0.0.1"


def check_rate_limit(ip: str) -> bool:
    """Return True if under limit, False if rate limited."""
    lock = _get_lock()
    now = time.time()
    with lock:
        expired_keys = [k for k, (_, ts) in _rate_limit.items() if now - ts > RATE_LIMIT_WINDOW_SEC]
        for k in expired_keys:
            del _rate_limit[k]
        if ip in _rate_limit:
            count, first_ts = _rate_limit[ip]
            if count >= RATE_LIMIT_MAX_FAILURES:
                return False
        return True


def record_login_failure(ip: str) -> None:
    """Record a failed login attempt for rate limiting."""
    lock = _get_lock()
    now = time.time()
    with lock:
        if ip in _rate_limit:
            count, first_ts = _rate_limit[ip]
            if now - first_ts > RATE_LIMIT_WINDOW_SEC:
                _rate_limit[ip] = (1, now)
            else:
                _rate_limit[ip] = (count + 1, first_ts)
        else:
            _rate_limit[ip] = (1, now)


def clear_rate_limit(ip: str) -> None:
    """Clear rate limit for IP after successful login."""
    lock = _get_lock()
    with lock:
        _rate_limit.pop(ip, None)


def overwrite_password(new_password: str) -> Optional[str]:
    """
    Overwrite stored password without verifying current. For CLI reset only.
    Returns error message or None on success.
    """
    if not is_auth_enabled():
        return "认证功能未启用"
    err = _validate_password(new_password)
    if err:
        return err

    data_dir = _get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    cred_path = _get_credential_path()

    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        new_password.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.standard_b64encode(salt).decode("ascii")
    hash_b64 = base64.standard_b64encode(derived).decode("ascii")
    content = f"{salt_b64}:{hash_b64}"

    try:
        tmp_path = cred_path.with_suffix(".tmp")
        tmp_path.write_text(content)
        tmp_path.chmod(0o600)
        tmp_path.replace(cred_path)
        _load_credential_from_file()
        return None
    except OSError as e:
        logger.error("Failed to write credential file: %s", e)
        return "密码保存失败"


def reset_password_cli() -> int:
    """Interactive CLI to reset password. Returns exit code."""
    _ensure_env_loaded()
    if not _is_auth_enabled_from_env():
        print("Error: Auth is not enabled. Set ADMIN_AUTH_ENABLED=true in .env", file=sys.stderr)
        return 1

    print("Enter new admin password (will not echo):", end=" ")
    pwd = getpass.getpass("")
    err = _validate_password(pwd)
    if err:
        print(f"Error: {err}", file=sys.stderr)
        return 1

    print("Confirm new password:", end=" ")
    pwd2 = getpass.getpass("")
    if pwd != pwd2:
        print("Error: Passwords do not match", file=sys.stderr)
        return 1

    err = overwrite_password(pwd)
    if err:
        print(f"Error: {err}", file=sys.stderr)
        return 1

    print("Password has been reset successfully.")
    return 0


def _main() -> int:
    """CLI entry: reset_password subcommand."""
    if len(sys.argv) > 1 and sys.argv[1] == "reset_password":
        return reset_password_cli()
    print("Usage: python -m src.auth reset_password", file=sys.stderr)
    return 1


def _hash_password(password: str) -> str:
    """Hash a password with PBKDF2, returning salt_b64:hash_b64."""
    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    salt_b64 = base64.standard_b64encode(salt).decode("ascii")
    hash_b64 = base64.standard_b64encode(derived).decode("ascii")
    return f"{salt_b64}:{hash_b64}"


def _verify_hash(password: str, stored: str) -> bool:
    """Verify password against a salt_b64:hash_b64 string."""
    parsed = _parse_password_hash(stored)
    if parsed is None:
        return False
    salt, stored_hash = parsed
    return _verify_password_hash(password, salt, stored_hash)


def _get_db_session():
    """Get a SQLAlchemy session from the shared DatabaseManager."""
    from src.storage import DatabaseManager
    db = DatabaseManager()
    return db.get_session()


def _get_user_model():
    """Lazy import User model to avoid circular imports."""
    from src.storage import User
    return User


def migrate_legacy_password_to_user() -> bool:
    """Migrate the legacy .admin_password_hash file to a 'admin' user in DB.

    Returns True if migration happened, False if skipped.
    """
    cred_path = _get_credential_path()
    if not cred_path.exists():
        return False

    User = _get_user_model()
    session = _get_db_session()
    try:
        existing = session.query(User).filter(User.username == "admin").first()
        if existing is not None:
            return False

        raw = cred_path.read_text().strip()
        if not raw or ":" not in raw:
            return False

        user = User(
            username="admin",
            password_hash=raw,
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        logger.info("Migrated legacy .admin_password_hash to 'admin' user in DB")
        return True
    except Exception as e:
        session.rollback()
        logger.warning("Failed to migrate legacy password: %s", e)
        return False
    finally:
        session.close()


def create_user(username: str, password: str, role: str = "user") -> Optional[str]:
    """Create a new user. Returns error message or None on success."""
    if not username or not username.strip():
        return "用户名不能为空"
    username = username.strip().lower()
    if len(username) < 2 or len(username) > 64:
        return "用户名长度需在 2-64 位之间"
    if not username.replace("_", "").replace("-", "").isalnum():
        return "用户名只能包含字母、数字、下划线和连字符"
    if role not in VALID_ROLES:
        return f"无效角色，可选: {', '.join(VALID_ROLES)}"
    err = _validate_password(password)
    if err:
        return err

    User = _get_user_model()
    session = _get_db_session()
    try:
        existing = session.query(User).filter(User.username == username).first()
        if existing is not None:
            return f"用户名 '{username}' 已存在"

        user = User(
            username=username,
            password_hash=_hash_password(password),
            role=role,
            is_active=True,
        )
        session.add(user)
        session.commit()
        logger.info("Created user '%s' (role=%s)", username, role)
        return None
    except Exception as e:
        session.rollback()
        logger.error("Failed to create user '%s': %s", username, e)
        return "创建用户失败"
    finally:
        session.close()


def verify_user(username: str, password: str) -> Optional[dict]:
    """Verify user credentials. Returns user dict on success, None on failure."""
    if not username or not password:
        return None

    username = username.strip().lower()

    User = _get_user_model()
    session = _get_db_session()
    try:
        user = session.query(User).filter(User.username == username).first()
        if user is None:
            return None
        if not user.is_active:
            return None
        if not _verify_hash(password, user.password_hash):
            return None
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        }
    except Exception as e:
        logger.error("Failed to verify user '%s': %s", username, e)
        return None
    finally:
        session.close()


def list_users() -> list:
    """List all users (without password hashes)."""
    User = _get_user_model()
    session = _get_db_session()
    try:
        users = session.query(User).order_by(User.id).all()
        return [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "isActive": u.is_active,
                "createdAt": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    except Exception as e:
        logger.error("Failed to list users: %s", e)
        return []
    finally:
        session.close()


def delete_user(username: str) -> Optional[str]:
    """Delete a user. Returns error message or None on success."""
    if not username:
        return "用户名不能为空"
    username = username.strip().lower()

    User = _get_user_model()
    session = _get_db_session()
    try:
        user = session.query(User).filter(User.username == username).first()
        if user is None:
            return f"用户 '{username}' 不存在"
        if user.role == "admin":
            admin_count = session.query(User).filter(User.role == "admin").count()
            if admin_count <= 1:
                return "不能删除最后一个管理员账户"
        session.delete(user)
        session.commit()
        logger.info("Deleted user '%s'", username)
        return None
    except Exception as e:
        session.rollback()
        logger.error("Failed to delete user '%s': %s", username, e)
        return "删除用户失败"
    finally:
        session.close()


def change_user_password(username: str, current_password: str, new_password: str) -> Optional[str]:
    """Change a user's password. Returns error message or None on success."""
    if not username:
        return "用户名不能为空"
    username = username.strip().lower()

    err = _validate_password(new_password)
    if err:
        return err

    User = _get_user_model()
    session = _get_db_session()
    try:
        user = session.query(User).filter(User.username == username).first()
        if user is None:
            return f"用户 '{username}' 不存在"
        if not _verify_hash(current_password, user.password_hash):
            return "当前密码错误"
        user.password_hash = _hash_password(new_password)
        session.commit()
        logger.info("Password changed for user '%s'", username)
        return None
    except Exception as e:
        session.rollback()
        logger.error("Failed to change password for '%s': %s", username, e)
        return "修改密码失败"
    finally:
        session.close()


def admin_reset_user_password(username: str, new_password: str) -> Optional[str]:
    """Admin resets a user's password without knowing the current one."""
    if not username:
        return "用户名不能为空"
    username = username.strip().lower()

    err = _validate_password(new_password)
    if err:
        return err

    User = _get_user_model()
    session = _get_db_session()
    try:
        user = session.query(User).filter(User.username == username).first()
        if user is None:
            return f"用户 '{username}' 不存在"
        user.password_hash = _hash_password(new_password)
        session.commit()
        logger.info("Admin reset password for user '%s'", username)
        return None
    except Exception as e:
        session.rollback()
        logger.error("Failed to admin-reset password for '%s': %s", username, e)
        return "重置密码失败"
    finally:
        session.close()


def toggle_user_active(username: str, active: bool) -> Optional[str]:
    """Enable or disable a user account."""
    if not username:
        return "用户名不能为空"
    username = username.strip().lower()

    User = _get_user_model()
    session = _get_db_session()
    try:
        user = session.query(User).filter(User.username == username).first()
        if user is None:
            return f"用户 '{username}' 不存在"
        if user.role == "admin" and not active:
            admin_count = session.query(User).filter(User.role == "admin", User.is_active == True).count()
            if admin_count <= 1:
                return "不能禁用最后一个活跃管理员账户"
        user.is_active = active
        session.commit()
        logger.info("User '%s' active=%s", username, active)
        return None
    except Exception as e:
        session.rollback()
        logger.error("Failed to toggle user '%s': %s", username, e)
        return "操作失败"
    finally:
        session.close()


def create_session_for_user(username: str, role: str) -> str:
    """Create a signed session payload that includes username and role.

    Format: nonce.ts.username.role.signature
    """
    secret = _get_session_secret()
    if not secret:
        return ""
    nonce = secrets.token_urlsafe(32)
    ts = str(int(time.time()))
    payload = f"{nonce}.{ts}.{username}.{role}"
    sig = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_session_and_get_user(value: str) -> Optional[dict]:
    """Verify session cookie and return user info dict, or None if invalid."""
    secret = _get_session_secret()
    if not secret or not value:
        return None
    parts = value.split(".")
    if len(parts) != 5:
        return None
    nonce, ts_str, username, role, sig = parts
    payload = f"{nonce}.{ts_str}.{username}.{role}"
    expected = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        ts = int(ts_str)
    except ValueError:
        return None
    try:
        max_age_hours = int(os.getenv("ADMIN_SESSION_MAX_AGE_HOURS", str(SESSION_MAX_AGE_HOURS_DEFAULT)))
    except ValueError:
        max_age_hours = SESSION_MAX_AGE_HOURS_DEFAULT
    if time.time() - ts > max_age_hours * 3600:
        return None
    return {"username": username, "role": role}


def get_session_user(request) -> Optional[dict]:
    """Get the current session user from request cookies. Returns user dict or None."""
    if not is_auth_enabled():
        return None
    cookie_val = request.cookies.get(COOKIE_NAME) if hasattr(request, "cookies") else None
    if not cookie_val:
        return None
    user_info = verify_session_and_get_user(cookie_val)
    if user_info is None:
        legacy_ok = verify_session(cookie_val)
        if legacy_ok:
            return {"username": "admin", "role": "admin"}
        return None
    return user_info


def has_any_users() -> bool:
    """Check if any users exist in the database."""
    User = _get_user_model()
    session = _get_db_session()
    try:
        return session.query(User).first() is not None
    except Exception:
        return False
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(_main())
