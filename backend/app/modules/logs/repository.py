import logging

from .schemas import ClientLogEntry

client_logger = logging.getLogger("frontend.client")


class ClientLogService:
    def record(self, entry: ClientLogEntry, *, client_ip: str) -> None:
        log_fn = client_logger.error if entry.level == "error" else client_logger.warning
        log_fn(
            "%s | url=%s | ua=%s | ip=%s | source=%s | extra=%s%s%s",
            entry.message,
            entry.url,
            entry.user_agent,
            client_ip,
            entry.source,
            entry.extra,
            f"\nstack: {entry.stack}" if entry.stack else "",
            f"\ncomponent_stack: {entry.component_stack}" if entry.component_stack else "",
        )


get_client_log_service = ClientLogService()
