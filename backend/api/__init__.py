"""HTTP layer — Pydantic schemas + heartbeat router.

This package owns the FastAPI surface area: request/response shapes
(``schemas``) and the heartbeat endpoint + watchdog (``heartbeat``).
``main.py`` wires these into the FastAPI app.
"""
