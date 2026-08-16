"""Compatibility entry point; implementation lives in scripts/python."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).parent / 'scripts' / 'python' / 'review_formal_recommendations.py'), run_name='__main__')
