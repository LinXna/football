"""Compatibility entry point; implementation lives in scripts/python."""
from pathlib import Path
import runpy

_implementation = runpy.run_path(
    str(Path(__file__).parent / 'scripts' / 'python' / 'review_recommendations.py'),
    run_name='review_recommendations_implementation',
)
globals().update({key: value for key, value in _implementation.items() if key not in {'__name__', '__file__'}})
if __name__ == '__main__':
    raise SystemExit(_implementation['main']())
