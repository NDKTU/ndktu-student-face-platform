import inspect
import logging

from dependence.role_checker import PermissionRequired
from fastapi import FastAPI
from fastapi.routing import APIRoute
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.permission.model import Permission
from app.modules.role.models.role import Role
from app.modules.role.models.role_permission import RolePermission

logger = logging.getLogger(__name__)


def discover_permissions(app: FastAPI) -> set[str]:
    """
    Scans ALL FastAPI app routes to discover permissions defined in PermissionRequired dependencies.
    Checks both route-level dependencies AND function-parameter-level Depends().
    """
    permissions = set()
    logger.info(f"Scanning {len(app.routes)} routes for permissions...")

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        # 1. Check route-level dependencies (e.g., dependencies=[Depends(...)])
        for dependency in route.dependencies:
            dep_callable = dependency.dependency
            if isinstance(dep_callable, PermissionRequired):
                permissions.add(dep_callable.permission_name)

        # 2. Check function-parameter-level Depends (e.g., _: ... = Depends(PermissionRequired("...")))
        endpoint = route.endpoint
        sig = inspect.signature(endpoint)
        for param in sig.parameters.values():
            if param.default is inspect.Parameter.empty:
                continue
            # FastAPI Depends wraps the actual callable
            dep = param.default
            if hasattr(dep, "dependency"):
                dep_callable = dep.dependency
                if isinstance(dep_callable, PermissionRequired):
                    permissions.add(dep_callable.permission_name)

    return permissions


