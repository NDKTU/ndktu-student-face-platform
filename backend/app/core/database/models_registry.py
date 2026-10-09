"""
Import all models here so SQLAlchemy's Base.metadata is fully populated.
Used by Alembic env.py and anywhere that needs all tables registered.
"""

__all__ = [
    "Announcement",
    "AuditLog",
    "IndependentTopic",
    "Notification",
    "AppSetting",
    "AnnouncementRegistration",
    "HemisDataCredential",
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
    "Curriculum",
    "Course",
    "CourseGroup",
    "CourseTeacher",
    "Question",
    "Quiz",
    "QuizQuestion",
    "QuizLesson",
    "Result",
    "UserAnswers",
    "TeacherGroup",
    "PsychologyMethod",
    "GeneralTest",
    "ZoomSession",
    "ZoomSessionGroup",
    "ZoomFaceCheck",
    "Lesson",
    "Homework",
    "HomeworkSubmission",
    "LessonAttendance",
    "LessonFaceCheck",
    "Resource",
    "EduPlanCredential",
    "FileBlob",
    "FileFolder",
    "StoredFile",
    "FileUsage",
    "FileQuotaChange",
]

from app.modules.announcement.model import (
    Announcement,
    AnnouncementRegistration,
)
from app.modules.app_setting.model import (
    AppSetting,
)
from app.modules.audit.model import (
    AuditLog,
)
from app.modules.notification.model import (
    Notification,
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
from app.modules.auth.hemis.model import (
    HemisDataCredential,
)
from app.modules.course.model import (
    Course,
    CourseGroup,
    CourseMessage,
    CourseTeacher,
    Homework,
    HomeworkSubmission,
    IndependentTopic,
    Lesson,
    LessonAttendance,
    LessonFaceCheck,
    Resource,
)
from app.modules.file.model import (
    FileBlob,
    FileFolder,
    FileQuotaChange,
    FileUsage,
    StoredFile,
)
from app.modules.general_test.model import (
    GeneralTest,
)
from app.modules.integration.eduplan.model import (
    EduPlanCredential,
)
from app.modules.organization_structure.model import (
    Curriculum,
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
    QuizLesson,
    QuizQuestion,
    Result,
    Subject,
    UserAnswers,
)
from app.modules.zoom_session.model import (
    ZoomFaceCheck,
    ZoomSession,
    ZoomSessionGroup,
)
