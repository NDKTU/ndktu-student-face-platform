"""Fayl kutubxonasi ustidagi amallar.

Egalik qoidasi bitta va hamma joyda bir xil: oʻqituvchi faqat oʻz fayllarini
koʻradi va boshqaradi, admin hammasini koʻradi. Talaba bu yerga umuman
kirmaydi — u fayllarni faqat vazifa topshirish orqali yuklaydi.
"""

import html
import logging
import re

from core.config import settings
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.teacher_scope import assigned_subject_ids
from app.modules.auth.model import User
from app.modules.course.model import Homework, Resource
from app.modules.quiz.model import Question
from app.modules.file.model import FileBlob, FileFolder, FileUsage, StoredFile
from app.modules.file.schemas import (
    FileAttachRequest,
    FileDetailResponse,
    FileListRequest,
    FileListResponse,
    FileResponse,
    FileUpdateRequest,
    FileUsageInfo,
    FolderCreateRequest,
    FolderResponse,
    FolderUpdateRequest,
)
from app.modules.file.storage import DOCUMENT_EXTS, IMAGE_EXTS, public_url, store_upload

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(raw: str | None, limit: int = 80) -> str | None:
    """Savol matnidan teglarni olib tashlaydi va qisqartiradi.

    Savol matni HTML boʻlib saqlanadi (rasm ham oʻsha yerda). Roʻyxatda uni
    xom holda koʻrsatib boʻlmaydi, lekin "#32834" ham hech nima demaydi."""
    if not raw:
        return None
    text = _TAG_RE.sub(" ", raw)
    # &nbsp; va boshqa mnemonikalar teglar olib tashlangach koʻrinib qoladi.
    text = html.unescape(text)
    text = " ".join(text.split())
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _is_admin(user: User) -> bool:
    return any(role.name == "Admin" for role in user.roles)


