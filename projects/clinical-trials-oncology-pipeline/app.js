(function () {
  "use strict";

  const COLORS = ["#df725b", "#8da995", "#436e68", "#c9ad7d", "#8b9eb5", "#b77d72", "#6f8c75", "#b6a4c2", "#d0c8a6"];
  const INK = "#103d3a";
  const MUTED = "#60716b";
  const GRID = "rgba(16,61,58,.12)";
  const numberFormat = new Intl.NumberFormat("en-GB");
  const state = { all: [], filtered: [], charts: {}, visibleRows: 25 };
  const byId = (id) => document.getElementById(id);
  const setText = (id, value) => { const node = byId(id); if (node) node.textContent = value; };

  function displayDate(value, options) {
    if (!value) return "Not reported";
    const parsed = new Date(value.length === 4 ? value + "-01-01" : value);
    return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", options || { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
  }

  function uniqueValues(key) {
    return [...new Set(state.all.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "en"));
  }

  function fillSelect(id, values, label) {
    const select = byId(id);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.setAttribute("aria-label", label);
  }

  function allCountries() {
    return [...new Set(state.all.flatMap((row) => Array.isArray(row.countries) ? row.countries : []))].sort((a, b) => a.localeCompare(b, "en"));
  }

  function configureFilters() {
    fillSelect("status-filter", uniqueValues("overall_status"), "Filter by study status");
    fillSelect("phase-filter", uniqueValues("phase"), "Filter by study phase");
    fillSelect("country-filter", allCountries(), "Filter by country");
    ["status-filter", "phase-filter", "country-filter", "search-filter"].forEach((id) => {
      byId(id).addEventListener("input", () => {
        state.visibleRows = 25;
        applyFilters();
      });
    });
    byId("show-more").addEventListener("click", () => {
      state.visibleRows += 25;
      renderTable();
    });
  }

  function matchesSearch(row, query) {
    if (!query) return true;
    const searchable = [
      row.nct_id, row.brief_title, row.sponsor_name, row.overall_status,
      row.phase, row.study_type, ...(row.conditions || []), ...(row.countries || []),
      ...(row.interventions || []).map((item) => item.name)
    ].join(" ").toLocaleLowerCase("en");
    return searchable.includes(query);
  }

  function applyFilters() {
    const status = byId("status-filter").value;
    const phase = byId("phase-filter").value;
    const country = byId("country-filter").value;
    const search = byId("search-filter").value.trim().toLocaleLowerCase("en");
    state.filtered = state.all.filter((row) =>
      (status === "all" || row.overall_status === status) &&
      (phase === "all" || row.phase === phase) &&
      (country === "all" || (row.countries || []).includes(country)) &&
      matchesSearch(row, search)
    );
    state.visibleRows = Math.min(state.visibleRows, Math.max(state.filtered.length, 25));
    renderKpis();
    renderCharts();
    renderTable();
  }

  function renderKpis() {
    const records = state.filtered;
    const countries = new Set(records.flatMap((row) => row.countries || []));
    const recruiting = records.filter((row) => row.overall_status === "RECRUITING").length;
    const imaging = records.filter((row) => row.is_imaging_related).length;
    setText("kpi-studies", numberFormat.format(records.length));
    setText("kpi-recruiting", numberFormat.format(recruiting));
    setText("kpi-countries", numberFormat.format(countries.size));
    setText("kpi-imaging", numberFormat.format(imaging));
    setText("filter-status", "Showing " + numberFormat.format(records.length) + " of " + numberFormat.format(state.all.length) + " studies in this snapshot");
  }

  function aggregate(records, valueOf) {
    const counts = new Map();
    records.forEach((row) => {
      const value = valueOf(row);
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "en"));
  }

  function topGroups(entries, limit, otherLabel) {
    const top = entries.slice(0, limit);
    const remaining = entries.slice(limit).reduce((total, entry) => total + entry[1], 0);
    if (remaining) top.push([otherLabel, remaining]);
    return top;
  }

  function chartOptions({ horizontal = false, legend = false, maxTicks = 10 } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      plugins: {
        legend: { display: legend, position: "bottom", labels: { color: MUTED, boxWidth: 9, padding: 13, font: { size: 10 } } },
        tooltip: { backgroundColor: INK, padding: 10, titleFont: { weight: "700" }, bodyFont: { size: 11 } }
      },
      scales: {
        x: { grid: { display: horizontal ? false : true, color: GRID }, ticks: { color: MUTED, maxTicksLimit: maxTicks, font: { size: 10 } }, border: { display: false } },
        y: { grid: { display: horizontal ? true : false, color: GRID }, ticks: { color: MUTED, maxTicksLimit: maxTicks, font: { size: 10 } }, border: { display: false } }
      }
    };
  }

  function createChart(id, type, data, options) {
    if (!window.Chart) return null;
    return new Chart(byId(id), { type, data, options });
  }

  function setChart(id, chart, labels, values, colorSet = COLORS) {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = labels.map((_, index) => colorSet[index % colorSet.length]);
    chart.data.datasets[0].borderColor = "#fbf8ef";
    chart.update();
  }

  function initializeCharts() {
    state.charts.status = createChart("status-chart", "doughnut", {
      labels: [], datasets: [{ data: [], backgroundColor: COLORS, borderColor: "#fbf8ef", borderWidth: 3, hoverOffset: 5 }]
    }, { ...chartOptions({ legend: true }), cutout: "65%" });
    state.charts.phase = createChart("phase-chart", "bar", {
      labels: [], datasets: [{ data: [], backgroundColor: COLORS[1], borderRadius: 3, barThickness: 16 }]
    }, chartOptions({ horizontal: true }));
    state.charts.country = createChart("country-chart", "bar", {
      labels: [], datasets: [{ data: [], backgroundColor: COLORS[2], borderRadius: 3, barThickness: 12 }]
    }, chartOptions({ horizontal: true }));
    state.charts.year = createChart("year-chart", "bar", {
      labels: [], datasets: [{ data: [], backgroundColor: COLORS[0], borderRadius: 3, maxBarThickness: 34 }]
    }, chartOptions());
  }

  function renderCharts() {
    const records = state.filtered;
    const statuses = topGroups(aggregate(records, (row) => row.overall_status), 8, "Other statuses");
    const phases = topGroups(aggregate(records, (row) => row.phase), 11, "Other phases").reverse();
    const countries = topGroups(aggregate(records.flatMap((row) => (row.countries || []).map((country) => ({ country }))), (row) => row.country), 11, "Other countries").reverse();
    const years = aggregate(records, (row) => row.study_first_post_date ? String(row.study_first_post_date).slice(0, 4) : null).sort((a, b) => a[0].localeCompare(b[0]));
    setChart("status-chart", state.charts.status, statuses.map((item) => item[0]), statuses.map((item) => item[1]));
    setChart("phase-chart", state.charts.phase, phases.map((item) => item[0]), phases.map((item) => item[1]), [COLORS[1]]);
    setChart("country-chart", state.charts.country, countries.map((item) => item[0]), countries.map((item) => item[1]), [COLORS[2]]);
    setChart("year-chart", state.charts.year, years.map((item) => item[0]), years.map((item) => item[1]), [COLORS[0]]);
  }

  function appendCell(row, text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text || "Not reported";
    row.appendChild(cell);
    return cell;
  }

  function renderTable() {
    const body = byId("study-rows");
    body.replaceChildren();
    const sorted = [...state.filtered].sort((a, b) => String(b.last_update_date || "").localeCompare(String(a.last_update_date || "")) || a.nct_id.localeCompare(b.nct_id));
    const shown = sorted.slice(0, state.visibleRows);
    if (!shown.length) {
      const row = document.createElement("tr");
      const cell = appendCell(row, "No studies match these filters.", "empty-row");
      cell.colSpan = 7;
      body.appendChild(row);
    }
    shown.forEach((trial) => {
      const row = document.createElement("tr");
      const studyCell = document.createElement("td");
      const link = document.createElement("a");
      link.className = "study-link";
      link.href = "https://clinicaltrials.gov/study/" + encodeURIComponent(trial.nct_id);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = trial.brief_title || "Untitled study";
      const id = document.createElement("span");
      id.className = "study-id";
      id.textContent = trial.nct_id;
      studyCell.append(link, id);
      row.appendChild(studyCell);

      const statusCell = appendCell(row, trial.overall_status || "Not reported");
      const statusPill = document.createElement("span");
      statusPill.className = "status-pill" + (trial.overall_status === "RECRUITING" ? " recruiting" : "");
      statusPill.textContent = statusCell.textContent;
      statusCell.replaceChildren(statusPill);

      appendCell(row, trial.phase || "Not reported");
      appendCell(row, trial.sponsor_name || "Not reported");
      appendCell(row, (trial.countries || []).slice(0, 3).join(", ") + ((trial.countries || []).length > 3 ? " +" + (trial.countries.length - 3) : "") || "Not reported");
      appendCell(row, displayDate(trial.last_update_date));
      const signalsCell = document.createElement("td");
      if (trial.is_imaging_related && (trial.imaging_signals || []).length) {
        trial.imaging_signals.forEach((signal) => {
          const pill = document.createElement("span");
          pill.className = "signal-pill";
          pill.textContent = signal;
          signalsCell.appendChild(pill);
        });
      } else {
        signalsCell.textContent = "—";
      }
      row.appendChild(signalsCell);
      body.appendChild(row);
    });
    byId("show-more").hidden = shown.length >= sorted.length;
    setText("result-count", "Showing " + numberFormat.format(shown.length) + " of " + numberFormat.format(sorted.length) + " studies");
    setText("table-status", numberFormat.format(sorted.length) + " records match the current selection");
  }

  function initializeMetadata(payload) {
    const metadata = payload.metadata || {};
    setText("snapshot-count", numberFormat.format(metadata.study_count || state.all.length));
    setText("generated-at", displayDate(metadata.generated_at, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }));
    const latest = metadata.source_last_update || state.all.map((row) => row.last_update_date).filter(Boolean).sort().at(-1);
    setText("latest-update", displayDate(latest, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }));
    setText("query-label", metadata.query || "Condition: lymphoma");
    const cap = metadata.api_total_count && metadata.api_total_count > state.all.length;
    setText("scope-label", cap ? numberFormat.format(state.all.length) + " of " + numberFormat.format(metadata.api_total_count) + " matches" : "Current public-record snapshot");
  }

  async function start() {
    try {
      const response = await fetch("data/dashboard.json", { cache: "no-store" });
      if (!response.ok) throw new Error("The dashboard data file could not be loaded (HTTP " + response.status + ").");
      const payload = await response.json();
      if (!Array.isArray(payload.studies)) throw new Error("The dashboard snapshot has no studies array.");
      state.all = payload.studies;
      state.filtered = state.all;
      initializeMetadata(payload);
      configureFilters();
      if (!window.Chart) throw new Error("The local chart library could not be loaded.");
      Chart.defaults.color = MUTED;
      Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
      Chart.defaults.font.size = 10;
      initializeCharts();
      applyFilters();
    } catch (error) {
      const message = document.createElement("p");
      message.className = "load-error";
      message.setAttribute("role", "alert");
      message.textContent = error.message + " Open this page from the portfolio site or run a local web server to preview it.";
      byId("dashboard").prepend(message);
      setText("filter-status", "Dashboard data could not be loaded.");
      setText("table-status", "Snapshot unavailable");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
