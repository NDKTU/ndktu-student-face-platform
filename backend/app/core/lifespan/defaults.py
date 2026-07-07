"""
Default role seeded at startup.

Only "Admin" is auto-created and force-synced to every discovered permission
on every boot, so the system can never be locked out. Other roles
(Teacher/Student/User/Psixologik/...) are intentionally NOT auto-seeded —
an Admin creates them manually via the Roles/Permissions UI and assigns
whatever permissions they need, which is then the durable source of truth
for that role (init_db never touches a manually-created role's permissions).
"""

ADMIN_ROLE_NAME = "Admin"
