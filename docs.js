// unocode docs: one page per hash (#/permissions), built from the <section data-page>
// blocks in docs.html. Also runs the play-through diagrams, the rule tester and search.

const pages = [...document.querySelectorAll("section[data-page]")];
const links = [...document.querySelectorAll(".ngroup a")];
const order = links.map((a) => a.getAttribute("href").slice(2));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function show(id) {
  if (!pages.some((p) => p.dataset.page === id)) id = "overview";
  for (const p of pages) p.classList.toggle("on", p.dataset.page === id);
  for (const a of links) a.classList.toggle("on", a.getAttribute("href") === "#/" + id);
  const page = pages.find((p) => p.dataset.page === id);
  const h1 = page.querySelector("h1").textContent;
  document.title = /docs$/i.test(h1) ? h1 : h1 + " · uno docs";

  // On this page
  const otp = document.querySelector(".otp .list");
  otp.innerHTML = "";
  page.querySelectorAll("h2").forEach((h, i) => {
    h.id ||= id + "-" + i;
    const a = document.createElement("a");
    a.href = "#/" + id;
    a.textContent = h.textContent;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    otp.append(a);
  });

  // Previous and next
  let pn = page.querySelector(".pn");
  if (!pn) {
    pn = document.createElement("nav");
    pn.className = "pn";
    page.append(pn);
  }
  const i = order.indexOf(id);
  const label = (n) => links[n].childNodes[0].textContent.trim();
  pn.replaceChildren();
  if (i > 0) pn.append(link(order[i - 1], "← PREVIOUS", label(i - 1)));
  if (i < order.length - 1) pn.append(link(order[i + 1], "NEXT →", label(i + 1), "next"));

  page.querySelectorAll("svg").forEach(restart);
  window.scrollTo(0, 0);
  document.querySelector(".dnav").classList.remove("open");
}

// A link to a docs page, built as text so a title can never turn into markup.
function link(id, small, text, cls) {
  const a = document.createElement("a");
  a.href = "#/" + id;
  if (cls) a.className = cls;
  const s = document.createElement("small");
  s.textContent = small;
  a.append(s, text);
  return a;
}

function route() {
  show(location.hash.replace(/^#\/?/, "") || "overview");
}
addEventListener("hashchange", route);

// SVG animations: restart when shown, frozen when the reader asks for less motion.
function restart(svg) {
  if (!svg.setCurrentTime) return;
  svg.setCurrentTime(0);
  if (reduced) svg.pauseAnimations();
  else svg.unpauseAnimations();
}
for (const b of document.querySelectorAll("[data-replay]")) {
  b.addEventListener("click", () => {
    const svg = b.closest(".fig").querySelector("svg");
    svg.unpauseAnimations();
    svg.setCurrentTime(0);
  });
}

// Play-through diagrams: each .ln in the terminal is one step; data-hl names the nodes
// and edges to light, data-say the sentence under the diagram.
for (const fig of document.querySelectorAll(".stepper")) {
  const lines = [...fig.querySelectorAll(".term .ln")];
  const say = fig.querySelector(".steptext");
  const play = fig.querySelector("[data-play]");
  const next = fig.querySelector("[data-next]");
  const reset = fig.querySelector("[data-reset]");
  let n = 0;
  let timer = null;

  function paint() {
    lines.forEach((l, i) => l.classList.toggle("on", i < n));
    fig.querySelectorAll(".lit").forEach((e) => e.classList.remove("lit"));
    const cur = lines[n - 1];
    if (cur) {
      for (const key of (cur.dataset.hl || "").split(" ").filter(Boolean)) {
        fig.querySelectorAll(`[data-k="${key}"]`).forEach((e) => e.classList.add("lit"));
      }
      say.innerHTML = cur.dataset.say || "";
    } else {
      say.innerHTML = fig.dataset.intro || "";
    }
    next.disabled = n >= lines.length;
  }
  function step() {
    if (n < lines.length) n++;
    paint();
    if (n >= lines.length) stop();
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = "▶ PLAY";
  }
  play.addEventListener("click", () => {
    if (timer) return stop();
    if (n >= lines.length) n = 0;
    play.textContent = "❚❚ PAUSE";
    step();
    timer = setInterval(step, 1900);
  });
  next.addEventListener("click", () => {
    stop();
    step();
  });
  reset.addEventListener("click", () => {
    stop();
    n = 0;
    paint();
  });
  paint();
}

// Permission modes
const modeTable = {
  default: ["go", "ask", "go", "ask", "Everyday work; the chat starts here. Reading is free and sandboxed commands run, but every file change asks you."],
  "accept-edits": ["go", "go", "go", "ask", "You will review the diff and undo if needed. Edits inside the project go ahead. Headless runs start here."],
  plan: ["go", "no", "no", "no", "Read and think. No commands run, and the one file Uno may write is its plan, .uno/plan.md. MCP calls and web fetches still ask."],
  bypass: ["go", "go", "go", "go", "Folders you trust completely. Nothing asks, but deny rules still hold."],
};
const word = { go: "goes ahead", ask: "asks you", no: "refused" };
const modes = document.querySelector("#modes");
if (modes) {
  const cells = modes.querySelectorAll(".matrix div");
  const desc = modes.querySelector(".mdesc");
  const set = (m) => {
    modes.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === m));
    modeTable[m].slice(0, 4).forEach((v, i) => {
      cells[i].className = "v-" + v;
      cells[i].querySelector("b").textContent = word[v];
    });
    desc.textContent = modeTable[m][4];
  };
  modes.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => set(b.dataset.mode)));
  set("default");
}

