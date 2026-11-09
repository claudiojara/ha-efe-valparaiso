/*
 * custom:efe-valparaiso-card — próximos trenes EFE Valparaíso (Limache–Puerto).
 * Sin dependencias. La sirve la integración efe_valparaiso.
 *
 * type: custom:efe-valparaiso-card
 * titulo: Trabajo                      # opcional
 * modo: input_boolean.mi_helper        # opcional: encendido = automático
 * trayectos:                           # 1 o 2 (o más, en filas de dos)
 *   - entity: sensor.efe_la_concepcion_francia_proximo_tren
 *   - entity: sensor.efe_francia_la_concepcion_proximo_tren
 */
const CARD_VERSION = "0.2.0";
const STALE_MINUTES = 2;

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  train:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14"/><path d="M8 16l-1 4h10l-1-4"/></svg>',
  auto:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  hand:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/></svg>',
  back:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  simple:
    '<svg class="unit" width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/></svg>',
  doble:
    '<svg class="unit" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/><rect x="14.5" y="0.5" width="11" height="9" rx="2.5" fill="none" stroke="currentColor"/><path d="M12 5h2.5" stroke="currentColor"/></svg>',
};

const STYLE = `
  :host { display: block; }
  ha-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--primary-text-color); min-width: 0; }
  .title svg { width: 18px; height: 18px; flex: none; color: var(--efe-accent); }
  .actions { display: flex; gap: 6px; }
  button { font: inherit; color: inherit; cursor: pointer; }
  .btn { height: 36px; min-width: 36px; display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: 12px; border: 1px solid var(--divider-color, rgba(127,127,127,.25));
    background: rgba(127,127,127,.08); padding: 0 10px; font-size: 12px; font-weight: 500; }
  .btn svg { width: 15px; height: 15px; }
  .btn.mode-auto { color: var(--efe-accent); }
  .btn.refresh { color: var(--efe-info); border-color: color-mix(in srgb, var(--efe-info) 45%, transparent);
    background: color-mix(in srgb, var(--efe-info) 15%, transparent); padding: 0; }
  .btn.refresh.busy svg { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .grid { display: grid; gap: 10px; }
  .tile { text-align: left; border: 0; border-radius: 16px; background: rgba(127,127,127,.08);
    padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .row1 { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .label { font-size: 13px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .type { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--primary-text-color); white-space: nowrap; }
  .big { display: flex; align-items: baseline; gap: 4px; color: var(--primary-text-color); min-height: 40px; }
  .big .n { font-size: 38px; font-weight: 700; letter-spacing: -1px; line-height: 1; }
  .big .u { font-size: 15px; font-weight: 600; }
  .big .w { font-size: 22px; font-weight: 700; line-height: 1.2; }
  .big .h { margin-left: 6px; font-size: 13px; color: var(--secondary-text-color); }
  .stale .big, .stale .rest .m { color: var(--secondary-text-color); }
  .sep { height: 1px; background: var(--divider-color, rgba(127,127,127,.2)); margin: 2px 0; }
  .rest { display: grid; grid-template-columns: auto auto minmax(0, 1fr); column-gap: 8px; row-gap: 3px; align-items: center; font-size: 12px; }
  .rest .m { font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .rest .h { color: var(--secondary-text-color); white-space: nowrap; }
  .rest .t { display: flex; align-items: center; gap: 4px; color: var(--secondary-text-color); min-width: 0; flex-wrap: wrap; }
  .badge { font-size: 10.5px; font-weight: 600; color: #1a1205; background: var(--efe-warn); border-radius: 6px; padding: 1px 6px;
    white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 12px; color: var(--secondary-text-color); line-height: 1.35; }
  .warn { color: var(--efe-warn); }
  .detail { display: flex; flex-direction: column; gap: 6px; }
  .detail .top { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
  .detail .top .btn { padding: 0; width: 32px; height: 32px; }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center;
    padding: 6px 10px; border-radius: 10px; background: rgba(127,127,127,.08); font-size: 13px; }
  .line .t { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--secondary-text-color); }
  .line .m { font-weight: 600; text-align: right; }
  .line .h { color: var(--secondary-text-color); text-align: right; }
  .line.no { opacity: .75; }
  .foot { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--secondary-text-color); }
`;

class EfeValparaisoCard extends HTMLElement {
  static getStubConfig(hass) {
    const sensors = Object.keys(hass?.states ?? {}).filter(
      (id) => id.startsWith("sensor.efe_") && hass.states[id].attributes?.estado_consulta !== undefined,
    );
    return { trayectos: sensors.slice(0, 2).map((entity) => ({ entity })) };
  }

