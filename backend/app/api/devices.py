from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from app.auth.deps import require_login
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.device import Device as DeviceModel
from app.models.child import Child as ChildModel
from app.models.device_assignment import DeviceAssignment
from app.models.organization import Organization
from app.models.session import Session as SessionModel
from app.models.user import User

router = APIRouter(prefix="/api", tags=["devices"])


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
    return {"devices": [_device_dict(d) for d in devices]}


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
    current_user: User = Depends(require_login),
):
    resolved_org = effective_org_id(current_user, org_id)
    device_id = device_id.upper()
    existing = db.query(DeviceModel).filter(DeviceModel.device_id == device_id).first()
    if existing:
        existing.status = "online"
        existing.last_seen = datetime.now(timezone.utc)
        if firmware_version is not None:
            existing.firmware_version = firmware_version
        if name is not None:
            existing.name = name
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
        return {"device": _device_dict(existing)}
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
    return {"device": _device_dict(device)}


@router.put("/devices/{device_id}")
def update_device(
    device_id: str,
    body: UpdateDeviceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_login),
):
    is_super = current_user.role == "super_admin"

    device = db.query(DeviceModel).filter(DeviceModel.id == device_id)
    if not is_super:
        device = device.filter(DeviceModel.org_id == effective_org_id(current_user))
    device = device.first()
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
                "student_id": c.student_id,
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
            "student_id": c.student_id,
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
    session = db.query(SessionModel).filter()
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
    child = ChildModel(
        name=name,
        student_id=student_id,
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
            "student_id": child.student_id,
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
    current_user: User = Depends(require_login),
):
    resolved_org = effective_org_id(current_user)
    dev = db.query(DeviceModel).filter(
        DeviceModel.device_id == device_id.upper(),
        DeviceModel.org_id == resolved_org,
    ).first()
    if not dev:
        raise HTTPException(404, "Device not found")
    return {"session_id": dev.active_session_id}


def _device_dict(d: DeviceModel) -> dict:
    # Compute online/offline status dynamically based on last_seen
    if d.last_seen and d.status == "online":
        elapsed = (datetime.now(timezone.utc) - d.last_seen).total_seconds()
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
        "wifi_rssi": d.wifi_rssi,
        "ip_address": d.ip_address,
        "mac_address": d.mac_address,
        "org_id": d.org_id,
        "status": effective_status,
        "active_session_id": d.active_session_id,
        "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
