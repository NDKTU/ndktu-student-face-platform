"""Fayl kutubxonasining modellari.

Uchta narsa ataylab ajratilgan, chunki ular bir xil emas:

* ``FileBlob``  — diskdagi baytlar. sha256 boʻyicha yagona: ikki kishi bir xil
  faylni yuklasa, diskda bitta nusxa yotadi.
* ``StoredFile`` — kutubxona yozuvi: kimniki, qanday nomlangan, qaysi papkada.
  Bitta blobga bir nechta yozuv ishora qilishi mumkin.
* ``FileUsage``  — fayl qayerda ishlatilyapti. Oʻchirishdan oldin shu jadval
  tekshiriladi, aks holda boshqa oʻqituvchining darsidagi ilova yoʻqoladi.

Model ``File`` emas, ``StoredFile`` deb ataladi: router'larda ``fastapi.File``
import qilinadi va nom toʻqnashuvi chalkashlik keltirib chiqaradi.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import User

# file_usages.entity_type uchun ruxsat etilgan qiymatlar. Enum emas, satr:
# yangi tur qoʻshish migratsiyasiz boʻlishi kerak.
USAGE_ENTITY_TYPES = ("resource", "homework", "submission", "question")


class FileBlob(Base, IdIntPk, TimestampMixin):
    """Diskdagi jismoniy fayl. Bir xil baytlar — bitta satr."""

    __tablename__ = "file_blobs"

    sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    # uploads ildizidan boshlangan nisbiy yoʻl: "files/uuid.pdf",
    # "question/uuid.png". Absolut URL saqlanmaydi — domen almashsa havolalar
    # oʻlib qolishini savol rasmlarida bir marta koʻrganmiz.
    stored_path: Mapped[str] = mapped_column(String(255), nullable=False)

    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)

    files: Mapped[list["StoredFile"]] = relationship("StoredFile", back_populates="blob")

    def __str__(self):
        return f"FileBlob {self.id} ({self.stored_path})"


class FileFolder(Base, IdIntPk, TimestampMixin):
    """Oʻqituvchining shaxsiy papkasi. Ixtiyoriy, ichma-ich boʻlishi mumkin."""

    __tablename__ = "file_folders"

    owner_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("file_folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    owner: Mapped["User"] = relationship("User")
    parent: Mapped["FileFolder | None"] = relationship("FileFolder", remote_side="FileFolder.id")

    def __str__(self):
        return f"FileFolder {self.id} ({self.name})"


class StoredFile(Base, IdIntPk, TimestampMixin):
    """Kutubxona yozuvi: falon foydalanuvchining falon nomdagi fayli."""

    __tablename__ = "files"

    blob_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("file_blobs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    owner_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    folder_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("file_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Foydalanuvchi koʻradigan nom. Boshida original_name bilan bir xil, keyin
    # oʻzgartirilishi mumkin.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Oʻchirilgan fayl darhol yoʻq qilinmaydi: avval roʻyxatdan chiqadi,
    # baytlarni keyinroq tozalash vazifasi oladi.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    blob: Mapped["FileBlob"] = relationship("FileBlob", back_populates="files")
    owner: Mapped["User | None"] = relationship("User")
    folder: Mapped["FileFolder | None"] = relationship("FileFolder")
    usages: Mapped[list["FileUsage"]] = relationship(
        "FileUsage", back_populates="file", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # Bir foydalanuvchi bir xil faylni ikki marta yuklasa, ikkinchi marta
        # yangi yozuv yaratilmaydi — mavjudi qaytariladi.
        Index("ix_files_owner_blob", "owner_user_id", "blob_id"),
    )

    def __str__(self):
        return f"StoredFile {self.id} ({self.title})"


class FileUsage(Base, IdIntPk, TimestampMixin):
    """Fayl qayerda ishlatilayotgani. Xavfsiz oʻchirishning asosi."""

    __tablename__ = "file_usages"

    file_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("files.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)

    file: Mapped["StoredFile"] = relationship("StoredFile", back_populates="usages")

    __table_args__ = (
        UniqueConstraint("file_id", "entity_type", "entity_id", name="uq_file_usage"),
        Index("ix_file_usages_entity", "entity_type", "entity_id"),
    )

    def __str__(self):
        return f"FileUsage {self.id} ({self.entity_type}:{self.entity_id})"
