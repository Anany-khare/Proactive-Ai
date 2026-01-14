import logging
import re
from typing import Any

class AccessLogFilter(logging.Filter):
    """
    Filter to redact sensitive information from Uvicorn access logs.
    Targeting query parameters: token, access_token, key, secret.
    """
    def __init__(self, param_names=None):
        super().__init__()
        if param_names is None:
            param_names = ["token", "access_token", "key", "secret", "authorization"]
        self.param_names = param_names
        # Regex to find these params in the query string
        # Looks for key=value pairs where key is in param_names
        self.patterns = [
            (re.compile(f"([?&])({name})=([^&\\s]+)", re.IGNORECASE), r"\1\2=[REDACTED]")
            for name in param_names
        ]

    def filter(self, record: logging.LogRecord) -> bool:
        # Uvicorn access logs typically put the method/path in record.args
        # e.g. record.args = ('127.0.0.1:5173', 'GET', '/path?token=xyz', 'HTTP/1.1', 200)
        # We need to modify record.args if it exists and contains our target strings
        
        if hasattr(record, "args") and isinstance(record.args, tuple):
             new_args = list(record.args)
             modified = False
             
             # The URL path + query is usually the 3rd argument (index 2) in standard uvicorn log format string
             # "%s - \"%s %s HTTP/%s\" %d" -> (client_addr, method, full_path, http_version, status_code)
             # But it depends on the formatter. Let's just blindly try to redact strings in args.
             
             for i, arg in enumerate(new_args):
                 if isinstance(arg, str):
                     original_arg = arg
                     for pattern, replacement in self.patterns:
                         arg = pattern.sub(replacement, arg)
                     if arg != original_arg:
                         new_args[i] = arg
                         modified = True
             
             if modified:
                 record.args = tuple(new_args)
                 
        return True

def configure_logging():
    """Apply the filter to uvicorn.access logger"""
    logger = logging.getLogger("uvicorn.access")
    logger.addFilter(AccessLogFilter())
