"""Response schemas — shaped to map 1:1 onto frontend `window.ReliatData`.

Naming matches the JS structures consumed by `frontend/screens/*.jsx`.
Times are emitted as epoch milliseconds (the screens call `new Date(o.t)`).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ChannelOut(BaseModel):
    id: str
    name: str
    belt: str
    color: str
    baseF80: float
    baseTopsize: float
    online: bool
    shift: str


class SeriesPoint(BaseModel):
    t: int  # epoch ms
    v: float
    outlier: dict | None = None  # {"sev": "critical|warn|info", "deviation": float}
    color: str  # hsl() string


class PsdPercentile(BaseModel):
    name: str
    x: float  # percentile (10, 20, …, 90)
    y: float  # particle size mm at that percentile


class PsdSieve(BaseModel):
    size: float
    passing: float


class PsdSnapshot(BaseModel):
    pcts: list[PsdPercentile]
    sieves: list[PsdSieve]


class OutlierOut(BaseModel):
    id: str
    channelId: str
    channelName: str
    t: int
    metric: str
    unit: str
    value: float
    baseline: float
    deviation: float
    sev: Literal["critical", "warn", "info"]
    type: str
    confidence: float
    status: Literal["open", "acknowledged", "resolved", "dismissed"]
    assignee: str | None = None
    summary: str
    action: str
    indexInSeries: int = Field(
        description="Index in the channel's series array for the current window."
    )


class OutlierPatch(BaseModel):
    status: Literal["open", "acknowledged", "resolved", "dismissed"] | None = None
    assignee: str | None = None


# --- auth -------------------------------------------------------------------


class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    name: str | None = None
    avatar_url: str | None = None
    provider: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AuthProvidersOut(BaseModel):
    google: bool
    github: bool
    password: bool = True
