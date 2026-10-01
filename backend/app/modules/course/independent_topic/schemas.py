from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import TashkentDatetime

TITLE_MAX_LENGTH = 255


class IndependentTopicCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: Optional[str] = None
    #: Roʻyxatdagi tartib. Berilmasa — oxiriga qoʻshiladi.
    position: Optional[int] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Mavzu nomi boʻsh boʻlishi mumkin emas")
        return value

    @field_validator("description")
    @classmethod
    def description_blank_to_none(cls, value: Optional[str]) -> Optional[str]:
        # Boʻsh satr bilan `null` ni ajratishdan maʼno yoʻq: ikkalasi ham
        # «izoh yoʻq» degani, lekin roʻyxatda boʻsh qator chizilardi.
        if value is None:
            return None
        value = value.strip()
        return value or None


class IndependentTopicUpdateRequest(IndependentTopicCreateRequest):
    pass


class IndependentTopicResponse(BaseModel):
    id: int
    course_id: int
    title: str
    description: Optional[str] = None
    position: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class IndependentTopicListResponse(BaseModel):
    total: int
    topics: list[IndependentTopicResponse]