class FileRepository:
    # ─── Yordamchi ────────────────────────────────────────────────────

    async def _visible_filter(self, session: AsyncSession, user: User):
        """Oʻqituvchiga koʻrinadigan fayllar sharti.

        Savollar bilan bir xil qoida: oʻzi yuklagan fayllar HAM, oʻzi dars
        beradigan fanning savollarida ishlatilayotgan fayllar HAM koʻrinadi.
        Ilgari faqat oʻzi yuklaganini koʻrardi — natijada hech nima
        yuklamagan oʻqituvchiga kutubxona boʻsh koʻrinardi va u hamkasbi
        allaqachon yuklagan rasmni qaytadan yuklardi.
        """
        own = StoredFile.owner_user_id == user.id
        subject_ids = await assigned_subject_ids(session, user)
        if not subject_ids:
            return own

        used_in_my_subjects = (
            select(FileUsage.file_id)
            .join(
                Question,
                and_(Question.id == FileUsage.entity_id, FileUsage.entity_type == "question"),
            )
            .where(Question.subject_id.in_(subject_ids))
        )
        return or_(own, StoredFile.id.in_(used_in_my_subjects))

    async def _get_visible(self, session: AsyncSession, file_id: int, user: User) -> StoredFile:
        """Koʻrish va ishlatish uchun. Oʻzgartirish uchun ``_get_owned``."""
        stored = await session.scalar(
            select(StoredFile)
            .where(StoredFile.id == file_id, StoredFile.is_active.is_(True))
            .options(selectinload(StoredFile.blob), selectinload(StoredFile.usages))
        )
        if not stored:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fayl topilmadi")

        if _is_admin(user) or stored.owner_user_id == user.id:
            return stored

        subject_ids = await assigned_subject_ids(session, user)
        if subject_ids:
            in_my_subjects = await session.scalar(
                select(func.count())
                .select_from(FileUsage)
                .join(
                    Question,
                    and_(Question.id == FileUsage.entity_id, FileUsage.entity_type == "question"),
                )
                .where(FileUsage.file_id == stored.id, Question.subject_id.in_(subject_ids))
            )
            if in_my_subjects:
                return stored

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu fayl sizning fanlaringizga tegishli emas",
        )

    async def _get_owned(self, session: AsyncSession, file_id: int, user: User) -> StoredFile:
        stored = await session.scalar(
            select(StoredFile)
            .where(StoredFile.id == file_id, StoredFile.is_active.is_(True))
            .options(selectinload(StoredFile.blob), selectinload(StoredFile.usages))
        )
        if not stored:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fayl topilmadi")
        if not _is_admin(user) and stored.owner_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu fayl sizniki emas")
        return stored

    async def _get_owned_folder(self, session: AsyncSession, folder_id: int, user: User) -> FileFolder:
        folder = await session.get(FileFolder, folder_id)
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Papka topilmadi")
        if not _is_admin(user) and folder.owner_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu papka sizniki emas")
        return folder

    async def _usage_count(self, session: AsyncSession, file_id: int) -> int:
        return await session.scalar(
            select(func.count()).select_from(FileUsage).where(FileUsage.file_id == file_id)
        ) or 0

    def _to_response(self, stored: StoredFile, usage_count: int = 0) -> FileResponse:
        return FileResponse(
            id=stored.id,
            title=stored.title,
            original_name=stored.original_name,
            url=public_url(stored.blob.stored_path),
            size_bytes=stored.blob.size_bytes,
            mime_type=stored.blob.mime_type,
            folder_id=stored.folder_id,
            owner_user_id=stored.owner_user_id,
            usage_count=usage_count,
        )

    # ─── Yuklash ──────────────────────────────────────────────────────

    async def upload(
        self,
        session: AsyncSession,
        file: UploadFile,
        user: User,
        folder_id: int | None = None,
    ) -> FileResponse:
        if folder_id is not None:
            await self._get_owned_folder(session, folder_id, user)

        stored = await store_upload(
            session,
            file,
            owner_user_id=user.id,
            subdir="files",
            folder_id=folder_id,
        )
        await session.commit()
        await session.refresh(stored, ["blob"])
        return self._to_response(stored, await self._usage_count(session, stored.id))

    # ─── Roʻyxat ──────────────────────────────────────────────────────

    async def list_files(
        self, session: AsyncSession, request: FileListRequest, user: User
    ) -> FileListResponse:
        stmt = select(StoredFile).where(StoredFile.is_active.is_(True))

        if not _is_admin(user):
            stmt = stmt.where(await self._visible_filter(session, user))

        if request.root_only:
            stmt = stmt.where(StoredFile.folder_id.is_(None))
        elif request.folder_id is not None:
            stmt = stmt.where(StoredFile.folder_id == request.folder_id)

        if request.search:
            pattern = f"%{request.search}%"
            stmt = stmt.where(StoredFile.title.ilike(pattern))

        if request.kind:
            exts = IMAGE_EXTS if request.kind == "image" else DOCUMENT_EXTS
            # Kengaytma stored_path oxirida turadi; mime_type ga tayanmaymiz,
            # chunki uni brauzer yuboradi va u har doim ham toʻgʻri emas.
            stmt = stmt.join(StoredFile.blob).where(
                func.lower(func.split_part(FileBlob.stored_path, ".", 2)).in_(exts)
            )

        total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0

        stmt = (
            stmt.options(selectinload(StoredFile.blob))
            .order_by(StoredFile.created_at.desc())
            .offset((request.page - 1) * request.size)
            .limit(request.size)
        )
        rows = (await session.scalars(stmt)).all()

        counts = dict(
            (
                await session.execute(
                    select(FileUsage.file_id, func.count())
                    .where(FileUsage.file_id.in_([r.id for r in rows] or [0]))
                    .group_by(FileUsage.file_id)
                )
            ).all()
        )

        return FileListResponse(
            items=[self._to_response(r, counts.get(r.id, 0)) for r in rows],
            total=total,
            page=request.page,
            size=request.size,
        )

    async def get_file(self, session: AsyncSession, file_id: int, user: User) -> FileDetailResponse:
        stored = await self._get_visible(session, file_id, user)
        usages = await self._describe_usages(session, stored)
        base = self._to_response(stored, len(usages))
        return FileDetailResponse(**base.model_dump(), usages=usages)

    async def _describe_usages(self, session: AsyncSession, stored: StoredFile) -> list[FileUsageInfo]:
        """Ishlatilish joylariga oʻqilishi mumkin nom beradi.

        Nomsiz roʻyxat foydasiz: "resource:412" foydalanuvchiga hech nima
        aytmaydi, "Algoritmlar kursi — 3-dars" esa aytadi.
        """
        result: list[FileUsageInfo] = []
        for usage in stored.usages:
            label = None
            if usage.entity_type == "resource":
                resource = await session.scalar(
                    select(Resource)
                    .where(Resource.id == usage.entity_id)
                    .options(selectinload(Resource.course), selectinload(Resource.lesson))
                )
                if resource:
                    parent = resource.course.name if resource.course else (
                        resource.lesson.topic if resource.lesson else None
                    )
                    label = f"{parent} — {resource.title}" if parent else resource.title
            elif usage.entity_type == "homework":
                homework = await session.get(Homework, usage.entity_id)
                label = homework.title if homework else None
            elif usage.entity_type == "question":
                question = await session.scalar(
                    select(Question)
                    .where(Question.id == usage.entity_id)
                    .options(selectinload(Question.subject))
                )
                if question:
                    # Savollarning aksariyati sof rasmli — matni umuman yoʻq
                    # (lokal bazada 7234 tadan 7008 tasi). Bunda fan nomi
                    # koʻrsatiladi: "#33807" dan koʻra foydaliroq.
                    label = _plain_text(question.text)
                    if not label and question.subject:
                        label = question.subject.name
            result.append(
                FileUsageInfo(entity_type=usage.entity_type, entity_id=usage.entity_id, label=label)
            )
        return result

    # ─── Tahrirlash ───────────────────────────────────────────────────

    async def update_file(
        self, session: AsyncSession, file_id: int, data: FileUpdateRequest, user: User
    ) -> FileResponse:
        stored = await self._get_owned(session, file_id, user)

        if data.title is not None:
            stored.title = data.title

        if data.move_to_root:
            stored.folder_id = None
        elif data.folder_id is not None:
            await self._get_owned_folder(session, data.folder_id, user)
            stored.folder_id = data.folder_id

        await session.commit()
        await session.refresh(stored, ["blob"])
        return self._to_response(stored, await self._usage_count(session, stored.id))

    async def delete_file(self, session: AsyncSession, file_id: int, user: User) -> None:
        stored = await self._get_owned(session, file_id, user)

        usages = await self._describe_usages(session, stored)
        if usages:
            where = ", ".join(u.label or f"{u.entity_type}:{u.entity_id}" for u in usages[:3])
            more = f" va yana {len(usages) - 3} ta joy" if len(usages) > 3 else ""
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Fayl ishlatilyapti: {where}{more}. Avval oʻsha joylardan olib tashlang.",
            )

        # Baytlar qolaveradi: ularni tozalash vazifasi oladi, chunki shu blobga
        # boshqa foydalanuvchining yozuvi ham ishora qilayotgan boʻlishi mumkin.
        stored.is_active = False
        await session.commit()

    # ─── Biriktirish ──────────────────────────────────────────────────

    async def attach(
        self, session: AsyncSession, file_id: int, data: FileAttachRequest, user: User
    ) -> FileResponse:
        # Koʻra oladigan faylni ishlatsa ham boʻladi — almashishning butun
        # maʼnosi shunda. Faylning oʻzini oʻzgartirish esa egasida qoladi.
        stored = await self._get_visible(session, file_id, user)

        existing = await session.scalar(
            select(FileUsage).where(
                FileUsage.file_id == stored.id,
                FileUsage.entity_type == data.entity_type,
                FileUsage.entity_id == data.entity_id,
            )
        )
        if not existing:
            session.add(
                FileUsage(
                    file_id=stored.id,
                    entity_type=data.entity_type,
                    entity_id=data.entity_id,
                )
            )
            await session.commit()

        await session.refresh(stored, ["blob"])
        return self._to_response(stored, await self._usage_count(session, stored.id))

    async def detach(
        self, session: AsyncSession, file_id: int, data: FileAttachRequest, user: User
    ) -> None:
        stored = await self._get_visible(session, file_id, user)
        await session.execute(
            delete(FileUsage).where(
                FileUsage.file_id == stored.id,
                FileUsage.entity_type == data.entity_type,
                FileUsage.entity_id == data.entity_id,
            )
        )
        await session.commit()

    # ─── Papkalar ─────────────────────────────────────────────────────

    async def list_folders(self, session: AsyncSession, user: User) -> list[FolderResponse]:
        stmt = select(FileFolder)
        if not _is_admin(user):
            stmt = stmt.where(FileFolder.owner_user_id == user.id)
        folders = (await session.scalars(stmt.order_by(FileFolder.name))).all()

        counts = dict(
            (
                await session.execute(
                    select(StoredFile.folder_id, func.count())
                    .where(StoredFile.is_active.is_(True), StoredFile.folder_id.isnot(None))
                    .group_by(StoredFile.folder_id)
                )
            ).all()
        )

        return [
            FolderResponse(
                id=f.id, name=f.name, parent_id=f.parent_id, file_count=counts.get(f.id, 0)
            )
            for f in folders
        ]

    async def create_folder(
        self, session: AsyncSession, data: FolderCreateRequest, user: User
    ) -> FolderResponse:
        if data.parent_id is not None:
            await self._get_owned_folder(session, data.parent_id, user)

        folder = FileFolder(owner_user_id=user.id, parent_id=data.parent_id, name=data.name)
        session.add(folder)
        await session.commit()
        await session.refresh(folder)
        return FolderResponse(id=folder.id, name=folder.name, parent_id=folder.parent_id, file_count=0)

    async def update_folder(
        self, session: AsyncSession, folder_id: int, data: FolderUpdateRequest, user: User
    ) -> FolderResponse:
        folder = await self._get_owned_folder(session, folder_id, user)

        if data.name is not None:
            folder.name = data.name
        if data.parent_id is not None:
            if data.parent_id == folder.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Papkani oʻzining ichiga koʻchirib boʻlmaydi",
                )
            await self._get_owned_folder(session, data.parent_id, user)
            folder.parent_id = data.parent_id

        await session.commit()
        await session.refresh(folder)
        count = await self._folder_file_count(session, folder.id)
        return FolderResponse(
            id=folder.id, name=folder.name, parent_id=folder.parent_id, file_count=count
        )

    async def _folder_file_count(self, session: AsyncSession, folder_id: int) -> int:
        return await session.scalar(
            select(func.count())
            .select_from(StoredFile)
            .where(StoredFile.folder_id == folder_id, StoredFile.is_active.is_(True))
        ) or 0

    async def delete_folder(self, session: AsyncSession, folder_id: int, user: User) -> None:
        folder = await self._get_owned_folder(session, folder_id, user)

        # Papka oʻchsa fayllar yoʻqolmaydi — ildizga chiqadi. Fayl bilan birga
        # oʻchirish juda oson xatoga olib keladi.
        count = await self._folder_file_count(session, folder.id)
        if count:
            await session.execute(
                StoredFile.__table__.update()
                .where(StoredFile.folder_id == folder.id)
                .values(folder_id=None)
            )

        await session.delete(folder)
        await session.commit()


get_file_repository = FileRepository()
