import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.firmware import FirmwareVersion

router = APIRouter(prefix="/api/firmware", tags=["firmware"])

_FIRMWARE_DIR = Path(__file__).parent.parent / "firmware_binaries"
_FIRMWARE_DIR.mkdir(exist_ok=True)


@router.get("/version")
def check_version(
    current: str = "",
    db: Session = Depends(get_db),
):
    latest = (
        db.query(FirmwareVersion)
        .order_by(FirmwareVersion.created_at.desc())
        .first()
    )
    if not latest or latest.version == current:
        return {"update_available": False}

    return {
        "update_available": True,
        "version": latest.version,
        "url": f"/api/firmware/download/{latest.id}",
    }


@router.post("/upload")
async def upload_firmware(
    version: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    existing = db.query(FirmwareVersion).filter(
        FirmwareVersion.version == version
    ).first()
    if existing:
        raise HTTPException(400, "Version already exists")

    ext = Path(file.filename or "firmware.bin").suffix or ".bin"
    filename = f"{version}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = _FIRMWARE_DIR / filename

    content = await file.read()
    filepath.write_bytes(content)

    fw = FirmwareVersion(
        version=version,
        description=description,
        binary_path=str(filepath),
        file_size=len(content),
    )
    db.add(fw)
    db.commit()
    db.refresh(fw)

    return {
        "id": fw.id,
        "version": fw.version,
        "file_size": fw.file_size,
        "created_at": fw.created_at.isoformat(),
    }


@router.get("/download/{fw_id}")
def download_firmware(fw_id: str, db: Session = Depends(get_db)):
    fw = db.query(FirmwareVersion).filter(FirmwareVersion.id == fw_id).first()
    if not fw:
        raise HTTPException(404, "Firmware not found")

    filepath = Path(fw.binary_path)
    if not filepath.exists():
        raise HTTPException(404, "Binary file not found on disk")

    from fastapi.responses import FileResponse
    return FileResponse(
        path=str(filepath),
        media_type="application/octet-stream",
        filename=f"hmeayc-firmware-{fw.version}.bin",
    )


@router.get("/list")
def list_firmware(db: Session = Depends(get_db)):
    versions = (
        db.query(FirmwareVersion)
        .order_by(FirmwareVersion.created_at.desc())
        .all()
    )
    return {
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "description": v.description,
                "file_size": v.file_size,
                "created_at": v.created_at.isoformat(),
            }
            for v in versions
        ]
    }


@router.post("/ack")
def ack_update(
    version: str = Form(""),
    device_id: str = Form(""),
):
    today = datetime.utcnow().isoformat()
    log_line = f"{today} | device={device_id} | version={version} | OK\n"
    log_path = _FIRMWARE_DIR / "ota_ack.log"
    with open(log_path, "a") as f:
        f.write(log_line)
    return {"status": "acknowledged"}
