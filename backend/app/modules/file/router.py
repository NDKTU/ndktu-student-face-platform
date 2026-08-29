from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.file.repository import get_file_repository
from app.modules.file.schemas import (
    FileAttachRequest,
    FileDetailResponse,
    FileListRequest,
    FileListResponse,
    FileResponse,
    FileUpdateRequest,
    FolderCreateRequest,
    FolderListResponse,
    FolderResponse,
    FolderUpdateRequest,
)

router = APIRouter(prefix="/file", tags=["File library"])


# ─── Papkalar ─────────────────────────────────────────────────────────
# Fayl marshrutlaridan OLDIN turishi shart: /file/folder aks holda
# /file/{file_id} ga tushib, "folder" ni son deb oʻqishga urinadi.


@router.get("/folder/", response_model=FolderListResponse)
async def list_folders(
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:file")),
):
    items = await get_file_repository.list_folders(session, user)
    return FolderListResponse(items=items)


@router.post("/folder/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    data: FolderCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:file")),
):
    return await get_file_repository.create_folder(session, data, user)


@router.put("/folder/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    data: FolderUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file")),
):
    return await get_file_repository.update_folder(session, folder_id, data, user)


@router.delete("/folder/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("delete:file")),
):
    await get_file_repository.delete_folder(session, folder_id, user)


# ─── Fayllar ──────────────────────────────────────────────────────────


@router.post("/upload", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    folder_id: int | None = Query(default=None),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:file")),
):
    """Faylni kutubxonaga yuklaydi.

    Ayni baytlar allaqachon mavjud boʻlsa yangi nusxa yaratilmaydi — mavjud
    yozuv qaytariladi.
    """
    return await get_file_repository.upload(session, file, user, folder_id)


@router.get("/", response_model=FileListResponse)
async def list_files(
    request: FileListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:file")),
):
    return await get_file_repository.list_files(session, request, user)


@router.get("/{file_id}", response_model=FileDetailResponse)
async def get_file(
    file_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:file")),
):
    return await get_file_repository.get_file(session, file_id, user)


@router.patch("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: int,
    data: FileUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file")),
):
    return await get_file_repository.update_file(session, file_id, data, user)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("delete:file")),
):
    """Faylni kutubxonadan olib tashlaydi.

    Fayl biror joyda ishlatilayotgan boʻlsa 409 qaytadi va qayerdaligi
    aytiladi — jim oʻchirish boshqa oʻqituvchining darsini buzadi.
    """
    await get_file_repository.delete_file(session, file_id, user)


@router.post("/{file_id}/attach", response_model=FileResponse)
async def attach_file(
    file_id: int,
    data: FileAttachRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file")),
):
    return await get_file_repository.attach(session, file_id, data, user)


@router.post("/{file_id}/detach", status_code=status.HTTP_204_NO_CONTENT)
async def detach_file(
    file_id: int,
    data: FileAttachRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file")),
):
    await get_file_repository.detach(session, file_id, data, user)
