"""
Import all models here so SQLAlchemy's Base.metadata is fully populated.
Used by Alembic env.py and anywhere that needs all tables registered.
"""

__all__ = [
    "User",
    "Role",
    "UserRole",
    "RolePermission",
    "Permission",
    "Student",
    "Employee",
    "Faculty",
    "Kafedra",
    "Group",
    "Teacher",
    "Subject",
    "SubjectTeacher",
    "Speciality",
    "Course",
    "CourseGroup",
    "CourseTopic",
    "Question",
    "Quiz",
    "QuizQuestion",
    "Result",
    "UserAnswers",
    "GroupTeacher",
    "PsychologyMethod",
    "Lesson",
    "Assignment",
    "AssignmentSubmission",
    "TeacherAssignment",
    "Department",
    "Resource",
    "EduPlanCredential",
]

from app.modules.auth.model import (
    Employee,
    Permission,
    Role,
    RolePermission,
    Student,
    Teacher,
    TeacherAssignment,
    User,
    UserRole,
)
from app.modules.course.model import (
    Assignment,
    AssignmentSubmission,
    Course,
    CourseGroup,
    CourseTopic,
    Lesson,
    Resource,
)
from app.modules.integration.eduplan.model import (
    EduPlanCredential,
)
from app.modules.organization_structure.model import (
    Department,
    Faculty,
    Group,
    GroupTeacher,
    Kafedra,
    Speciality,
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
    SubjectTeacher,
    UserAnswers,
)
