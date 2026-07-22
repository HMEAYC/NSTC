# Plan: ESP32 Device Auth — API Key → Device JWT

## Goal

Replace the shared API key (`hmeayc-esp32-2025`) with per-device JWT tokens, so each ESP32 has its own credential that can be individually revoked.

## Current State

### Auth Flow (Before)

```
ESP32 ──X-API-Key: hmeayc-esp32-2025──▶ Backend
                                         │
                                         ├─ require_device_or_user()
                                         │  1. Try Bearer JWT (fails — no token)
                                         │  2. Check X-API-Key header
                                         │  3. Impersonate first active user
                                         │
                                         ▼
                                    Access granted (as shared user identity)
```

### Endpoints Using API Key

| Endpoint | Guard | ESP32 Calls |
|----------|-------|-------------|
| `POST /api/devices` | `require_device_or_user` | ✅ (register + heartbeat) |
| `GET /api/config/session` | `require_device_or_user` | ✅ |
| `GET /api/config/wifi` | `require_device_or_user` | ✅ |
| `GET /api/firmware/version` | `require_api_key` | ✅ (OTA) |
| `GET /api/firmware/download/{id}` | `require_api_key` | ✅ (OTA) |
| `POST /api/analyze/*` | `require_api_key` | ❌ (internal only) |
| `WS /ws/{session_id}` | Optional JWT | ✅ (no auth currently) |

### Firmware Files Sending API Key

All use `esp_http_client_set_header(client, "X-API-Key", CONFIG_HMEAYC_API_KEY)`:

- `device_registry.c` — `device_registry_upsert()` + `device_registry_heartbeat()`
- `session_config_nvs.c` — `session_config_fetch_remote()`
- `wifi_config_nvs.c` — `wifi_config_fetch_remote()`
- `ota_client.c` — version check + download

---

## Target State

### Auth Flow (After)

```
ESP32 (first boot, no JWT)
  │
  ├──X-API-Key──▶ POST /api/devices
  │               │
  │               ▼
  │          Backend validates API key
  │          Generates device-specific JWT
  │          Returns JWT in response
  │
  ▼
ESP32 stores JWT in NVS
  │
  ├──Authorization: Bearer <device_jwt>──▶ All subsequent requests
  │                                        │
  │                                        ▼
  │                                   Backend validates JWT
  │                                   Extracts device_id from claims
  │                                   Checks device not revoked
  │
  ▼
Access granted (as specific device identity)
```

### Device JWT Claims

```json
{
  "sub": "device",
  "device_id": "88:56:A6:7C:D6:78",
  "org_id": "00000000-0000-0000-0000-000000000001",
  "role": "device",
  "exp": 1784785993
}
```

---

## Implementation Plan

### Phase 1: Backend — Device JWT Issuance

#### 1.1 Add `device_token_hash` column to Device model

**File:** `backend/app/models/device.py`

```python
device_token_hash = Column(String(200), nullable=True)  # SHA-256 of issued JWT
```

Purpose: Store a hash of the issued JWT so we can revoke it without storing the full token.

#### 1.2 Create device JWT helper

**File:** `backend/app/auth/jwt.py` (add functions)

```python
def create_device_token(device_id: str, org_id: str) -> str:
    """Generate a long-lived JWT for an ESP32 device."""
    to_encode = {
        "sub": "device",
        "device_id": device_id,
        "org_id": org_id,
        "role": "device",
    }
    # 365-day expiry for devices
    expire = datetime.now(timezone.utc) + timedelta(days=365)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=ALGORITHM)
```

#### 1.3 Modify `POST /api/devices` to return JWT on registration

**File:** `backend/app/api/devices.py`

When the request includes `X-API-Key` (bootstrap mode):
1. Validate API key as before
2. Find or create the device
3. Generate device-specific JWT via `create_device_token()`
4. Store `sha256(jwt)` in `device.token_hash`
5. Return JWT in response: `{"device_token": "...", ...existing fields...}`

