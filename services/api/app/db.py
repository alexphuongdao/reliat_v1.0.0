from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_session() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def init_db() -> None:
    """Create tables from the ORM — SQLite only.

    Postgres schema is owned by Alembic. Running `create_all` against it is
    not a harmless no-op: it creates any table the ORM declares but the
    migrations have not yet added, which then makes the real migration fail
    with `DuplicateTable` and leaves the database half-migrated (new table
    present, new columns and constraints absent). That happened on
    2026-08-03 with `source_assets`.

    Two schema authorities is one too many. On Postgres this is a no-op and
    `alembic upgrade head` is the only path.
    """
    from . import models  # noqa: F401  (ensure mappers are registered)
    if not settings.database_url.startswith("sqlite"):
        return
    Base.metadata.create_all(engine)
