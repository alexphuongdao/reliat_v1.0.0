import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import Principal, ROLE_MEMBER
from app.models import Base, Channel, Tenant, User
from app.routes.channels import owned_channel


class TenantBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        now = datetime(2026, 1, 1)
        tenant_a = Tenant(id="tenant-a", slug="a", name="A", active=True, created_at=now)
        tenant_b = Tenant(id="tenant-b", slug="b", name="B", active=True, created_at=now)
        user = User(
            id="user-a", tenant_id="tenant-a", username="a", email="a@example.com",
            name="A", role=ROLE_MEMBER, active=True, created_at=now,
        )
        self.session.add_all([
            tenant_a,
            tenant_b,
            user,
            Channel(
                id="channel-a", tenant_id="tenant-a", name="A channel", belt="Primary",
                color="red", base_f80=1, base_topsize=1, online=True, shift="A",
            ),
            Channel(
                id="channel-b", tenant_id="tenant-b", name="B channel", belt="Primary",
                color="blue", base_f80=1, base_topsize=1, online=True, shift="A",
            ),
        ])
        self.session.commit()
        self.principal = Principal(user=user, tenant=tenant_a)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_owned_channel_returns_only_callers_tenant(self) -> None:
        self.assertEqual(owned_channel(self.session, "channel-a", self.principal).id, "channel-a")
        with self.assertRaises(HTTPException) as raised:
            owned_channel(self.session, "channel-b", self.principal)
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
