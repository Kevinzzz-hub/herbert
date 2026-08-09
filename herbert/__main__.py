"""Allow Herbert to run with ``python -m herbert``."""

from herbert.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
