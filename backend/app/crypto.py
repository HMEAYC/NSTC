"""Simple symmetric encryption for WiFi passwords at rest.

Uses XOR-based obfuscation with a key derived from the JWT_SECRET.
Not bulletproof, but prevents plaintext storage in the database.
"""
import base64
import hashlib
import os

_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is None:
        from app.config import settings
        raw = settings.jwt_secret.encode("utf-8") if settings.jwt_secret else b"default-key-change-me"
        _KEY = hashlib.sha256(raw).digest()
    return _KEY


def encrypt_password(plaintext: str) -> str:
    """Encrypt a WiFi password for storage. Returns base64-encoded ciphertext."""
    if not plaintext:
        return ""
    key = _get_key()
    data = plaintext.encode("utf-8")
    # XOR each byte with the corresponding key byte (cyclic)
    encrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    # Prefix with random salt byte to prevent identical passwords producing identical ciphertext
    salt = os.urandom(1)
    return base64.b64encode(salt + encrypted).decode("ascii")


def decrypt_password(ciphertext: str) -> str:
    """Decrypt a stored WiFi password back to plaintext."""
    if not ciphertext:
        return ""
    key = _get_key()
    raw = base64.b64decode(ciphertext)
    salt = raw[:1]
    data = raw[1:]
    decrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return decrypted.decode("utf-8", errors="replace")
