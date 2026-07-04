from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.auth.deps import get_current_user
from app.auth.org import effective_org_id
from app.db.base import get_db
from app.models.device import Device as DeviceModel
from app.models.child import Child as ChildModel
from app.models.device_assignment import DeviceAssignment
from app.models.session import Session as SessionModel
from app.models.user import User

router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/devices")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    devices = db.query(DeviceModel).filter(
        DeviceModel.org_id == org_id
    ).order_by(DeviceModel.created_at.desc()).all()
    return {
        "devices": [
            {
                "id": d.id,
                "device_id": d.device_id,
                "name": d.name or d.device_id,
                "firmware_version": d.firmware_version,
                "battery_level": d.battery_level,
                "status": d.status,
                "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in devices
        ]
    }


@router.post("/devices")
def register_device(
    device_id: str = Body(...),
    name: Optional[str] = Body(None),
    firmware_version: Optional[str] = Body(None),
    org_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    resolved_org = effective_org_id(current_user, org_id)
    existing = db.query(DeviceModel).filter(DeviceModel.device_id == device_id).first()
    if existing:
        existing.status = "online"
        existing.last_seen = datetime.utcnow()
        if firmware_version:
            existing.firmware_version = firmware_version
        if name:
            existing.name = name
        db.commit()
        db.refresh(existing)
        return {"device": _device_dict(existing)}
    device = DeviceModel(
        device_id=device_id,
        name=name or device_id,
        firmware_version=firmware_version,
        org_id=resolved_org,
        status="online",
        last_seen=datetime.utcnow(),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return {"device": _device_dict(device)}


@router.get("/children")
def list_children(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    children = db.query(ChildModel).filter(
        ChildModel.org_id == org_id
    ).order_by(ChildModel.created_at.desc()).all()
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
    current_user: User | None = Depends(get_current_user),
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
    current_user: User | None = Depends(get_current_user),
):
    device_id = body.get("device_id", "")
    org_id = effective_org_id(current_user)
    child = db.query(ChildModel).filter(ChildModel.id == child_id, ChildModel.org_id == org_id).first()
    if not child:
        raise HTTPException(404, "Child not found")
    device = db.query(DeviceModel).filter(DeviceModel.id == device_id, DeviceModel.org_id == org_id).first()
    if not device:
        raise HTTPException(404, "Device not found")
    session = db.query(SessionModel).filter(
        SessionModel.org_id == org_id
    ).order_by(SessionModel.start_time.desc()).first()
    if not session:
        session = SessionModel(org_id=org_id, course_type="march", start_time=datetime.utcnow(), status="active")
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
        existing.assigned_at = datetime.utcnow()
    elif existing_device:
        existing_device.child_id = child_id
        existing_device.confidence = 1.0
        existing_device.assigned_at = datetime.utcnow()
    else:
        a = DeviceAssignment(
            session_id=session.id,
            device_id=device_id,
            child_id=child_id,
            confidence=1.0,
            method="manual",
            assigned_at=datetime.utcnow(),
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
    current_user: User | None = Depends(get_current_user),
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
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
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
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.org_id == org_id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    device = db.query(DeviceModel).filter(
        DeviceModel.id == device_id,
        DeviceModel.org_id == org_id,
    ).first()
    if not device:
        raise HTTPException(404, "Device not found")
    child = db.query(ChildModel).filter(
        ChildModel.id == child_id,
        ChildModel.org_id == org_id,
    ).first()
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
        existing.assigned_at = datetime.utcnow()
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
    current_user: User | None = Depends(get_current_user),
):
    org_id = effective_org_id(current_user)
    assignment = db.query(DeviceAssignment).filter(DeviceAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    child = db.query(ChildModel).filter(ChildModel.id == assignment.child_id).first()
    if child and child.org_id != org_id:
        raise HTTPException(403, "Forbidden")
    db.delete(assignment)
    db.commit()
    return {"status": "deleted"}


def _device_dict(d: DeviceModel) -> dict:
    return {
        "id": d.id,
        "device_id": d.device_id,
        "name": d.name or d.device_id,
        "firmware_version": d.firmware_version,
        "battery_level": d.battery_level,
        "status": d.status,
        "last_seen": d.last_seen.isoformat() if d.last_seen else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