// Rule tester: deny beats ask beats allow; a rule `tool(prefix)` matches calls whose
// argument starts with the prefix, and `tool` alone matches every call of that tool.
const rules = {
  allow: ["bash(cargo test)", "bash(npm run lint)", "web_fetch(docs.rs)"],
  ask: ["bash(git commit)"],
  deny: ["bash(git push)", "bash(rm -rf)", "web_fetch(*.internal)"],
};
function matches(rule, tool, arg) {
  const m = rule.match(/^([\w]+)(?:\((.*)\))?$/);
  if (!m || m[1] !== tool) return false;
  if (m[2] === undefined) return true;
  if (m[2].startsWith("*.")) return arg.endsWith(m[2].slice(1));
  return arg === m[2] || arg.startsWith(m[2] + " ");
}
const tester = document.querySelector("#tester");
if (tester) {
  const out = tester.querySelector(".verdict");
  const pick = (b) => {
    tester.querySelectorAll(".calls button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    const [tool, arg] = [b.dataset.tool, b.dataset.arg];
    for (const kind of ["deny", "ask", "allow"]) {
      const hit = rules[kind].find((r) => matches(r, tool, arg));
      if (hit) {
        const says = {
          deny: "Refused, in every mode, even bypass. The model is told why.",
          ask: "Uno asks you, even in accept-edits mode.",
          allow: "Runs without a question.",
        }[kind];
        out.className = "verdict " + kind;
        out.innerHTML = `<b>${kind.toUpperCase()}</b> matched <code>${hit}</code>. ${says}`;
        return;
      }
    }
    const fallback = {
      read: ["allow", "No rule matched. Reading inside the project is always allowed."],
      bash: ["allow", "No rule matched, and the sandbox is on, so the command runs inside it without a question. Asking to leave the sandbox would ask you."],
      edit: ["ask", "No rule matched, so the mode decides: default mode asks, accept-edits goes ahead, plan refuses."],
    }[tool] || ["ask", "No rule matched, so Uno asks you. Press a to allow this site for the session."];
    out.className = "verdict " + fallback[0];
    out.innerHTML = `<b>${fallback[0].toUpperCase()}</b> ${fallback[1]}`;
  };
  tester.querySelectorAll(".calls button").forEach((b) => b.addEventListener("click", () => pick(b)));
  pick(tester.querySelector(".calls button"));
}

// Context window and compaction bars, driven by a turn slider.
const ctx = document.querySelector("#ctxsim");
if (ctx) {
  const range = ctx.querySelector("input");
  const bar = ctx.querySelector(".track");
  const label = ctx.querySelector(".turnlabel");
  const note = ctx.querySelector(".ctxnote");
  const W = 200; // window, thousands of tokens
  const render = () => {
    const t = +range.value;
    // Every turn adds about 5k of messages and 12k of tool output.
    let msgs = 5 * t;
    let tools = 12 * t;
    let sum = 0;
    let phase = "Growing. Everything before the newest message is cached.";
    const fixed = 6 + 3; // system prompt + tools, then instructions
    if (fixed + msgs + tools > W * 0.9) {
      // Stage one: old tool output pruned.
      tools = Math.min(tools, 30);
      phase = "Stage one: old tool output is pruned. The newest results stay.";
      if (fixed + msgs + tools > W * 0.9) {
        sum = 8;
        msgs = 3;
        tools = 10;
        phase = "Stage two: everything after your first message becomes one sectioned summary, plus the current text of up to five recently touched files.";
      }
    }
    const pct = (k) => (100 * k) / W + "%";
    bar.querySelector(".sys").style.width = pct(6);
    bar.querySelector(".ins").style.width = pct(3);
    bar.querySelector(".sum").style.width = pct(sum);
    bar.querySelector(".msg").style.width = pct(msgs);
    bar.querySelector(".tool").style.width = pct(tools);
    label.textContent = "turn " + t;
    note.textContent = phase;
  };
  range.addEventListener("input", render);
  render();
}

// Cookbook filters
const filters = document.querySelector(".filters");
if (filters) {
  filters.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filters.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    for (const r of document.querySelectorAll(".recipe")) {
      r.hidden = b.dataset.f !== "all" && !r.dataset.tags.split(" ").includes(b.dataset.f);
    }
  });
}

// Search over page titles and text.
const input = document.querySelector(".search input");
const results = document.querySelector(".results");
const index = pages.map((p) => ({
  id: p.dataset.page,
  title: p.querySelector("h1").textContent,
  crumb: p.querySelector(".crumb")?.textContent || "",
  text: p.textContent.toLowerCase(),
}));
input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  results.innerHTML = "";
  if (!q) return;
  const hits = index
    .map((p) => ({ p, score: (p.title.toLowerCase().includes(q) ? 10 : 0) + (p.text.split(q).length - 1) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  results.replaceChildren();
  for (const h of hits) {
    const a = link(h.p.id, h.p.crumb, h.p.title);
    a.append(a.firstChild); // the crumb goes under the title
    results.append(a);
  }
  if (!hits.length) {
    const none = document.createElement("div");
    none.className = "none";
    none.textContent = `Nothing for “${q}”`;
    results.append(none);
  }
});
results.addEventListener("click", () => {
  input.value = "";
  results.innerHTML = "";
});
addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
});
document.querySelector(".navtoggle").addEventListener("click", () => {
  document.querySelector(".dnav").classList.toggle("open");
});

// Copy buttons on code blocks
for (const pre of document.querySelectorAll(".page pre")) {
  const b = document.createElement("button");
  b.className = "copy";
  b.textContent = "COPY";
  b.style.cssText = "float:right;margin:-6px -8px 0 8px";
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector("code").textContent);
      b.textContent = "COPIED";
    } catch {
      b.textContent = "SELECT";
    }
    setTimeout(() => (b.textContent = "COPY"), 1600);
  });
  pre.prepend(b);
}

route();
