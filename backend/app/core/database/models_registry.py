"""
Import all models here so SQLAlchemy's Base.metadata is fully populated.
Used by Alembic env.py and anywhere that needs all tables registered.
"""

__all__ = [
    "Announcement",
    "AnnouncementRegistration",
    "User",
    "Role",
    "UserRole",
    "RolePermission",
    "Permission",
    "Student",
    "Faculty",
    "Kafedra",
    "Group",
    "Teacher",
    "Subject",
    "TeacherSubject",
    "TeacherAssignment",
    "Speciality",
    "Course",
    "CourseGroup",
    "CourseTeacher",
    "CourseTopic",
    "Question",
    "Quiz",
    "QuizQuestion",
    "Result",
    "UserAnswers",
    "TeacherGroup",
    "PsychologyMethod",
    "Lesson",
    "Homework",
    "HomeworkSubmission",
    "LessonFaceCheck",
    "Resource",
    "EduPlanCredential",
    "FileBlob",
    "FileFolder",
    "StoredFile",
    "FileUsage",
]

from app.modules.announcement.model import (
    Announcement,
    AnnouncementRegistration,
)
from app.modules.auth.model import (
    Permission,
    Role,
    RolePermission,
    Student,
    Teacher,
    TeacherAssignment,
    TeacherSubject,
    User,
    UserRole,
)
from app.modules.course.model import (
    Course,
    CourseGroup,
    CourseTeacher,
    CourseTopic,
    Homework,
    HomeworkSubmission,
    Lesson,
    LessonFaceCheck,
    Resource,
)
from app.modules.file.model import (
    FileBlob,
    FileFolder,
    FileUsage,
    StoredFile,
)
from app.modules.integration.eduplan.model import (
    EduPlanCredential,
)
from app.modules.organization_structure.model import (
    Faculty,
    Group,
    Kafedra,
    Speciality,
    TeacherGroup,
)
from app.modules.psychology.model import (
    PsychologyMethod,
)
from app.modules.quiz.model import (
    Question,
    Quiz,
    QuizQuestion,
    Result,
    Subject,
    UserAnswers,
)
