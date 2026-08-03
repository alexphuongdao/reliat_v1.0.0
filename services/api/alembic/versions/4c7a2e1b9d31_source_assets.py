"""add source assets and measurement idempotency"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4c7a2e1b9d31"
down_revision: Union[str, Sequence[str], None] = "b7f31c904e2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "source_assets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("tenant_id", sa.String(length=32), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(length=512), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("storage_uri", sa.String(length=1024), nullable=True),
        sa.Column("profile_id", sa.String(length=128), nullable=True),
        sa.Column("profile_version", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("received_by", sa.String(length=32), nullable=True),
        sa.Column("ingested_at", sa.DateTime(), nullable=True),
        sa.Column("rows_read", sa.Integer(), nullable=False),
        sa.Column("rows_written", sa.Integer(), nullable=False),
        sa.Column("rows_rejected", sa.Integer(), nullable=False),
        sa.Column("rows_duplicate", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(length=4096), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["received_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "sha256", name="uq_source_assets_tenant_sha256"),
    )
    op.create_index("ix_source_assets_tenant_id", "source_assets", ["tenant_id"])
    op.add_column("measurements", sa.Column("source_asset_id", sa.String(length=40), nullable=True))
    op.create_index("ix_measurements_source_asset_id", "measurements", ["source_asset_id"])
    op.create_foreign_key(
        "fk_measurements_source_asset_id", "measurements", "source_assets",
        ["source_asset_id"], ["id"], ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_measurements_channel_t", "measurements", ["channel_id", "t"])


def downgrade() -> None:
    op.drop_constraint("uq_measurements_channel_t", "measurements", type_="unique")
    op.drop_constraint("fk_measurements_source_asset_id", "measurements", type_="foreignkey")
    op.drop_index("ix_measurements_source_asset_id", table_name="measurements")
    op.drop_column("measurements", "source_asset_id")
    op.drop_index("ix_source_assets_tenant_id", table_name="source_assets")
    op.drop_table("source_assets")
