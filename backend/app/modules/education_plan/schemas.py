from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EducationPlanSubjectCreateRequest(BaseModel):
    subject_id: int
    semester: int = Field(ge=1, le=8)


class EducationPlanSubjectResponse(BaseModel):
    id: int
    education_plan_id: int
    subject_id: int
    semester: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EducationPlanCreateRequest(BaseModel):
    speciality_id: int
    name: str = Field(min_length=1, max_length=255)
    year: Optional[int] = None
    subjects: List[EducationPlanSubjectCreateRequest] = Field(default_factory=list)


class EducationPlanUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    year: Optional[int] = None
    speciality_id: Optional[int] = None


class EducationPlanResponse(BaseModel):
    id: int
    speciality_id: int
    name: str
    year: Optional[int] = None
    subjects: List[EducationPlanSubjectResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EducationPlanListRequest(BaseModel):
    speciality_id: Optional[int] = None
    year: Optional[int] = None
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class EducationPlanListResponse(BaseModel):
    total: int
    page: int
    limit: int
    education_plans: List[EducationPlanResponse]