async def init_db(app: FastAPI, session: AsyncSession):
    """
    Initialize roles and permissions in the database using dynamic discovery.
    """
    try:
        logger.info("Initializing roles and permissions...")

        # 0. Discover Permissions from all routes
        discovered_permissions = discover_permissions(app)
        logger.info(f"Discovered {len(discovered_permissions)} permissions: {discovered_permissions}")

        if not discovered_permissions:
            logger.warning("No permissions discovered! Check your routes.")
            return

        # 1. Reset sequences to avoid UniqueViolation errors
        # Use GREATEST(..., 1) because setval cannot accept 0
        # Third arg 'false' means next nextval() returns this value (safe for empty tables)
        await session.execute(
            text(
                "SELECT setval('permissions_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM permissions), 1), (SELECT COUNT(*) > 0 FROM permissions))"
            )
        )
        await session.execute(
            text(
                "SELECT setval('roles_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM roles), 1), (SELECT COUNT(*) > 0 FROM roles))"
            )
        )
        await session.execute(
            text(
                "SELECT setval('role_permissions_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM role_permissions), 1), (SELECT COUNT(*) > 0 FROM role_permissions))"
            )
        )

        # 2. Create/Update Permissions
        existing_perms_stmt = select(Permission)
        existing_perms_result = await session.execute(existing_perms_stmt)
        existing_perms = {p.name: p for p in existing_perms_result.scalars().all()}

        new_perms = []
        for perm_name in discovered_permissions:
            if perm_name not in existing_perms:
                new_perm = Permission(name=perm_name)
                session.add(new_perm)
                new_perms.append(perm_name)

        if new_perms:
            await session.commit()
            logger.info(f"Created {len(new_perms)} new permissions: {new_perms}")
            # Reload to get IDs
            existing_perms_result = await session.execute(select(Permission))
            existing_perms = {p.name: p for p in existing_perms_result.scalars().all()}
        else:
            logger.info("All discovered permissions already exist.")

        # 3. Create Roles
        ROLES = ["Admin", "Teacher", "Student", "User", "Psixologik"]
        existing_roles_stmt = select(Role)
        existing_roles_result = await session.execute(existing_roles_stmt)
        existing_roles = {r.name: r for r in existing_roles_result.scalars().all()}

        created_role_names: set[str] = set()
        for role_name in ROLES:
            if role_name not in existing_roles:
                new_role = Role(name=role_name)
                session.add(new_role)
                await session.flush()
                existing_roles[role_name] = new_role
                created_role_names.add(role_name)
                logger.info(f"Created new role: {role_name}")

        await session.commit()

        # 4. Assign Permissions to Roles
        # Admin gets ALL permissions
        admin_perms = discovered_permissions

        # Teacher gets questions, quizzes, statistics, results, subjects, lessons,
        # academic_year (read only), lesson results. Lesson ownership is enforced inside its
        # repository (teachers can only CRUD lessons for groups they own).
        # Note: create/read/update/delete:employee are intentionally admin-only — no
        # keyword below matches "employee", so they only land on Admin via admin_perms.
        admin_only_perms = {
            "create:academic_year",
            "update:academic_year",
            "delete:academic_year",
            "create:submission",  # submissions are created by students, not teachers
            "create:student_movement",
            "update:student_movement",
            "delete:student_movement",
        }
        teacher_perms = {
            p
            for p in discovered_permissions
            if any(
                keyword in p
                for keyword in (
                    "question",
                    "quiz",
                    "statistics",
                    "result",
                    "teacher",
                    "subject",
                    "psychology",
                    "lesson",
                    "academic_year",
                    "module",
                    "topic",
                    "assignment",
                    "submission",
                    "student_movement",
                )
            )
            and not p.startswith("delete:result")
            and p not in admin_only_perms
        }

        if "read:role" in discovered_permissions:
            teacher_perms.add("read:role")
        if "user:me" in discovered_permissions:
            teacher_perms.add("user:me")
        if "employee:me" in discovered_permissions:
            teacher_perms.add("employee:me")

        # Student gets read-only quiz/result + quiz process + user:me + read:psychology
        # + read:assignment / create+read:submission for homework workflow
        # + read:module / read:topic for course structure visibility
        student_perms = {
            p
            for p in discovered_permissions
            if (
                p == "read:quiz"
                or p == "read:result"
                or p.startswith("quiz_process:")
                or p == "user_answers:read"
                or p == "read:psychology"
                or p == "read:lesson"
                or p == "read:assignment"
                or p == "create:submission"
                or p == "read:submission"
                or p == "read:module"
                or p == "read:topic"
            )
        }
        if "user:me" in discovered_permissions:
            student_perms.add("user:me")

        user_perms = {"user:me"} if "user:me" in discovered_permissions else set()

        # Psixologik: full access only to psychology endpoints + user:me/employee:me for own profile.
        psixologik_perms = {p for p in discovered_permissions if "psychology" in p}
        if "user:me" in discovered_permissions:
            psixologik_perms.add("user:me")
        if "employee:me" in discovered_permissions:
            psixologik_perms.add("employee:me")

        ROLE_PERMISSIONS_MAP = {
            "Admin": admin_perms,
            "Teacher": teacher_perms,
            "Student": student_perms,
            "User": user_perms,
            "Psixologik": psixologik_perms,
        }

        for role_name, target_perm_names in ROLE_PERMISSIONS_MAP.items():
            role = existing_roles.get(role_name)
            if not role:
                logger.warning(f"Role '{role_name}' not found, skipping permission assignment.")
                continue

            # Admin is always force-synced to every discovered permission so the
            # system can never be locked out. For the other default roles, the
            # UI is the source of truth: defaults are only seeded when the role
            # is freshly created in this init_db run.
            is_admin_role = role_name == "Admin"
            is_freshly_created = role_name in created_role_names
            if not is_admin_role and not is_freshly_created:
                logger.info(f"Skipping permission sync for existing role '{role_name}' (UI is source of truth).")
                continue

            # Get current permissions for this role
            current_role_perms_stmt = select(RolePermission).where(RolePermission.role_id == role.id)
            current_role_perms_result = await session.execute(current_role_perms_stmt)
            current_role_perm_ids = {rp.permission_id for rp in current_role_perms_result.scalars().all()}

            assigned_count = 0
            for perm_name in target_perm_names:
                perm = existing_perms.get(perm_name)
                if perm and perm.id not in current_role_perm_ids:
                    session.add(RolePermission(role_id=role.id, permission_id=perm.id))
                    assigned_count += 1

            if assigned_count > 0:
                logger.info(f"Assigned {assigned_count} new permissions to role '{role_name}'")

        await session.commit()
        logger.info("Roles and permissions initialization complete.")

    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        await session.rollback()
        raise e
