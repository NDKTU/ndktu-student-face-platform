from datetime import date as date_type
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SemesterCreateRequest(BaseModel):
    number: Literal[1, 2]
    start_date: date_type
    end_date: date_type


class SemesterResponse(BaseModel):
    id: int
    academic_year_id: int
    number: int
    start_date: date_type
    end_date: date_type
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SemesterUpdateRequest(BaseModel):
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    is_active: Optional[bool] = None


class AcademicYearCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    start_date: date_type
    end_date: date_type
    is_active: bool = False
    semesters: List[SemesterCreateRequest] = Field(default_factory=list)


class AcademicYearUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=32)
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    is_active: Optional[bool] = None


class AcademicYearResponse(BaseModel):
    id: int
    name: str
    start_date: date_type
    end_date: date_type
    is_active: bool
    semesters: List[SemesterResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AcademicYearListRequest(BaseModel):
    is_active: Optional[bool] = None
    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class AcademicYearListResponse(BaseModel):
    total: int
    page: int
    limit: int
    years: List[AcademicYearResponse]
