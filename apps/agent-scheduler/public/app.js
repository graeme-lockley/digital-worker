import {
  buildEventsQuery,
  DEFAULT_SCHEDULE_SORT,
  nextScheduleSort,
  sortScheduleEvents,
} from "./ui-helpers.js";

const API = "/api/v1";
const REFRESH_MS = 15_000;

const agentFilter = document.getElementById("agent-filter");
const scheduleStatusFilter = document.getElementById("schedule-status-filter");
const refreshBtn = document.getElementById("refresh-btn");
const statusLine = document.getElementById("status-line");
const schedulesTable = document.getElementById("schedules-table");

let autoRefreshTimer;
let cachedScheduleEvents = [];
/** @type {import("./ui-helpers.js").ScheduleSortState} */
let scheduleSort = { ...DEFAULT_SCHEDULE_SORT };
let scheduleSortBound = false;

function parseHash() {
  const hash = location.hash.replace(/^#/, "").trim();
  if (!hash || hash === "schedules") return { view: "schedules" };
  if (hash === "runs") return { view: "runs" };
  if (hash.startsWith("run/")) return { view: "run-detail", id: hash.slice(4) };
  if (hash.startsWith("event/")) return { view: "event-detail", id: hash.slice(6) };
  return { view: "schedules" };
}

function fmt(ms) {
  if (!ms) return "—";
  return new Date(ms).toISOString();
}

function excerpt(text, max = 120) {
  const trimmed = (text || "").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

function duration(startedAt, finishedAt) {
  if (!finishedAt) return "running";
  const seconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function scheduleLabel(event) {
  return event.cron ? `cron ${event.cron} (${event.timezone})` : `one-shot ${fmt(event.fireAt)}`;
}

function statusClass(status) {
  return `status-${status}`;
}

const DELIVERY_HINT_LABELS = {
  internal: "Internal",
  "agent-likely": "Agent sent",
  "scheduler-fallback": "Scheduler sent",
  "not-detected": "Not detected",
  "n/a": "—",
};

function deliveryHintLabel(hint) {
  return DELIVERY_HINT_LABELS[hint] ?? hint ?? "—";
}

function deliveryHintClass(hint) {
  if (hint === "agent-likely" || hint === "scheduler-fallback") {
    return "delivery-ok";
  }
  if (hint === "not-detected") {
    return "delivery-warn";
  }
  return "delivery-neutral";
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function showView(name) {
  for (const section of document.querySelectorAll(".view")) {
    section.classList.add("hidden");
  }
  document.getElementById(`view-${name}`)?.classList.remove("hidden");

  for (const link of document.querySelectorAll("[data-nav]")) {
    link.classList.toggle("active", link.dataset.nav === name.replace("-detail", "").replace("event", "schedules").replace("run", "runs"));
  }
}

function bindScheduleSortHeaders() {
  if (scheduleSortBound || !schedulesTable) {
    return;
  }
  scheduleSortBound = true;

  for (const header of schedulesTable.querySelectorAll("th.sortable")) {
    header.addEventListener("click", () => {
      const column = header.dataset.sort;
      if (!column) {
        return;
      }
      scheduleSort = nextScheduleSort(scheduleSort, column);
      renderSchedulesTable();
    });
  }
}

function updateScheduleSortHeaders() {
  if (!schedulesTable) {
    return;
  }

  for (const header of schedulesTable.querySelectorAll("th.sortable")) {
    const column = header.dataset.sort;
    const indicator = header.querySelector(".sort-indicator");
    if (!column || !indicator) {
      continue;
    }

    if (column === scheduleSort.column) {
      header.setAttribute(
        "aria-sort",
        scheduleSort.direction === "asc" ? "ascending" : "descending",
      );
      indicator.textContent = scheduleSort.direction === "asc" ? "▲" : "▼";
    } else {
      header.setAttribute("aria-sort", "none");
      indicator.textContent = "";
    }
  }
}

function renderSchedulesTable() {
  const table = schedulesTable;
  const tbody = table.querySelector("tbody");
  const empty = document.getElementById("schedules-empty");
  tbody.innerHTML = "";

  const events = sortScheduleEvents(cachedScheduleEvents, scheduleSort);
  updateScheduleSortHeaders();

  if (!events.length) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  for (const event of events) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${event.agentId}</td>
      <td class="${statusClass(event.status)}">${event.status}</td>
      <td>${scheduleLabel(event)}</td>
      <td>${fmt(event.fireAt)}</td>
      <td>${event.model}</td>
      <td>${excerpt(event.prompt)}</td>`;
    row.addEventListener("click", () => {
      location.hash = `event/${event.id}`;
      render();
    });
    tbody.appendChild(row);
  }
}

async function loadAgents() {
  const body = await fetchJson(`${API}/agents`);
  const current = agentFilter.value;
  agentFilter.innerHTML = '<option value="">All agents</option>';
  for (const agent of body.agents) {
    const option = document.createElement("option");
    option.value = agent.agentId;
    option.textContent = agent.name ? `${agent.name} (${agent.agentId})` : agent.agentId;
    agentFilter.appendChild(option);
  }
  agentFilter.value = current;
}

async function loadSchedules() {
  bindScheduleSortHeaders();

  const query = buildEventsQuery({
    agentId: agentFilter.value,
    status: scheduleStatusFilter.value,
  });
  const body = await fetchJson(`${API}/events${query}`);
  cachedScheduleEvents = body.events;
  renderSchedulesTable();
}

async function loadRuns() {
  const params = new URLSearchParams();
  if (agentFilter.value) params.set("agentId", agentFilter.value);
  const body = await fetchJson(`${API}/runs?${params.toString()}`);
  const table = document.getElementById("runs-table");
  const tbody = table.querySelector("tbody");
  const empty = document.getElementById("runs-empty");
  tbody.innerHTML = "";

  if (!body.runs.length) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    scheduleAutoRefresh([]);
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");
  scheduleAutoRefresh(body.runs);

  for (const run of body.runs) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${run.agentId}</td>
      <td>${fmt(run.scheduledFor)}</td>
      <td class="${statusClass(run.status)}">${run.status}</td>
      <td>${duration(run.startedAt, run.finishedAt)}</td>
      <td class="${deliveryHintClass(run.deliveryHint)}">${deliveryHintLabel(run.deliveryHint)}</td>
      <td>${excerpt(run.prompt)}</td>`;
    row.addEventListener("click", () => {
      location.hash = `run/${run.id}`;
      render();
    });
    tbody.appendChild(row);
  }
}

async function loadEventDetail(id) {
  const body = await fetchJson(`${API}/events/${encodeURIComponent(id)}`);
  const event = body.event;
  document.getElementById("event-meta").textContent =
    `${event.agentId} · ${event.status} · ${event.model} · next ${fmt(event.fireAt)} · ${scheduleLabel(event)}`;
  document.getElementById("event-prompt").textContent = event.prompt;

  const table = document.getElementById("event-runs-table");
  const tbody = table.querySelector("tbody");
  const empty = document.getElementById("event-runs-empty");
  tbody.innerHTML = "";

  if (!body.recentRuns.length) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  for (const run of body.recentRuns) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${fmt(run.scheduledFor)}</td>
      <td class="${statusClass(run.status)}">${run.status}</td>
      <td>${run.attempt}</td>
      <td class="${deliveryHintClass(run.deliveryHint)}">${deliveryHintLabel(run.deliveryHint)}</td>
      <td>${excerpt(run.transcript || run.error || "", 80)}</td>`;
    row.addEventListener("click", () => {
      location.hash = `run/${run.id}`;
      render();
    });
    tbody.appendChild(row);
  }
}

async function loadRunDetail(id) {
  const body = await fetchJson(`${API}/runs/${encodeURIComponent(id)}`);
  const { run, event } = body;
  document.getElementById("run-meta").textContent =
    `${event.agentId} · ${run.status} · model ${run.model} · attempt ${run.attempt} · scheduled ${fmt(run.scheduledFor)} · started ${fmt(run.startedAt)} · finished ${fmt(run.finishedAt)}`;
  const deliveryEl = document.getElementById("run-delivery");
  deliveryEl.textContent = `Delivery: ${deliveryHintLabel(run.deliveryHint)}`;
  deliveryEl.className = `meta delivery ${deliveryHintClass(run.deliveryHint)}`;
  if (event.deliverTo?.channel) {
    deliveryEl.textContent += ` · fallback ${event.deliverTo.channel}${event.deliverTo.threadId ? `:${event.deliverTo.threadId}` : ""}`;
  }
  if (event.internalOnly) {
    deliveryEl.textContent += " · internal only";
  }
  document.getElementById("run-prompt").textContent = event.prompt;
  document.getElementById("run-transcript").textContent = run.transcript || "(empty transcript)";
  const errorBlock = document.getElementById("run-error");
  if (run.error) {
    errorBlock.textContent = run.error;
    errorBlock.classList.remove("hidden");
  } else {
    errorBlock.classList.add("hidden");
  }
  document.getElementById("run-parent-link").innerHTML =
    `Parent schedule: <a href="#event/${event.id}">${event.id}</a>`;
}

function scheduleAutoRefresh(runs) {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
  if (runs.some((run) => run.status === "running")) {
    autoRefreshTimer = setInterval(() => {
      if (parseHash().view === "runs") {
        render().catch(console.error);
      }
    }, REFRESH_MS);
  }
}

async function render() {
  const route = parseHash();
  statusLine.textContent = "Loading…";
  try {
    await loadAgents();
    if (route.view === "schedules") {
      showView("schedules");
      await loadSchedules();
    } else if (route.view === "runs") {
      showView("runs");
      await loadRuns();
    } else if (route.view === "event-detail" && route.id) {
      showView("event-detail");
      await loadEventDetail(route.id);
    } else if (route.view === "run-detail" && route.id) {
      showView("run-detail");
      await loadRunDetail(route.id);
    } else {
      location.hash = "schedules";
      return render();
    }
    statusLine.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    statusLine.textContent = error instanceof Error ? error.message : "Load failed";
  }
}

refreshBtn.addEventListener("click", () => {
  render().catch(console.error);
});
agentFilter.addEventListener("change", () => {
  render().catch(console.error);
});
scheduleStatusFilter.addEventListener("change", () => {
  render().catch(console.error);
});
window.addEventListener("hashchange", () => {
  render().catch(console.error);
});

render().catch(console.error);
