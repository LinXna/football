"""Compatibility entry point; implementation lives in scripts/python."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).parent / 'scripts' / 'python' / 'manage_team_aliases.py'), run_name='__main__')
