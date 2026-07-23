from datetime import datetime, timezone
from typing import Optional
import re
import subprocess
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from app.auth.deps import require_login, require_device_or_user
from app.auth.jwt import create_device_token, hash_token
from app.auth.deps import require_role
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.device import Device as DeviceModel
from app.models.child import Child as ChildModel
from app.models.device_assignment import DeviceAssignment
from app.models.organization import Organization
from app.models.session import Session as SessionModel
from app.models.user import User
from app.models.wifi_config import WifiConfig
from app.models.school_class import SchoolClass

router = APIRouter(prefix="/api", tags=["devices"])


def _strip_student_id_prefix(code: str | None, student_id: str | None) -> str | None:
    if not code or not student_id:
        return student_id
    prefix = f"{code}-"
    return student_id[len(prefix):] if student_id.startswith(prefix) else student_id


def _get_class_code(db: Session, class_id: str | None) -> str | None:
    if not class_id:
        return None
    cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
    return cls.code if cls else None


class UpdateDeviceRequest(BaseModel):
    name: str | None = None
    org_id: str | None = None


@router.get("/devices")
def list_devices(
    org_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"
    query = db.query(DeviceModel)
    if org_id:
        query = query.filter(DeviceModel.org_id == org_id)
    elif not is_super:
        resolved = effective_org_id(current_user)
        if resolved:
            query = query.filter(DeviceModel.org_id == resolved)
    devices = query.order_by(DeviceModel.created_at.desc()).all()
    dev_ids = [d.id for d in devices]
    wifi_rows = (
        db.query(WifiConfig.device_id, WifiConfig.ssid)
        .filter(WifiConfig.device_id.in_(dev_ids))
        .all()
    ) if dev_ids else []
    wifi_map = {row.device_id: row.ssid for row in wifi_rows}
    return {"devices": [_device_dict(d, configured_wifi_ssid=wifi_map.get(d.id)) for d in devices]}


_MULTICAST_PREFIXES = ("ff:", "33:", "01:", "00:5e:")

# Espressif (ESP32/ESP8266) OUI prefixes
_ESPRESSIF_OUIS = (
    "10:00:3b", "24:6f:28", "30:ae:a4", "3c:71:bf",
    "40:91:51", "58:cf:79", "60:01:94", "64:b7:08",
    "7c:9e:bd", "84:cc:a8", "94:b5:55", "a0:b7:65",
    "a4:cf:12", "c4:5e:7c", "c8:2b:96", "cc:50:e3",
    "d8:1b:b1", "dc:4f:22", "e0:5a:1b", "e8:68:19",
    "ec:fa:bc", "f0:05:bf", "f4:cf:f2",
)


def _parse_arp() -> list[dict]:
    """Run ``arp -a`` on macOS and return a list of {ip, mac} dicts."""
    try:
        result = subprocess.run(
            ["arp", "-a"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return []
    devices: list[dict] = []
    for line in result.stdout.splitlines():
        m = re.search(r"\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})", line)
        if not m:
            continue
        ip, mac = m.group(1), m.group(2).lower()
        if any(mac.startswith(p) for p in _MULTICAST_PREFIXES):
            continue
        devices.append({"ip": ip, "mac": mac})
    return devices


@router.post("/devices/scan")
def scan_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin")),
):
    arp_entries = _parse_arp()
    known_macs = {
        d.device_id.lower(): d
        for d in db.query(DeviceModel).all()
    }
    results = []
    for entry in arp_entries:
        mac = entry["mac"].lower()
        if not any(mac.startswith(oui) for oui in _ESPRESSIF_OUIS):
            continue
        if mac in known_macs:
            continue
        results.append({
            "mac": mac.upper(),
            "ip": entry["ip"],
        })
    return {"devices": results}


@router.post("/devices")
def register_device(
    device_id: str = Body(...),
    name: Optional[str] = Body(None),
    firmware_version: Optional[str] = Body(None),
    wifi_ssid: Optional[str] = Body(None),
    wifi_rssi: Optional[float] = Body(None),
    ip_address: Optional[str] = Body(None),
    mac_address: Optional[str] = Body(None),
    org_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_device_or_user),
):
    resolved_org = effective_org_id(current_user, org_id)
    device_id = device_id.upper()
    existing = db.query(DeviceModel).filter(DeviceModel.device_id == device_id).first()
    if existing:
        existing.status = "online"
        existing.last_seen = datetime.now(timezone.utc)
        if firmware_version is not None:
            existing.firmware_version = firmware_version
        if wifi_ssid is not None:
            existing.wifi_ssid = wifi_ssid
        if wifi_rssi is not None:
            existing.wifi_rssi = wifi_rssi
        if ip_address is not None:
            existing.ip_address = ip_address
        if mac_address is not None:
            existing.mac_address = mac_address
        db.commit()
        db.refresh(existing)
        device_token = create_device_token(existing.device_id, str(existing.org_id))
        existing.device_token_hash = hash_token(device_token)
        db.commit()
        return {"device": _device_dict(existing), "device_token": device_token}
    device = DeviceModel(
        device_id=device_id,
        name=name or device_id,
        firmware_version=firmware_version,
        wifi_ssid=wifi_ssid,
        wifi_rssi=wifi_rssi,
        ip_address=ip_address,
        mac_address=mac_address,
        org_id=resolved_org,
        status="online",
        last_seen=datetime.now(timezone.utc),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    device_token = create_device_token(device.device_id, str(device.org_id))
    device.device_token_hash = hash_token(device_token)
    db.commit()
    return {"device": _device_dict(device), "device_token": device_token}


@router.put("/devices/{device_id}")
def update_device(
    device_id: str,
    body: UpdateDeviceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"

    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not is_super:
        # Non-super users can only update devices in their own org
        if device and device.org_id != effective_org_id(current_user):
            device = None
    if not device:
        raise HTTPException(404, "Device not found")

    if body.name is not None:
        device.name = body.name
    if body.org_id is not None:
        if not is_super:
            raise HTTPException(403, "Only super_admin can change device org")
        org = db.query(Organization).filter(Organization.id == body.org_id).first()
        if not org:
            raise HTTPException(404, "Organization not found")
        device.org_id = body.org_id

    db.commit()
    db.refresh(device)
    return {"device": _device_dict(device)}


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin")),
):
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(404, "Device not found")
    db.delete(device)
    db.commit()
    return {"status": "deleted"}


@router.post("/devices/{device_id}/revoke-token")
def revoke_device_token(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "org_admin")),
):
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id).first()
    if not device:
        raise HTTPException(404, "Device not found")
    device.device_token_hash = None
    db.commit()
    return {"status": "token_revoked", "device_id": device.device_id}


