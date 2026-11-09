"""Pruebas con Home Assistant: flujo de configuración y sensores."""

import json
from pathlib import Path

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryState
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.efe_valparaiso.api import build_url
from custom_components.efe_valparaiso.const import CONF_SCAN_INTERVAL, DOMAIN

FIXTURES = Path(__file__).parent / "fixtures"
URL = build_url(18, 1)


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


async def test_config_flow_creates_entry(hass, aioclient_mock):
    aioclient_mock.get(URL, json=fixture("con_servicios.json"))
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"origen": "18", "destino": "1"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Villa Alemana → Puerto"
    assert result["data"] == {"origen": 18, "destino": 1}
    assert result["result"].unique_id == "18-1"


async def test_config_flow_rejects_same_station(hass):
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"origen": "5", "destino": "5"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "same_station"}


async def test_config_flow_cannot_connect(hass, aioclient_mock):
    aioclient_mock.get(URL, status=500)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"origen": "18", "destino": "1"}
    )
    assert result["errors"] == {"base": "cannot_connect"}


async def setup_entry(hass, **options):
    entry = MockConfigEntry(
        domain=DOMAIN, unique_id="18-1", data={"origen": 18, "destino": 1}, options=options
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def states(hass):
    return {s.entity_id: s for s in hass.states.async_all("sensor")}


async def test_sensors_with_services(hass, aioclient_mock):
    aioclient_mock.get(URL, json=fixture("con_servicios.json"))
    entry = await setup_entry(hass)
    assert entry.state is ConfigEntryState.LOADED
    s = states(hass)
    nxt = s["sensor.efe_villa_alemana_puerto_next_train"]
    assert nxt.state == "10 minutos"
    assert nxt.attributes["hasta"] == "Hasta Puerto"
    assert nxt.attributes["minutos"] == 10
    assert nxt.attributes["tiempo_real_confirmado"] is False
    assert nxt.attributes["estado_consulta"] == "servicios_informados"
    assert nxt.attributes["aviso_efe"] == "Servicio no disponible por el momento"
    assert len(nxt.attributes["servicios"]) == 3
    assert s["sensor.efe_villa_alemana_puerto_reported_services"].state == "3"


async def test_empty_list_is_distinct_from_failure(hass, aioclient_mock):
    aioclient_mock.get(URL, json=fixture("sin_servicios.json"))
    await setup_entry(hass)
    s = states(hass)
    assert s["sensor.efe_villa_alemana_puerto_next_train"].state == "Sin servicios informados"
    assert (
        s["sensor.efe_villa_alemana_puerto_next_train"].attributes["estado_consulta"]
        == "sin_servicios_informados"
    )
    assert s["sensor.efe_villa_alemana_puerto_reported_services"].state == "0"


async def test_source_down_retries_setup(hass, aioclient_mock):
    aioclient_mock.get(URL, status=502)
    entry = await setup_entry(hass)
    assert entry.state is ConfigEntryState.SETUP_RETRY


async def test_failure_after_setup_makes_unavailable(hass, aioclient_mock):
    aioclient_mock.get(URL, json=fixture("con_servicios.json"))
    entry = await setup_entry(hass)
    aioclient_mock.clear_requests()
    aioclient_mock.get(URL, json={"status": "OK"})  # formato cambiado
    await entry.runtime_data.async_refresh()
    await hass.async_block_till_done()
    s = states(hass)
    assert s["sensor.efe_villa_alemana_puerto_next_train"].state == "unavailable"
    assert s["sensor.efe_villa_alemana_puerto_reported_services"].state == "unavailable"


async def test_options_flow_sets_interval(hass, aioclient_mock):
    aioclient_mock.get(URL, json=fixture("con_servicios.json"))
    entry = await setup_entry(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_SCAN_INTERVAL: 120}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.runtime_data.update_interval.total_seconds() == 120
