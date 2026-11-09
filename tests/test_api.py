"""Pruebas del cliente sin Home Assistant en marcha."""

import json
import ssl
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from custom_components.efe_valparaiso import api

FIXTURES = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text())


def test_build_url():
    url = api.build_url(18, 1)
    parts = urlsplit(url)
    assert f"{parts.scheme}://{parts.netloc}/" == "https://ms4.metrovalparaiso.cl/"
    assert json.loads(parse_qs(parts.query)["arg"][0]) == {"idOrigen": 18, "idDestino": 1}


@pytest.mark.parametrize(
    ("text", "expected"),
    [("6 minutos", 6), ("1 minuto", 1), ("cercano", None), ("", None), (None, None), ("6 min", None)],
)
def test_parse_minutes(text, expected):
    assert api.parse_minutes(text) == expected


def test_parse_with_services_keeps_fields():
    data = load("con_servicios.json")
    result = api.parse_response(data, "u", 18, 1)
    assert result.state == api.STATE_SERVICES
    assert len(result.services) == len(data["object"]["servicios"])
    for raw, parsed in zip(data["object"]["servicios"], result.services):
        assert {k: parsed[k] for k in raw} == raw  # campos originales intactos
    assert result.services[0]["minutos"] == 10
    assert result.warning == "Servicio no disponible por el momento"
    assert result.operability["via1"] == "YES"


def test_parse_empty_list_is_not_an_error():
    result = api.parse_response(load("sin_servicios.json"), "u", 18, 1)
    assert result.services == []
    assert result.state == api.STATE_NO_SERVICES


@pytest.mark.parametrize(
    "data",
    [
        None,
        [],
        {"status": "ERROR"},
        {"status": "OK", "message": {}},
        {"status": "OK", "message": {}, "object": {}},
        {"status": "OK", "object": {"servicios": []}},
        {"status": "OK", "message": {}, "object": {"servicios": ["x"]}},
    ],
)
def test_parse_invalid_raises(data):
    with pytest.raises(api.EfeApiError):
        api.parse_response(data, "u", 18, 1)


def test_ssl_context_keeps_verification():
    ctx = api.create_ssl_context()
    assert ctx.verify_mode == ssl.CERT_REQUIRED
    assert ctx.check_hostname is True
    assert api.INTERMEDIATE_CERT.is_file()


@pytest.mark.parametrize(
    ("hasta", "expected"),
    [("Hasta Puerto", 1), ("Hasta Sargento Aldea", 19), ("hasta  viña del mar", 8), ("Hasta Peñablanca", 20),
     ("Puerto", 1), ("Hasta Marte", None), (None, None)],
)
def test_terminal_station(hasta, expected):
    assert api.terminal_station(hasta) == expected


@pytest.mark.parametrize(
    ("terminal", "origin", "destination", "expected"),
    [
        (19, 18, 21, False),  # Villa Alemana → Limache, tren hasta Sargento Aldea
        (21, 18, 21, True),
        (19, 3, 17, True),    # Francia → La Concepción: Sargento Aldea pasa por La Concepción
        (1, 17, 3, True),     # La Concepción → Francia, hasta Puerto
        (8, 17, 3, False),    # tren que terminara en Viña del Mar no llega a Francia
        (None, 18, 1, None),
    ],
)
def test_reaches_destination(terminal, origin, destination, expected):
    assert api.reaches_destination(terminal, origin, destination) is expected


def test_parse_adds_derived_fields_without_touching_originals():
    data = {
        "status": "OK",
        "message": {},
        "object": {"servicios": [
            {"hasta": "Hasta Sargento Aldea", "tipo": "simple", "tiempo": "8 minutos", "idServicio": "1"},
            {"hasta": "Hasta Limache", "tipo": "doble", "tiempo": "cercano", "idServicio": "2"},
        ]},
    }
    at = datetime(2026, 11, 9, 10, 33, 20, tzinfo=timezone.utc)
    first, second = api.parse_response(data, "u", 18, 21, at).services
    assert first["hasta"] == "Hasta Sargento Aldea" and first["tiempo"] == "8 minutos"
    assert first["estacion_final"] == "Sargento Aldea"
    assert first["llega_a_destino"] is False
    assert first["hora_estimada"] == "2026-11-09T10:41+00:00"
    assert second["llega_a_destino"] is True
    assert second["minutos"] is None and second["hora_estimada"] is None  # «cercano»: sin inventar hora


@pytest.mark.parametrize(
    ("value", "expected"),
    [(18, 18), ("18", 18), ("Villa Alemana", 18), ("viña del mar", 8), ("PEÑABLANCA", 20), (0, None), (22, None),
     ("Marte", None), (True, None), (None, None)],
)
def test_resolve_station(value, expected):
    assert api.resolve_station(value) == expected
