import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_role
from app.auth import require_api_key
from app.db.base import get_db
from app.models.firmware import FirmwareVersion
from app.models.user import User

router = APIRouter(prefix="/api/firmware", tags=["firmware"])

_FIRMWARE_DIR = Path(__file__).parent.parent / "firmware_binaries"
_FIRMWARE_DIR.mkdir(exist_ok=True)


@router.get("/version")
def check_version(
    request: Request,
    current: str = "",
    _: None = Depends(require_api_key),
    db: Session = Depends(get_db),
):
    latest = (
        db.query(FirmwareVersion)
        .order_by(FirmwareVersion.created_at.desc())
        .first()
    )
    if not latest or latest.version == current:
        return {"update_available": False}

    base = str(request.base_url).rstrip("/")
    return {
        "update_available": True,
        "version": latest.version,
        "url": f"{base}/api/firmware/download/{latest.id}",
    }


@router.post("/upload")
async def upload_firmware(
    version: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("super_admin", "org_admin")),
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
def download_firmware(fw_id: str, _: None = Depends(require_api_key), db: Session = Depends(get_db)):
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
def list_firmware(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
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
