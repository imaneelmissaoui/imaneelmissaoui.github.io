(function () {
  "use strict";

  const COLORS = {
    ink: "#103d3a",
    sage: "#8da995",
    sagePale: "#dce5d5",
    coral: "#df725b",
    muted: "#60716b",
    line: "rgba(16, 61, 58, .14)"
  };
  const FEE_OPTIONS = {
    no_fee: {
      label: "Sector 1 / health centre",
      specialty: "share_population_communes_over_30km_no_fee",
      any: "share_population_communes_any_specialty_over_30km_no_fee",
      countIndex: 5
    },
    optam: {
      label: "Sector 1 + OPTAM",
      specialty: "share_population_communes_over_30km_optam",
      any: "share_population_communes_any_specialty_over_30km_optam",
      countIndex: 6
    },
    all_sectors: {
      label: "All conventional sectors",
      specialty: "share_population_communes_over_30km_all_sectors",
      any: "share_population_communes_any_specialty_over_30km_all_sectors",
      countIndex: 7
    }
  };

  const state = {
    data: null,
    communeRows: null,
    charts: {},
    region: "all",
    specialty: "Urologie",
    fee: "no_fee",
    search: "",
    visibleRows: 25
  };

  const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  const twoDecimals = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const percent = (value) => oneDecimal.format((Number(value) || 0) * 100) + "%";
  const text = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  function safeChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = COLORS.muted;
    Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = COLORS.ink;
    Chart.defaults.plugins.tooltip.padding = 11;
    Chart.defaults.plugins.tooltip.titleFont = { weight: "700" };
    Chart.defaults.plugins.tooltip.bodyFont = { weight: "500" };
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  function fillFilters() {
    const regionSelect = document.getElementById("region-filter");
    const specialtySelect = document.getElementById("specialty-filter");
    const regionRows = [...state.data.regions].sort((a, b) =>
      a.region_name.localeCompare(b.region_name, "en")
    );
    const specialtyRows = [...state.data.national_specialties].sort((a, b) =>
      a.specialty_name.localeCompare(b.specialty_name, "fr")
    );

    regionRows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.region_code;
      option.textContent = row.region_name;
      regionSelect.appendChild(option);
    });
    specialtySelect.replaceChildren();
    specialtyRows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.specialty_name;
      option.textContent = row.specialty_name;
      specialtySelect.appendChild(option);
    });
    specialtySelect.value = state.specialty;

    regionSelect.addEventListener("change", () => {
      state.region = regionSelect.value;
      state.visibleRows = 25;
      updateDashboard();
    });
    specialtySelect.addEventListener("change", () => {
      state.specialty = specialtySelect.value;
      updateDashboard();
    });
    document.getElementById("fee-filter").addEventListener("change", (event) => {
      state.fee = event.target.value;
      updateDashboard();
    });
    document.getElementById("commune-search").addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      state.visibleRows = 25;
      renderCommuneTable();
    });
    document.getElementById("show-more").addEventListener("click", () => {
      state.visibleRows += 25;
      renderCommuneTable();
    });
    document.getElementById("load-communes").addEventListener("click", loadCommunes);
  }

  function specialtyAggregate() {
    const specialty = state.specialty;
    const tier = FEE_OPTIONS[state.fee].specialty;
    if (state.region === "all") {
      return state.data.national_specialties.find((row) => row.specialty_name === specialty);
    }
    return state.data.region_specialties.find(
      (row) => row.region_code === state.region && row.specialty_name === specialty
    );
  }

  function currentArea() {
    if (state.region === "all") return state.data.national;
    return state.data.regions.find((row) => row.region_code === state.region);
  }

  function currentSpecialtyShare() {
    const record = specialtyAggregate();
    return record ? Number(record[FEE_OPTIONS[state.fee].specialty]) : null;
  }

  function updateDashboard() {
    if (!state.data) return;
    const area = currentArea();
    const specialtyRow = specialtyAggregate();
    const fee = FEE_OPTIONS[state.fee];
    const currentShare = currentSpecialtyShare();

    text("kpi-apl", twoDecimals.format(area.apl_gp_u65_weighted));
    text("kpi-distance-share", currentShare == null ? "—" : percent(currentShare));
    text(
      "kpi-distance-caption",
      specialtyRow
        ? "Population share in communes over 30 km from a " + fee.label.toLowerCase() + " site"
        : "No matched data for this selection"
    );
    text("kpi-any-specialty", percent(area[fee.any]));
    text("kpi-communes", numberFormat.format(area.commune_count));
    text("kpi-population", numberFormat.format(area.population_2022) + " residents in 2022");

    const regionName = state.region === "all" ? "all matched regions" : area.region_name;
    text(
      "filter-status",
      "Showing " + state.specialty + " · " + fee.label + " · " + regionName
    );
    renderCharts();
    if (state.communeRows) renderCommuneTable();
  }

  function selectedDepartmentRows() {
    return state.data.departments.filter(
      (row) => state.region === "all" || row.region_code === state.region
    );
  }

  function shareField(row) {
    if (!row) return null;
    return Number(row[FEE_OPTIONS[state.fee].specialty]);
  }

  function specialtyByDepartment() {
    const lookup = new Map();
    state.data.department_specialties.forEach((row) => {
      lookup.set(row.department_code + "|" + row.specialty_name, row);
    });
    return lookup;
  }

  function buildCharts() {
    if (!window.Chart) {
      text("filter-status", "Chart library could not be loaded.");
      return;
    }
    const scatterContext = document.getElementById("scatter-chart").getContext("2d");
    const rankContext = document.getElementById("rank-chart").getContext("2d");
    const tierContext = document.getElementById("tier-chart").getContext("2d");

    state.charts.scatter = new Chart(scatterContext, {
      type: "bubble",
      data: { datasets: [{ label: "Departments", data: [], backgroundColor: COLORS.sage, borderColor: COLORS.ink, borderWidth: 1 }] },
      options: {
        scales: {
          x: {
            title: { display: true, text: "Population-weighted GP APL (GPs aged ≤65)" },
            grid: { color: COLORS.line }
          },
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: "Population share over 30 km" },
            ticks: { callback: (value) => value + "%" },
            grid: { color: COLORS.line }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => (items[0] && items[0].raw.meta ? items[0].raw.meta.department_name : ""),
              label: (item) => {
                const point = item.raw;
                return [
                  "GP APL: " + twoDecimals.format(point.x),
                  "Over 30 km: " + oneDecimal.format(point.y) + "%",
                  "Population: " + numberFormat.format(point.meta.population_2022)
                ];
              }
            }
          }
        }
      }
    });

    state.charts.rank = new Chart(rankContext, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{ data: [], backgroundColor: COLORS.coral, borderRadius: 3, barThickness: 13 }]
      },
      options: {
        indexAxis: "y",
        scales: {
          x: {
            min: 0,
            max: 100,
            title: { display: true, text: "Population share over 30 km" },
            ticks: { callback: (value) => value + "%" },
            grid: { color: COLORS.line }
          },
          y: { grid: { display: false } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) => oneDecimal.format(item.raw) + "% of aligned population"
            }
          }
        }
      }
    });

    state.charts.tier = new Chart(tierContext, {
      type: "bar",
      data: {
        labels: ["Sector 1 / health centre", "Sector 1 + OPTAM", "All conventional sectors"],
        datasets: [{
          data: [],
          backgroundColor: [COLORS.coral, COLORS.sage, COLORS.ink],
          borderRadius: 3,
          barThickness: 24
        }]
      },
      options: {
        scales: {
          x: { min: 0, max: 100, ticks: { callback: (value) => value + "%" }, grid: { color: COLORS.line } },
          y: { grid: { display: false } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) => oneDecimal.format(item.raw) + "% of aligned population"
            }
          }
        }
      }
    });
  }

  function renderCharts() {
    if (!state.charts.scatter) return;
    const departments = selectedDepartmentRows();
    const specialtyLookup = specialtyByDepartment();
    const points = departments.map((department) => {
      const specialty = specialtyLookup.get(department.department_code + "|" + state.specialty);
      if (!specialty) return null;
      const share = shareField(specialty);
      return {
        x: Number(department.apl_gp_u65_weighted),
        y: share * 100,
        r: 4 + 12 * Math.sqrt(Number(department.population_2022) / 12000000),
        meta: department
      };
    }).filter(Boolean);
    state.charts.scatter.data.datasets[0].data = points;
    state.charts.scatter.data.datasets[0].backgroundColor = points.map((point) =>
      point.y >= 20 ? COLORS.coral : COLORS.sage
    );
    state.charts.scatter.update();

    const ranked = departments.map((department) => {
      const specialty = specialtyLookup.get(department.department_code + "|" + state.specialty);
      return specialty ? { name: department.department_name, share: shareField(specialty) * 100 } : null;
    }).filter(Boolean).sort((a, b) => b.share - a.share).slice(0, 10).reverse();
    state.charts.rank.data.labels = ranked.map((row) => row.name);
    state.charts.rank.data.datasets[0].data = ranked.map((row) => row.share);
    state.charts.rank.data.datasets[0].backgroundColor = ranked.map((_, i) =>
      i === ranked.length - 1 ? COLORS.coral : COLORS.sage
    );
    state.charts.rank.update();

    const specialty = specialtyAggregate();
    const fields = [
      "share_population_communes_over_30km_no_fee",
      "share_population_communes_over_30km_optam",
      "share_population_communes_over_30km_all_sectors"
    ];
    state.charts.tier.data.datasets[0].data = specialty
      ? fields.map((field) => Number(specialty[field]) * 100)
      : [0, 0, 0];
    state.charts.tier.update();
  }

  function normaliseSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function renderCommuneTable() {
    if (!state.communeRows) return;
    const departmentLookup = new Map(
      state.data.departments.map((row) => [row.department_code, row])
    );
    const query = normaliseSearch(state.search);
    const rows = state.communeRows.filter((row) => {
      const department = departmentLookup.get(String(row[2]));
      const inRegion = state.region === "all" || (department && department.region_code === state.region);
      if (!inRegion) return false;
      if (!query) return true;
      const haystack = normaliseSearch(String(row[0]) + " " + String(row[1]) + " " + (department ? department.department_name : ""));
      return haystack.includes(query);
    });

    const show = rows.slice(0, state.visibleRows);
    const body = document.getElementById("commune-rows");
    body.replaceChildren();
    if (show.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty-row";
      td.textContent = "No commune matches those filters.";
      tr.appendChild(td);
      body.appendChild(tr);
    } else {
      show.forEach((row) => {
        const department = departmentLookup.get(String(row[2]));
        const tr = document.createElement("tr");
        const cells = [
          { value: String(row[1]) + " · " + String(row[0]), className: "commune-name" },
          { value: department ? department.department_name : String(row[2]), className: "" },
          { value: numberFormat.format(Number(row[3])), className: "numeric" },
          { value: twoDecimals.format(Number(row[4])), className: "numeric apl-cell" },
          { value: numberFormat.format(Number(row[FEE_OPTIONS[state.fee].countIndex])), className: "numeric" },
          { value: row[8] ? "Check road link" : "Road-linked", className: row[8] ? "road-flag" : "" }
        ];
        cells.forEach((cell) => {
          const td = document.createElement("td");
          td.textContent = cell.value;
          if (cell.className) td.className = cell.className;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
    text("result-count", "Showing " + numberFormat.format(show.length) + " of " + numberFormat.format(rows.length) + " communes");
    text(
      "table-status",
      state.search ? "Search: " + state.search : "Sorted from lowest to highest GP APL."
    );
    const more = document.getElementById("show-more");
    more.hidden = rows.length <= state.visibleRows;
  }

  function loadCommunes() {
    if (state.communeRows) {
      document.getElementById("commune-search").focus();
      return;
    }
    const button = document.getElementById("load-communes");
    button.disabled = true;
    button.textContent = "Loading commune data…";
    text("table-status", "Loading the commune explorer data file…");
    fetch("data/commune-index.json")
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((payload) => {
        state.communeRows = payload.rows;
        const input = document.getElementById("commune-search");
        input.disabled = false;
        button.textContent = "Explorer ready";
        renderCommuneTable();
        input.focus();
      })
      .catch((error) => {
        button.disabled = false;
        button.textContent = "Try loading again";
        text("table-status", "The commune data could not be loaded (" + error.message + ").");
      });
  }

  function initialise(payload) {
    state.data = payload;
    safeChartDefaults();
    fillFilters();
    buildCharts();
    updateDashboard();
  }

  fetch("data/dashboard-data.json")
    .then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(initialise)
    .catch((error) => {
      text("filter-status", "Dashboard data could not be loaded (" + error.message + ").");
      text("kpi-apl", "—");
      text("kpi-distance-share", "—");
      text("kpi-any-specialty", "—");
      text("kpi-communes", "—");
    });
})();
