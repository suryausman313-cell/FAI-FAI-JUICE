import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")

    if phone.startswith("00"):
        phone = f"+{phone[2:]}"

    if not phone.startswith("+"):
        phone = f"+{phone}"

    return phone


class CustomerSignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str
    pin: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least 2 characters")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        value = normalize_phone(value)

        if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
            raise ValueError(
                "Enter a valid phone number with country code, for example +971501234567"
            )

        return value

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}", value):
            raise ValueError("PIN must contain exactly 4 digits")

        return value


class CustomerLoginRequest(BaseModel):
    phone: str
    pin: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        value = normalize_phone(value)

        if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
            raise ValueError("Enter a valid phone number with country code")

        return value

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}", value):
            raise ValueError("PIN must contain exactly 4 digits")

        return value


class CustomerChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str

    @field_validator("old_pin", "new_pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}", value):
            raise ValueError("PIN must contain exactly 4 digits")

        return value


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None


class CustomerAuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    customer: CustomerResponse
