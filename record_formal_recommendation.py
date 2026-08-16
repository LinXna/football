"""Compatibility entry point; implementation lives in scripts/python."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).parent / 'scripts' / 'python' / 'record_formal_recommendation.py'), run_name='__main__')
