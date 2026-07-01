from fastapi import APIRouter

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions():
    return {"sessions": []}


@router.post("")
async def create_session():
    return {"message": "not implemented"}


@router.get("/{session_id}")
async def get_session(session_id: str):
    return {"session_id": session_id, "message": "not implemented"}


@router.get("/{session_id}/analysis")
async def get_analysis(session_id: str):
    return {"session_id": session_id, "message": "not implemented"}


@router.post("/{session_id}/report")
async def generate_report(session_id: str):
    return {"session_id": session_id, "message": "not implemented"}


@router.get("/{session_id}/report")
async def get_report(session_id: str):
    return {"session_id": session_id, "message": "not implemented"}
