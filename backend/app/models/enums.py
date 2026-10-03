"""Enums shared across models — see spec §5 for the field-by-field source."""
from __future__ import annotations

import enum


class DeliveryCondition(str, enum.Enum):
    TURN_KEY = "turn_key"
    SHELL_AND_CORE = "shell_and_core"
    SHELL_AND_CORE_PLUS = "shell_and_core_plus"
    MIXED = "mixed"


class RentPriceType(str, enum.Enum):
    """§1 row 2: rent shows up as a fixed number, a "from" range, or plain TBD."""

    FIXED = "fixed"
    FROM = "from"
    ON_REQUEST = "on_request"
    TBD = "tbd"


class ServiceChargePriceType(str, enum.Enum):
    FIXED = "fixed"
    TBD = "tbd"


class PricingModel(str, enum.Enum):
    """Direct-lease space is priced per m² per year (the original 7-listing
    reference brochure, §1). Flexible/serviced-office inventory — the shape
    of the actual "Market Inventory" template this engine now also targets —
    is priced per desk per month instead. Comparison/QA logic branches on
    this field rather than assuming one pricing shape fits every listing.
    """

    PER_SQM_ANNUAL = "per_sqm_annual"
    PER_DESK_MONTHLY = "per_desk_monthly"


class ProposalStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    UNDER_REVIEW = "under_review"
    CLOSED = "closed"


class UserRole(str, enum.Enum):
    """§19"""

    ADMIN = "admin"
    BROKER = "broker"
    CONSULTANT = "consultant"
    VIEWER = "viewer"


class OutputFormat(str, enum.Enum):
    """§20"""

    PDF = "pdf"
    PPTX = "pptx"
    WORD = "word"
    EXCEL = "excel"
    JSON = "json"
    CSV = "csv"
    ONE_PAGER = "one_pager"
