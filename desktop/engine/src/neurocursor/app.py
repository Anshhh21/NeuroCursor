import json
import sys
from neurocursor import __version__

def run() -> int:
    status = {
        "engineStatus": "ready",
        "message": f"NeuroCursor V{__version__} engine started."
    }
    print(json.dumps(status))
    sys.stdout.flush()
    return 0