When the request includes `Authorization: Bearer` (device JWT mode):
1. Validate JWT, extract `device_id` from claims
2. Update device heartbeat (existing logic)
3. Return device info (no new token)

#### 1.4 Create `require_device_jwt` dependency

**File:** `backend/app/auth/deps.py` (add function)

```python
async def require_device_jwt(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate ESP32 devices via JWT or fallback to API key."""
    # 1. Try Bearer JWT
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = decode_token(token)
        if payload and payload.get("sub") == "device":
            device_id = payload.get("device_id")
            device = db.query(Device).filter(Device.device_id == device_id.upper()).first()
            if device and device.is_active:
                # Return the org's admin user for org context
                user = db.query(User).filter(
                    User.org_id == device.org_id,
                    User.is_active == True,
                ).first()
                if user:
                    return user
        raise HTTPException(401, "Invalid or revoked device token")

    # 2. Fallback to API key (bootstrap)
    if settings.hmeayc_api_key and x_api_key and x_api_key.strip() == settings.hmeayc_api_key:
        user = db.query(User).filter(User.is_active == True, User.role != "super_admin").first()
        if user:
            return user

    raise HTTPException(401, "Authentication required")
```

#### 1.5 Update `require_api_key` for OTA endpoints

**File:** `backend/app/auth/api_key.py`

Add JWT fallback to `require_api_key` so OTA endpoints accept device JWTs:

```python
def require_api_key(
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    # Try device JWT first
    if authorization and authorization.startswith("Bearer "):
        payload = decode_token(authorization[7:])
        if payload and payload.get("sub") == "device":
            return  # Device JWT valid
    # Fallback to API key
    if not settings.hmeayc_api_key:
        return
    if x_api_key and x_api_key.strip() == settings.hmeayc_api_key:
        return
    raise HTTPException(401, "Unauthorized")
```

#### 1.6 Add device token revocation endpoint

**File:** `backend/app/api/devices.py`

```python
@router.post("/devices/{device_id}/revoke-token")
def revoke_device_token(device_id: str, ...):
    """Revoke a device's JWT. Device must re-register with API key."""
    device = db.query(Device).filter(Device.id == device_id).first()
    device.device_token_hash = None
    db.commit()
```

---

### Phase 2: Firmware — Store and Use JWT

#### 2.1 Add JWT storage in NVS

**File:** `firmware/main/wifi_config_nvs.h` (add declarations)

```c
esp_err_t device_token_load(char *token, size_t max_len);
esp_err_t device_token_save(const char *token);
esp_err_t device_token_clear(void);
```

**File:** `firmware/main/wifi_config_nvs.c` (add implementations)

Uses NVS namespace `"wifi_cfg"` with key `"device_jwt"`.

#### 2.2 Modify `device_registry.c` — Return JWT on registration

**File:** `firmware/main/device_registry.c`

Change `device_registry_upsert()`:
1. Parse response for `"device_token":"..."`
2. If present, save to NVS via `device_token_save()`
3. Change return type or add output parameter for the token

Change `device_registry_heartbeat()`:
1. Load JWT from NVS via `device_token_load()`
2. If JWT exists, send `Authorization: Bearer <jwt>` instead of `X-API-Key`
3. If 401 received, clear JWT and re-register on next cycle

#### 2.3 Create auth header helper

**File:** `firmware/main/device_registry.h` (add)

```c
// Set either Bearer JWT or X-API-Key on the HTTP client
void device_auth_set_header(esp_http_client_handle_t client);
```

**File:** `firmware/main/device_registry.c` (add)

```c
void device_auth_set_header(esp_http_client_handle_t client) {
    char token[512];
    if (device_token_load(token, sizeof(token)) == ESP_OK && token[0] != '\0') {
        char auth[580];
        snprintf(auth, sizeof(auth), "Bearer %s", token);
        esp_http_client_set_header(client, "Authorization", auth);
    } else {
        esp_http_client_set_header(client, "X-API-Key", CONFIG_HMEAYC_API_KEY);
    }
}
```

