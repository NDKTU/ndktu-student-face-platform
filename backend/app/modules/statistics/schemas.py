from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

# ---------- existing ----------


class GeneralStatisticsResponse(BaseModel):
    total_students_tested: int
    total_quizzes_taken: int
    system_average_grade: float

    model_config = ConfigDict(from_attributes=True)


class QuizStatisticsResponse(BaseModel):
    quiz_id: int
    title: str
    times_taken: int
    average_grade: float
    highest_grade: int
    lowest_grade: int

    model_config = ConfigDict(from_attributes=True)


class UserStatisticsResponse(BaseModel):
    user_id: int
    full_name: Optional[str]
    quizzes_taken: int
    average_grade: float

    model_config = ConfigDict(from_attributes=True)


class FacultyGroupStat(BaseModel):
    group_id: int
    name: str
    total_quizzes_taken: int
    average_grade: float

    model_config = ConfigDict(from_attributes=True)


class FacultyStatisticsResponse(BaseModel):
    faculty_id: int
    name: str
    total_quizzes_taken: int
    average_grade: float
    groups: list[FacultyGroupStat]

    model_config = ConfigDict(from_attributes=True)


class GroupStatisticsResponse(BaseModel):
    group_id: int
    name: str
    total_quizzes_taken: int
    average_grade: float

    model_config = ConfigDict(from_attributes=True)


class TeacherStatisticsResponse(BaseModel):
    teacher_id: int
    full_name: str
    total_quizzes_created: int
    total_results: int
    average_grade: float

    model_config = ConfigDict(from_attributes=True)


# ---------- A. Quiz analytics ----------


class GradeBucket(BaseModel):
    bucket: str
    count: int


class GradeDistributionResponse(BaseModel):
    total: int
    buckets: list[GradeBucket]


class PassRateResponse(BaseModel):
    threshold: int
    total: int
    passed: int
    failed: int
    pass_rate_pct: float


class GradeTrendPoint(BaseModel):
    period: str
    attempts: int
    average_grade: float


class GradeTrendResponse(BaseModel):
    granularity: str
    points: list[GradeTrendPoint]


class QuizDifficultyRow(BaseModel):
    quiz_id: int
    title: str
    attempts: int
    average_grade: float


class QuizDifficultyResponse(BaseModel):
    order: str
    rows: list[QuizDifficultyRow]


class QuizTimeStatsRow(BaseModel):
    quiz_id: int
    title: str
    duration_minutes: int
    attempts: int


class QuizTimeStatsResponse(BaseModel):
    rows: list[QuizTimeStatsRow]


# ---------- B. Item / question analysis ----------


class QuestionDifficultyRow(BaseModel):
    question_id: int
    text: str
    total_responses: int
    correct_count: int
    correct_pct: float


class QuestionDifficultyResponse(BaseModel):
    quiz_id: int
    rows: list[QuestionDifficultyRow]


class QuestionDiscriminationRow(BaseModel):
    question_id: int
    text: str
    top_correct_pct: float
    bottom_correct_pct: float
    discrimination_index: float


class QuestionDiscriminationResponse(BaseModel):
    quiz_id: int
    sample_size: int
    rows: list[QuestionDiscriminationRow]


class DistractorRow(BaseModel):
    answer: str
    count: int
    pct: float


class TopDistractorsResponse(BaseModel):
    question_id: int
    correct_answer: Optional[str]
    rows: list[DistractorRow]


class FlaggedQuestionRow(BaseModel):
    question_id: int
    text: str
    correct_pct: float
    flag: str  # "too_easy" | "too_hard"


class FlaggedQuestionsResponse(BaseModel):
    quiz_id: int
    rows: list[FlaggedQuestionRow]


# ---------- C. Proctoring / cheating ----------


class CheatingOverviewResponse(BaseModel):
    total_attempts: int
    cheating_attempts: int
    cheating_rate_pct: float


class CheatingReasonRow(BaseModel):
    reason: Optional[str]
    count: int
    pct: float


class CheatingByReasonResponse(BaseModel):
    total_cheating: int
    rows: list[CheatingReasonRow]


class CheatingScopeRow(BaseModel):
    scope_id: int
    name: str
    total: int
    cheating: int
    cheating_rate_pct: float


class CheatingByScopeResponse(BaseModel):
    scope: str
    rows: list[CheatingScopeRow]


class RepeatOffenderRow(BaseModel):
    user_id: int
    full_name: Optional[str]
    group_name: Optional[str]
    cheating_count: int


class RepeatOffendersResponse(BaseModel):
    min_count: int
    rows: list[RepeatOffenderRow]


class SuspectQuizRow(BaseModel):
    quiz_id: int
    title: str
    attempts: int
    cheating_attempts: int
    cheating_rate_pct: float


