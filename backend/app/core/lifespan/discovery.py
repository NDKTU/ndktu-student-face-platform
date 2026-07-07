import inspect
import logging

from core.dependencies.role_checker import PermissionRequired
from fastapi import FastAPI
from fastapi.routing import APIRoute

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
