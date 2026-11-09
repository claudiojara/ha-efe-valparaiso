"""Cliente de la API de próximos trenes de EFE Valparaíso.

Sin dependencias de Home Assistant para poder probarlo por separado.
"""

from __future__ import annotations

import json
import re
import ssl
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import aiohttp

from .const import API_URL, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT

# EFE entrega solo el certificado de hoja. Se añade el intermedio público de
# GlobalSign para construir la cadena hasta las raíces de confianza. La
# verificación de cadena, vigencia y nombre sigue activa.
INTERMEDIATE_CERT = Path(__file__).parent / "certs" / "globalsign-r46-alphassl-2025.pem"

HEADERS = {"Accept": "application/json", "User-Agent": "HomeAssistant-efe_valparaiso"}

_MINUTES_RE = re.compile(r"^\s*(\d{1,3})\s+minutos?\s*$", re.IGNORECASE)

STATE_SERVICES = "servicios_informados"
STATE_NO_SERVICES = "sin_servicios_informados"

NOTICE = (
    "Respuesta de la API que usa la app EFE. Una lista vacía no garantiza "
    "que no haya trenes. No está confirmado que los tiempos sean en tiempo real."
)


class EfeApiError(Exception):
    """No se pudo obtener o interpretar una respuesta válida de EFE."""


def create_ssl_context() -> ssl.SSLContext:
    """Contexto TLS con verificación completa. Bloqueante: usar en un executor."""
    try:
        import certifi  # incluido en Home Assistant

        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()
    context.load_verify_locations(cafile=str(INTERMEDIATE_CERT))
    return context


def build_url(origin: int, destination: int) -> str:
    arg = json.dumps({"idOrigen": origin, "idDestino": destination}, separators=(",", ":"))
    return f"{API_URL}?{urlencode({'arg': arg})}"


def parse_minutes(tiempo: Any) -> int | None:
    """«6 minutos» → 6. Cualquier otro texto («cercano») → None, sin inventar."""
    if not isinstance(tiempo, str):
        return None
    match = _MINUTES_RE.match(tiempo)
    return int(match.group(1)) if match else None


@dataclass(frozen=True)
class Departures:
    """Respuesta validada de EFE para un par origen/destino."""

    services: list[dict[str, Any]]
    message: dict[str, Any]
    url: str
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def state(self) -> str:
        return STATE_SERVICES if self.services else STATE_NO_SERVICES

    @property
    def warning(self) -> str | None:
        state = self.message.get("serviceState")
        if isinstance(state, dict):
            value = state.get("warningMessage")
            return value if isinstance(value, str) else None
        return None

    @property
    def operability(self) -> dict[str, Any] | None:
        value = self.message.get("operability")
        return value if isinstance(value, dict) else None


def parse_response(data: Any, url: str) -> Departures:
    """Valida la respuesta. Un cambio de formato es un error, no una lista vacía."""
    if not isinstance(data, dict) or data.get("status") != "OK":
        raise EfeApiError("EFE devolvió un estado de error")
    obj = data.get("object")
    if not isinstance(obj, dict) or not isinstance(obj.get("servicios"), list):
        raise EfeApiError("El formato de respuesta de EFE cambió")
    message = data.get("message")
    if not isinstance(message, dict):
        raise EfeApiError("La respuesta de EFE no incluye su estado de servicio")
    services = []
    for item in obj["servicios"]:
        if not isinstance(item, dict):
            raise EfeApiError("El formato de los servicios de EFE cambió")
        # Se conservan los campos tal como llegan; «minutos» solo se agrega si
        # el texto es explícitamente «N minutos».
        services.append({**item, "minutos": parse_minutes(item.get("tiempo"))})
    extra = {"estado": obj.get("estado")} if "estado" in obj else {}
    return Departures(services=services, message=message, url=url, extra=extra)


async def fetch_departures(
    session: aiohttp.ClientSession,
    ssl_context: ssl.SSLContext,
    origin: int,
    destination: int,
) -> Departures:
    url = build_url(origin, destination)
    try:
        async with session.get(
            url,
            headers=HEADERS,
            ssl=ssl_context,
            allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
        ) as resp:
            resp.raise_for_status()
            body = await resp.content.read(MAX_RESPONSE_BYTES + 1)
    except aiohttp.ClientResponseError as err:
        raise EfeApiError(f"EFE respondió HTTP {err.status}") from err
    except (aiohttp.ClientError, TimeoutError) as err:
        raise EfeApiError(f"No fue posible conectar con EFE: {type(err).__name__}") from err
    if len(body) > MAX_RESPONSE_BYTES:
        raise EfeApiError("La respuesta de EFE excede el tamaño admitido")
    try:
        data = json.loads(body)
    except ValueError as err:
        raise EfeApiError("EFE no devolvió JSON válido") from err
    return parse_response(data, url)