class SuspectQuizzesResponse(BaseModel):
    threshold_pct: float
    rows: list[SuspectQuizRow]


class ProctoringEvidenceRow(BaseModel):
    result_id: int
    quiz_id: Optional[int]
    quiz_title: Optional[str]
    cheating_image_url: Optional[str]
    reason_for_stop: Optional[str]
    created_at: datetime


class ProctoringEvidenceResponse(BaseModel):
    user_id: int
    rows: list[ProctoringEvidenceRow]


# ---------- D. Organizational slices ----------


class TopStudentRow(BaseModel):
    user_id: int
    full_name: Optional[str]
    attempts: int
    average_grade: float


class TopGroupRow(BaseModel):
    group_id: int
    name: str
    attempts: int
    average_grade: float


class SubjectStatsResponse(BaseModel):
    subject_id: int
    name: str
    attempts: int
    average_grade: float
    pass_rate_pct: float
    top_groups: list[TopGroupRow]
    top_students: list[TopStudentRow]


class KafedraStatsResponse(BaseModel):
    kafedra_id: int
    name: str
    teacher_count: int
    quizzes_created: int
    attempts: int
    average_grade: float


class CourseStatsResponse(BaseModel):
    course_id: int
    name: str
    subject_id: Optional[int]
    teacher_id: Optional[int]
    group_count: int
    attempts: int
    average_grade: float


class LeaderboardRow(BaseModel):
    scope_id: int
    name: str
    attempts: int
    average_grade: float


class LeaderboardResponse(BaseModel):
    level: str
    rows: list[LeaderboardRow]


# ---------- E. Demographics ----------


class DemographicRow(BaseModel):
    category: str
    attempts: int
    average_grade: float
    pass_rate_pct: float


class DemographicResponse(BaseModel):
    dimension: str
    rows: list[DemographicRow]


class GpaBucketRow(BaseModel):
    gpa_bucket: str
    student_count: int
    average_grade: float


class GpaCorrelationResponse(BaseModel):
    rows: list[GpaBucketRow]


class SemesterRow(BaseModel):
    semester: str
    attempts: int
    average_grade: float


class SemesterProgressionResponse(BaseModel):
    rows: list[SemesterRow]


# ---------- F. Yakuniy ----------


class YakuniySubjectRow(BaseModel):
    subject_id: int
    name: str
    count: int
    average_grade: float


class YakuniyBySubjectResponse(BaseModel):
    rows: list[YakuniySubjectRow]


class YakuniyDistributionResponse(BaseModel):
    total: int
    buckets: list[GradeBucket]


class YakuniyVsQuizPoint(BaseModel):
    user_id: int
    subject_id: int
    quiz_avg: float
    yakuniy_grade: int


class YakuniyVsQuizResponse(BaseModel):
    sample_size: int
    pearson_r: Optional[float]
    points: list[YakuniyVsQuizPoint]


# ---------- G. Psychology ----------


class PsychologyMethodCoverageRow(BaseModel):
    method_id: int
    name: str
    completions: int
    coverage_pct: float


class PsychologyCoverageResponse(BaseModel):
    total_students: int
    rows: list[PsychologyMethodCoverageRow]


class DiagnosisRow(BaseModel):
    label: str
    count: int
    pct: float


class DiagnosisDistributionResponse(BaseModel):
    method_id: int
    total: int
    rows: list[DiagnosisRow]


class PsychologyMethodPopularityRow(BaseModel):
    method_id: int
    name: str
    attempts: int


class PsychologyMethodPopularityResponse(BaseModel):
    rows: list[PsychologyMethodPopularityRow]


class PsychologyVsAcademicRow(BaseModel):
    label: str
    student_count: int
    average_quiz_grade: float


class PsychologyVsAcademicResponse(BaseModel):
    method_id: int
    rows: list[PsychologyVsAcademicRow]


class PsychologyRiskRow(BaseModel):
    user_id: int
    full_name: Optional[str]
    label: str
    diagnosis: dict[str, Any] | list[Any] | None


class PsychologyRiskGroupResponse(BaseModel):
    method_id: int
    rows: list[PsychologyRiskRow]


# ---------- H. Teacher activity ----------


class TeacherQuestionQualityResponse(BaseModel):
    teacher_id: int
    total_questions: int
    average_correct_pct: float


class TeacherActivityPoint(BaseModel):
    period: str
    quizzes_created: int


class TeacherActivityResponse(BaseModel):
    teacher_id: int
    granularity: str
    points: list[TeacherActivityPoint]


class TeacherProctoringResponse(BaseModel):
    teacher_id: int
    total_attempts: int
    cheating_attempts: int
    cheating_rate_pct: float
