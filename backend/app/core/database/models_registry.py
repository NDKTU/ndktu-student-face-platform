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
    "JobTitle",
    
    "Faculty",
    "Kafedra",
    "Group",
    "Teacher",
    "Subject",
    "SubjectTeacher",
    "Speciality",
    "Course",
    "CourseGroup",
    "Question",
    "Quiz",
    "QuizQuestion",
    "Result",
    "UserAnswers",
    "GroupTeacher",
    "PsychologyMethod",
    "Lesson",
    "LessonResult",
    "Assignment",
    "AssignmentSubmission",
    "TeacherAssignment",
    "Department",
    "Resource",
    "Curriculum",
    "CourseTopic",
    "CourseMaterial",
    "CourseMaterialProgress",
]

from app.modules.auth.employee.model import Employee
from app.modules.auth.job_title.model import JobTitle
from app.modules.auth.permission.model import Permission
from app.modules.auth.role.model import Role, RolePermission
from app.modules.auth.student.model import Student
from app.modules.auth.teacher.model import Teacher
from app.modules.auth.teacher_assignment.model import TeacherAssignment
from app.modules.auth.user.model import User, UserRole
from app.modules.course.assignment.model import Assignment, AssignmentSubmission
from app.modules.course.content.model import CourseMaterial, CourseMaterialProgress, CourseTopic
from app.modules.course.course.model import Course, CourseGroup
from app.modules.course.lesson.model import Lesson, LessonResult
from app.modules.course.resource.model import Resource
from app.modules.organization_structure.curriculum.model import Curriculum
from app.modules.organization_structure.department.model import Department
from app.modules.organization_structure.faculty.model import Faculty
from app.modules.organization_structure.group.model import Group, GroupTeacher
from app.modules.organization_structure.kafedra.model import Kafedra
from app.modules.organization_structure.speciality.model import Speciality
from app.modules.psychology.model import (
    PsychologyMethod,
)
from app.modules.quiz.question.model import Question
from app.modules.quiz.quiz.model import Quiz, QuizQuestion
from app.modules.quiz.result.model import Result
from app.modules.quiz.subject.model import Subject, SubjectTeacher
from app.modules.quiz.user_answers.model import UserAnswers