#### 2.4 Update all HTTP call sites

Replace all `esp_http_client_set_header(client, "X-API-Key", CONFIG_HMEAYC_API_KEY)` with `device_auth_set_header(client)` in:

- `device_registry.c` — `device_registry_upsert()` (keep API key for first registration)
- `device_registry.c` — `device_registry_heartbeat()`
- `session_config_nvs.c` — `session_config_fetch_remote()`
- `wifi_config_nvs.c` — `wifi_config_fetch_remote()`
- `ota_client.c` — version check + download

#### 2.5 Handle JWT expiry / revocation

In `main.c` orchestration loop:
- If any HTTP call returns 401 → clear JWT from NVS → next cycle will re-register with API key
- Add a log message: "Device token expired/revoked, re-registering..."

---

### Phase 3: WebSocket Auth

#### 3.1 Add JWT query param to WS connection

**File:** `firmware/main/websocket_client.c`

Change `websocket_client_init()` and `websocket_reconnect()`:
- Load device JWT from NVS
- Append `?token=<jwt>` to WebSocket URI

#### 3.2 Validate JWT in WS handler

**File:** `backend/app/api/ws.py`

- Extract `token` query param (already exists)
- Validate JWT and extract `device_id`
- Verify device is assigned to the requested session
- Reject unauthorized connections

---

### Phase 4: Cleanup

#### 4.1 Deprecate shared API key

- Keep `HMEAYC_API_KEY` in `.env` for emergency bootstrap
- Keep `CONFIG_HMEAYC_API_KEY` in firmware as fallback (for first boot only)
- Document that API key is only for initial device registration

#### 4.2 Update tests

**File:** `backend/tests/test_basic.py`

- Add tests for device JWT auth
- Test API key fallback still works
- Test token revocation

#### 4.3 Database migration

```bash
cd backend
alembic revision --autogenerate -m "add device_token_hash to devices"
alembic upgrade head
```

---

## File Change Summary

| File | Change |
|------|--------|
| `backend/app/models/device.py` | Add `device_token_hash` column |
| `backend/app/auth/jwt.py` | Add `create_device_token()` |
| `backend/app/auth/deps.py` | Add `require_device_jwt()`, update `require_device_or_user` |
| `backend/app/auth/api_key.py` | Add JWT fallback to `require_api_key` |
| `backend/app/api/devices.py` | Return JWT on registration, add revoke endpoint |
| `backend/app/api/ws.py` | Validate device JWT in WebSocket handler |
| `backend/alembic/versions/xxx_add_device_token_hash.py` | Migration |
| `firmware/main/wifi_config_nvs.h` | Add `device_token_load/save/clear` |
| `firmware/main/wifi_config_nvs.c` | Implement JWT NVS storage |
| `firmware/main/device_registry.h` | Add `device_auth_set_header()` |
| `firmware/main/device_registry.c` | Parse JWT from response, use JWT header |
| `firmware/main/session_config_nvs.c` | Use `device_auth_set_header()` |
| `firmware/main/wifi_config_nvs.c` | Use `device_auth_set_header()` |
| `firmware/main/ota_client.c` | Use `device_auth_set_header()` |
| `firmware/main/websocket_client.c` | Send JWT in WS query param |
| `firmware/main/main.c` | Handle 401 → clear JWT → re-register |
| `backend/tests/test_basic.py` | Add device JWT tests |

## Migration Strategy

1. Deploy backend first (new endpoints accept both API key and JWT)
2. Flash firmware (new firmware sends JWT after first registration)
3. Existing devices will auto-migrate: first heartbeat with API key → receive JWT → use JWT going forward
4. Optionally revoke API key after all devices migrated

## Risks

- **JWT expiry**: 365-day expiry is long but not forever. Need refresh mechanism or re-registration flow.
- **NVS corruption**: If JWT is lost, device falls back to API key re-registration (graceful).
- **Backward compatibility**: API key fallback ensures old firmware still works during migration.