  setConfig(config) {
    const trayectos = config?.trayectos;
    if (!Array.isArray(trayectos) || trayectos.length === 0 || trayectos.some((t) => !t?.entity)) {
      throw new Error("Indica `trayectos`: una lista con `entity` (sensor «Próximo tren» de EFE Valparaíso).");
    }
    this._config = config;
    this._open = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const sig = this._signature();
    if (sig !== this._sig) {
      if (this._busy && this._busySig !== undefined && sig !== this._busySig) this._busy = false;
      this._sig = sig;
      this._render();
    }
  }

  connectedCallback() {
    this._timer = setInterval(() => this._render(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  _signature() {
    if (!this._hass || !this._config) return "";
    const ids = [...this._config.trayectos.map((t) => t.entity), this._config.modo].filter(Boolean);
    return ids.map((id) => {
      const s = this._hass.states[id];
      return s ? `${s.state}|${s.attributes.consultado_en ?? ""}|${s.last_updated}` : "-";
    }).join("~");
  }

  _entities() {
    return this._config.trayectos.map((t) => t.entity);
  }

  _onClick(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el || !this._hass) return;
    const action = el.dataset.action;
    if (action === "mode" && this._config.modo) {
      this._hass.callService("input_boolean", "toggle", { entity_id: this._config.modo });
    } else if (action === "refresh") {
      this._busy = true;
      this._busySig = this._signature();
      this._render();
      this._hass.callService("homeassistant", "update_entity", { entity_id: this._entities() });
      setTimeout(() => { this._busy = false; this._render(); }, 15000);
    } else if (action === "open") {
      this._open = Number(el.dataset.index);
      this._render();
    } else if (action === "close") {
      this._open = null;
      this._render();
    }
  }

  _trayecto(cfg) {
    const st = this._hass?.states?.[cfg.entity];
    const a = st?.attributes ?? {};
    const origen = a.origen ?? "";
    const destino = a.destino ?? "";
    // Sin atributos (sensor no disponible): el nombre del dispositivo, «EFE A → B <entidad>».
    const fallback = !origen && typeof a.friendly_name === "string"
      ? a.friendly_name.replace(/^EFE\s+/, "").replace(/\s+(Próximo tren|Next train)$/i, "")
      : undefined;
    const out = { cfg, origen, destino, nombre: cfg.nombre ?? fallback, status: "ok", age: null, services: [] };
    if (!st || st.state === "unavailable" || st.state === "unknown" || !Array.isArray(a.servicios)) {
      out.status = "error";
      return out;
    }
    if (a.consultado_en) {
      out.age = Math.max(0, Math.floor((Date.now() - Date.parse(a.consultado_en)) / 60000));
    }
    out.services = a.servicios.map((s) => ({
      tiempo: s.tiempo,
      min: Number.isInteger(s.minutos) ? s.minutos : null,
      hora: typeof s.hora_estimada === "string" ? s.hora_estimada.slice(11, 16) : null,
      tipo: s.tipo,
      doble: String(s.tipo).toLowerCase() === "doble",
      final: s.estacion_final || String(s.hasta ?? "").replace(/^hasta\s+/i, ""),
      llega: s.llega_a_destino,
    }));
    if (out.services.length === 0) out.status = "empty";
    return out;
  }

  _unit(s) {
    if (!s.tipo) return "";
    return `${s.doble ? ICONS.doble : ICONS.simple}${esc(s.tipo)}`;
  }

  _when(s) {
    return s.min !== null ? `${s.min} min` : esc(s.tiempo);
  }

  _noLlega(s, t) {
    return s.llega === false ? `<span class="badge" title="Termina en ${esc(s.final)}: no llega a ${esc(t.destino)}">${esc(s.final)}</span>` : "";
  }

  _tile(t, index, sharedOrigin) {
    const label = esc(t.nombre ?? (sharedOrigin ? `→ ${t.destino}` : `${t.origen} → ${t.destino}`));
    const stale = t.age !== null && t.age >= STALE_MINUTES;
    if (t.status === "error") {
      return `<div class="tile"><span class="label">${label}</span>
        <div class="big"><span class="w">Sin datos</span></div>
        <span class="note">No se pudo consultar a EFE. No se muestran tiempos antiguos.</span></div>`;
    }
    if (t.status === "empty") {
      return `<div class="tile"><span class="label">${label}</span>
        <div class="big warn"><span class="w">Sin trenes informados</span></div>
        <span class="note">EFE respondió sin trenes. No garantiza que no los haya.</span></div>`;
    }
    const mainIdx = t.services.findIndex((s) => s.llega !== false);
    const main = mainIdx >= 0 ? t.services[mainIdx] : null;
    const rest = t.services.filter((_, i) => i !== mainIdx).slice(0, 3);
    const big = !main
      ? `<span class="w warn">Ninguno llega a ${esc(t.destino)}</span>`
      : main.min !== null
        ? `<span class="n">${main.min}</span><span class="u">min</span>${main.hora ? `<span class="h">≈ ${esc(main.hora)}</span>` : ""}`
        : `<span class="w">${esc(main.tiempo)}</span>`;
    const rows = rest.map((s) => `<span class="m">${this._when(s)}</span>
      <span class="h">${s.hora ? `≈ ${esc(s.hora)}` : ""}</span>
      <span class="t">${this._unit(s)}${this._noLlega(s, t)}</span>`).join("");
    return `<button class="tile${stale ? " stale" : ""}" data-action="open" data-index="${index}" aria-label="Ver todos los trenes ${label}">
      <div class="row1"><span class="label">${label}</span>${main ? `<span class="type">${this._unit(main)}</span>` : ""}</div>
      <div class="big">${big}</div>
      ${rows ? `<div class="sep"></div><div class="rest">${rows}</div>` : ""}
    </button>`;
  }

  _detail(t, sharedOrigin) {
    const label = esc(t.nombre ?? (sharedOrigin ? `→ ${t.destino}` : `${t.origen} → ${t.destino}`));
    const lines = t.services.length
      ? t.services.map((s) => `<div class="line${s.llega === false ? " no" : ""}">
          <span>${esc(s.final)}${s.llega === false ? ` <span class="badge">no llega a ${esc(t.destino)}</span>` : ""}</span>
          <span class="t">${this._unit(s)}</span>
          <span class="m">${this._when(s)}</span>
          <span class="h">${s.hora ? `≈ ${esc(s.hora)}` : ""}</span></div>`).join("")
      : `<span class="note">${t.status === "error" ? "Sin datos de EFE." : "EFE respondió sin trenes."}</span>`;
    return `<div class="detail"><div class="top">
      <button class="btn" data-action="close" aria-label="Volver">${ICONS.back}</button><span>${label}</span></div>${lines}</div>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const hass = this._hass;
    const trayectos = hass ? this._config.trayectos.map((c) => this._trayecto(c)) : [];
    const origins = new Set(trayectos.map((t) => t.origen).filter(Boolean));
    const sharedOrigin = origins.size === 1 && trayectos.every((t) => t.origen);
    const title = this._config.titulo ?? (sharedOrigin ? `Tren · ${[...origins][0]}` : "Tren");
    const modo = this._config.modo;
    const auto = modo ? hass?.states?.[modo]?.state === "on" : null;
    const manual = modo ? !auto : false;
    const showRefresh = manual || (!modo && this._config.actualizar === true);
    const ages = trayectos.map((t) => t.age).filter((x) => x !== null);
    const age = ages.length ? Math.max(...ages) : null;
    const allError = trayectos.length > 0 && trayectos.every((t) => t.status === "error");
    const freshness = allError ? "Sin datos de EFE" : age === null ? "" : age < STALE_MINUTES ? "Actualizado hace segundos" : `Dato de hace ${age} min`;
    const cols = Math.min(trayectos.length || 1, 2);
    const open = this._open !== null && trayectos[this._open] ? trayectos[this._open] : null;

    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card style="--efe-accent: var(--success-color, #4caf50); --efe-info: var(--info-color, #3b82f6); --efe-warn: var(--warning-color, #f2b84b);">
        <div class="head">
          <div class="title">${ICONS.train}<span>${esc(title)}</span></div>
          <div class="actions">
            ${showRefresh ? `<button class="btn refresh${this._busy ? " busy" : ""}" data-action="refresh" aria-label="Actualizar ahora">${ICONS.auto}</button>` : ""}
            ${modo ? `<button class="btn ${auto ? "mode-auto" : ""}" data-action="mode" aria-label="Cambiar modo de actualización">${auto ? ICONS.auto : ICONS.hand}<span>${auto ? "Auto" : "Manual"}</span></button>` : ""}
          </div>
        </div>
        ${open
          ? this._detail(open, sharedOrigin)
          : `<div class="grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));">${trayectos.map((t, i) => this._tile(t, i, sharedOrigin)).join("")}</div>`}
        <div class="foot"><span>${esc(freshness)}</span><span>≈ hora estimada · tiempos de EFE</span></div>
      </ha-card>`;
  }
}

if (!customElements.get("efe-valparaiso-card")) {
  customElements.define("efe-valparaiso-card", EfeValparaisoCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "efe-valparaiso-card",
    name: "EFE Valparaíso",
    description: "Próximos trenes de uno o dos trayectos (ida y vuelta), con modo automático/manual.",
    documentationURL: "https://github.com/claudiojara/ha-efe-valparaiso",
  });
  console.info(`%c EFE-VALPARAISO-CARD %c ${CARD_VERSION} `, "background:#2e7d32;color:#fff", "background:#ddd;color:#000");
}
