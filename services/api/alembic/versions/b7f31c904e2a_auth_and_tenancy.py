"""auth and tenancy

Adds identity (tenants/users/sessions/oauth_accounts) and puts every channel
behind a tenant.

The upgrade is written to preserve the real ingested CEMEX data already in
this database: `channels.tenant_id` lands nullable, existing rows are
backfilled to the CEMEX tenant (the only customer at the time of writing),
and only then is the column made NOT NULL.

Revision ID: b7f31c904e2a
Revises: d322dfbb1a19
Create Date: 2026-07-30
"""
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7f31c904e2a'
down_revision: Union[str, Sequence[str], None] = 'd322dfbb1a19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept in sync with app.bootstrap.CEMEX_TENANT_ID — the backfill below and
# the startup bootstrap must agree on which row is CEMEX.
CEMEX_TENANT_ID = "tn_cemex"


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("tenant_id", sa.String(length=32), nullable=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_account_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"])
    op.create_index(
        "ix_oauth_provider_account",
        "oauth_accounts",
        ["provider", "provider_account_id"],
        unique=True,
    )

    # --- channels.tenant_id: add nullable, backfill, then enforce ---
    op.add_column("channels", sa.Column("tenant_id", sa.String(length=32), nullable=True))

    conn = op.get_bind()
    has_channels = conn.execute(sa.text("SELECT COUNT(*) FROM channels")).scalar() or 0
    if has_channels:
        # Every channel that exists today is CEMEX data — they are the only
        # customer. Create the tenant here so the backfill has a target even
        # if the app never boots (e.g. a migration-only run).
        conn.execute(
            sa.text(
                "INSERT INTO tenants (id, slug, name, active, created_at) "
                "VALUES (:id, :slug, :name, true, :now)"
            ),
            {
                "id": CEMEX_TENANT_ID,
                "slug": "cemex",
                "name": "CEMEX",
                "now": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        )
        conn.execute(
            sa.text("UPDATE channels SET tenant_id = :id WHERE tenant_id IS NULL"),
            {"id": CEMEX_TENANT_ID},
        )

    op.alter_column("channels", "tenant_id", existing_type=sa.String(length=32), nullable=False)
    op.create_index("ix_channels_tenant_id", "channels", ["tenant_id"])
    op.create_foreign_key(
        "fk_channels_tenant_id", "channels", "tenants", ["tenant_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_channels_tenant_id", "channels", type_="foreignkey")
    op.drop_index("ix_channels_tenant_id", table_name="channels")
    op.drop_column("channels", "tenant_id")

    op.drop_index("ix_oauth_provider_account", table_name="oauth_accounts")
    op.drop_index("ix_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")

    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_token_hash", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_table("tenants")
