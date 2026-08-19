import hashlib
import hmac
import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.branches import Branches

PIN_ITERATIONS = 180_000


async def verify_branch_kitchen_pin(
    db: AsyncSession,
    supplied_pin: str,
    branch_id: Optional[int],
) -> Optional[int]:
    supplied = str(supplied_pin or "").strip()

    if branch_id is not None:
        branch = (
            await db.execute(
                select(Branches).where(
                    Branches.id == int(branch_id),
                    Branches.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not branch:
            raise HTTPException(status_code=404, detail="Kitchen branch not found or disabled")

        salt = str(branch.kitchen_pin_salt or "")
        expected_hash = str(branch.kitchen_pin_hash or "")
        if salt and expected_hash:
            try:
                calculated = hashlib.pbkdf2_hmac(
                    "sha256", supplied.encode("utf-8"), bytes.fromhex(salt), PIN_ITERATIONS
                ).hex()
            except Exception:
                calculated = ""
            if supplied and hmac.compare_digest(calculated, expected_hash):
                return int(branch.id)
            raise HTTPException(status_code=401, detail="Invalid Kitchen PIN for this branch")

        if not bool(branch.is_default):
            raise HTTPException(
                status_code=503,
                detail="Set a Kitchen PIN for this branch in Super Admin > Branches",
            )

    expected = os.getenv("KITCHEN_PIN", "").strip()
    if len(expected) < 4:
        raise HTTPException(status_code=503, detail="Set KITCHEN_PIN in Render Environment first")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Kitchen PIN")
    return int(branch_id) if branch_id is not None else None