@router.get("/children")
def list_children(
    org_id: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    resolved = org_id or effective_org_id(current_user) or None
    query = db.query(ChildModel)
    if resolved:
        query = query.filter(ChildModel.org_id == resolved)
    children = query.order_by(ChildModel.created_at.desc()).all()
    return {
        "children": [
            {
                "id": c.id,
                "name": c.name,
                "student_id": _strip_student_id_prefix(_get_class_code(db, c.class_id), c.student_id),
                "notes": c.notes,
                "class_id": c.class_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in children
        ]
    }


@router.get("/children/assignments")
def list_child_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    org_id = effective_org_id(current_user)
    children = db.query(ChildModel).filter(ChildModel.org_id == org_id).all()
    result = []
    for c in children:
        assignment = (
            db.query(DeviceAssignment)
            .filter(DeviceAssignment.child_id == c.id)
            .order_by(DeviceAssignment.assigned_at.desc())
            .first()
        )
        device_name = None
        if assignment:
            device = db.query(DeviceModel).filter(DeviceModel.id == assignment.device_id).first()
            device_name = device.name if device else None
        result.append({
            "id": c.id,
            "name": c.name,
            "student_id": _strip_student_id_prefix(_get_class_code(db, c.class_id), c.student_id),
            "class_id": c.class_id,
            "device_id": assignment.device_id if assignment else None,
            "device_name": device_name,
            "assignment_id": assignment.id if assignment else None,
        })
    return {"children": result}


@router.put("/children/{child_id}/assign")
def assign_child_device(
    child_id: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    device_id = body.get("device_id", "")
    is_super = current_user.role == "super_admin"
    org_id = effective_org_id(current_user) if not is_super else None

    child = db.query(ChildModel).filter(ChildModel.id == child_id)
    if org_id:
        child = child.filter(ChildModel.org_id == org_id)
    child = child.first()
    if not child:
        raise HTTPException(404, "Child not found")
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id)
    if org_id:
        device = device.filter(DeviceModel.org_id == org_id)
    device = device.first()
    if not device:
        raise HTTPException(404, "Device not found")
    session = db.query(SessionModel)
    if org_id:
        session = session.filter(SessionModel.org_id == org_id)
    session = session.order_by(SessionModel.start_time.desc()).first()
    if not session:
        session = SessionModel(org_id=org_id, course_type="march", start_time=datetime.now(timezone.utc), status="active")
        db.add(session)
        db.commit()
        db.refresh(session)
    existing = db.query(DeviceAssignment).filter(
        DeviceAssignment.child_id == child_id,
        DeviceAssignment.session_id == session.id,
    ).first()
    existing_device = db.query(DeviceAssignment).filter(
        DeviceAssignment.device_id == device_id,
        DeviceAssignment.session_id == session.id,
    ).first()
    if existing and existing_device and existing.id != existing_device.id:
        db.delete(existing_device)
    if existing:
        existing.device_id = device_id
        existing.confidence = 1.0
        existing.assigned_at = datetime.now(timezone.utc)
    elif existing_device:
        existing_device.child_id = child_id
        existing_device.confidence = 1.0
        existing_device.assigned_at = datetime.now(timezone.utc)
    else:
        a = DeviceAssignment(
            session_id=session.id,
            device_id=device_id,
            child_id=child_id,
            confidence=1.0,
            method="manual",
            assigned_at=datetime.now(timezone.utc),
        )
        db.add(a)
    db.commit()
    return {"status": "assigned"}


@router.post("/children")
def register_child(
    name: str = Body(...),
    student_id: Optional[str] = Body(None),
    notes: Optional[str] = Body(None),
    class_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    org_id = effective_org_id(current_user)
    class_code = _get_class_code(db, class_id)
    prefixed_sid = student_id
    if class_code and student_id:
        prefixed_sid = f"{class_code}-{student_id}"
    child = ChildModel(
        name=name,
        student_id=prefixed_sid,
        notes=notes,
        org_id=org_id,
        class_id=class_id,
        added_by=current_user.id if current_user else None,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return {
        "child": {
            "id": child.id,
            "name": child.name,
            "student_id": _strip_student_id_prefix(class_code, child.student_id),
            "notes": child.notes,
            "class_id": child.class_id,
            "created_at": child.created_at.isoformat() if child.created_at else None,
        }
    }


@router.get("/sessions/{session_id}/assignments")
def get_assignments(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id)
    if not (current_user.role == "super_admin"):
        session = session.filter(SessionModel.org_id == effective_org_id(current_user))
    session = session.first()
    if not session:
        raise HTTPException(404, "Session not found")
    assigns = (
        db.query(DeviceAssignment)
        .filter(DeviceAssignment.session_id == session_id)
        .all()
    )
    results = []
    for a in assigns:
        device = db.query(DeviceModel).filter(DeviceModel.id == a.device_id).first()
        child = db.query(ChildModel).filter(ChildModel.id == a.child_id).first()
        results.append({
            "id": a.id,
            "device_id": a.device_id,
            "device_name": device.name if device else "Unknown",
            "child_id": a.child_id,
            "child_name": child.name if child else "Unknown",
            "confidence": a.confidence,
            "method": a.method,
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
        })
    return {"assignments": results}


@router.post("/sessions/{session_id}/assign")
def assign_device(
    session_id: str,
    device_id: str = Body(...),
    child_id: str = Body(...),
    confidence: float = Body(1.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"
    org_id = effective_org_id(current_user) if not is_super else None

    filters = [SessionModel.id == session_id]
    if org_id:
        filters.append(SessionModel.org_id == org_id)
    session = db.query(SessionModel).filter(*filters).first()
    if not session:
        raise HTTPException(404, "Session not found")
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id)
    if org_id:
        device = device.filter(DeviceModel.org_id == org_id)
    device = device.first()
    if not device:
        raise HTTPException(404, "Device not found")
    child = db.query(ChildModel).filter(ChildModel.id == child_id)
    if org_id:
        child = child.filter(ChildModel.org_id == org_id)
    child = child.first()
    if not child:
        raise HTTPException(404, "Child not found")

    existing = (
        db.query(DeviceAssignment)
        .filter(
            DeviceAssignment.session_id == session_id,
            DeviceAssignment.device_id == device_id,
        )
        .first()
    )
    if existing:
        existing.child_id = child_id
        existing.confidence = confidence
        existing.assigned_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        assignment = existing
    else:
        assignment = DeviceAssignment(
            session_id=session_id,
            device_id=device_id,
            child_id=child_id,
            confidence=confidence,
            method="manual",
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    # Update device's active session
    device.active_session_id = session_id
    db.commit()

    return {
        "assignment": {
            "id": assignment.id,
            "session_id": assignment.session_id,
            "device_id": assignment.device_id,
            "child_id": assignment.child_id,
            "confidence": assignment.confidence,
            "method": assignment.method,
            "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
        }
    }


@router.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"
    assignment = db.query(DeviceAssignment).filter(DeviceAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    if not is_super:
        org_id = effective_org_id(current_user)
        child = db.query(ChildModel).filter(ChildModel.id == assignment.child_id).first()
        if child and child.org_id != org_id:
            raise HTTPException(403, "Forbidden")

    # Clear device's active session
    device = db.query(DeviceModel).filter(DeviceModel.id == assignment.device_id).first()
    if device:
        device.active_session_id = None

    db.delete(assignment)
    db.commit()
    return {"status": "deleted"}


@router.get("/config/session")
def get_device_session_config(
    device_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_device_or_user),
):
    resolved_org = effective_org_id(current_user)
    dev = db.query(DeviceModel).filter(
        DeviceModel.device_id == device_id.upper(),
        DeviceModel.org_id == resolved_org,
    ).first()
    if not dev:
        raise HTTPException(404, "Device not found")

    if dev.active_session_id:
        return {"session_id": dev.active_session_id}

    from app.models.device_assignment import DeviceAssignment
    from app.models.session import Session as SessionModel
    from sqlalchemy import and_

    assignment = (
        db.query(DeviceAssignment)
        .join(SessionModel, SessionModel.id == DeviceAssignment.session_id)
        .filter(
            DeviceAssignment.device_id == dev.id,
            SessionModel.status.in_(["active", "draft"]),
        )
        .order_by(DeviceAssignment.assigned_at.desc())
        .first()
    )
    if assignment:
        dev.active_session_id = assignment.session_id
        db.commit()
        return {"session_id": assignment.session_id}

    return {"session_id": None}


def _device_dict(d: DeviceModel, *, configured_wifi_ssid: str | None = None) -> dict:
    # Compute online/offline status dynamically based on last_seen
    if d.last_seen and d.status == "online":
        last_seen = d.last_seen.replace(tzinfo=timezone.utc) if d.last_seen.tzinfo is None else d.last_seen
        elapsed = (datetime.now(timezone.utc) - last_seen).total_seconds()
        if elapsed > 300:  # 5 minutes threshold
            effective_status = "offline"
        else:
            effective_status = "online"
    else:
        effective_status = d.status or "offline"

    return {
        "id": d.id,
        "device_id": d.device_id,
        "name": d.name or d.device_id,
        "firmware_version": d.firmware_version,
        "battery_level": d.battery_level,
        "wifi_ssid": d.wifi_ssid,
        "configured_wifi_ssid": configured_wifi_ssid,
        "wifi_rssi": d.wifi_rssi,
        "ip_address": d.ip_address,
        "mac_address": d.mac_address,
        "org_id": d.org_id,
        "status": effective_status,
        "active_session_id": d.active_session_id,
        "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
