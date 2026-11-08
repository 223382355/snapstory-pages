(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    photo: null,
    exif: {},
    story: "",
    style: "文艺",
    recipe: null,
    pageUrl: ""
  };

  // ---------------- 通用 UI ----------------
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function setStep(step) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    if (step === "result") {
      $("panel-result").classList.add("active");
    } else {
      $(`panel-${step}`).classList.add("active");
    }
    document.querySelectorAll(".step-dot").forEach((dot) => {
      const n = Number(dot.dataset.step);
      dot.classList.toggle("active", step === "result" ? true : n <= step);
    });
  }

  const loadingTexts = [
    "正在看看这张照片…",
    "正在想想今天的故事…",
    "正在挑一句温柔的话…",
    "正在把照片放进画框…",
    "正在写下祝福…",
    "快好了，再等一下下…"
  ];
  let loadingTimer = null;

  function showLoading(on) {
    $("loading").classList.toggle("hidden", !on);
  }
  function startLoading() {
    let i = 0;
    $("loading-text").textContent = loadingTexts[0];
    clearInterval(loadingTimer);
    loadingTimer = setInterval(() => {
      i = (i + 1) % loadingTexts.length;
      $("loading-text").textContent = loadingTexts[i];
    }, 2300);
  }
  function stopLoading() { clearInterval(loadingTimer); }

  // ---------------- 拍照 / 相册 ----------------
  async function handleFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      toast("请选择一张照片");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast("照片太大了，请换一张");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      state.exif = SnapStory.parseExif(buf);
      const raw = await SnapStory.fileToDataUrl(file);
      const compressed = await SnapStory.compressDataUrl(raw, 1400, 0.86);
      state.photo = compressed;
      $("shot-preview").src = compressed;
      setStep(2);
    } catch (e) {
      console.error(e);
      toast("这张照片打不开，换一张试试");
    }
  }

  $("camera-input").addEventListener("change", (e) => handleFile(e.target.files[0]));
  $("album-input").addEventListener("change", (e) => handleFile(e.target.files[0]));
  $("album-btn").addEventListener("click", () => $("album-input").click());

  // ---------------- 语音转文字 ----------------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let voiceBase = "";
  let voiceFinal = "";

  function setVoiceUI(on) {
    const btn = $("voice-btn");
    btn.classList.toggle("recording", on);
    $("voice-label").textContent = on ? "正在听… 点一下结束" : "点一下，说话";
  }

  function stopVoiceIfListening() {
    if (listening && recognition) {
      try { recognition.stop(); } catch (e) { /* 忽略 */ }
    }
  }

  function initVoice() {
    if (!SpeechRecognition) {
      $("voice-btn").disabled = true;
      $("voice-label").textContent = "当前浏览器不支持网页语音";
      $("voice-tip").textContent = "请点输入框，用键盘上的话筒说话，或直接打字";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      voiceBase = $("story-input").value;
      voiceFinal = "";
      setVoiceUI(true);
      $("voice-tip").textContent = "请说话，说完会自动变成文字";
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) voiceFinal += text;
        else interim += text;
      }
      $("story-input").value = (voiceBase + voiceFinal + interim).slice(0, 200);
    };

    recognition.onerror = (event) => {
      console.warn("语音识别失败：", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        $("voice-tip").textContent = "没有麦克风权限，请在浏览器设置里允许，或直接打字";
      } else if (event.error === "no-speech") {
        $("voice-tip").textContent = "没听清，再点一次说说看";
      } else {
        $("voice-tip").textContent = "语音识别没成功，请直接打字或用键盘上的话筒";
      }
    };

    recognition.onend = () => {
      listening = false;
      setVoiceUI(false);
      if (voiceFinal) {
        $("voice-tip").textContent = "已转成文字，可以修改";
      } else if (!$("voice-tip").textContent.includes("权限") && !$("voice-tip").textContent.includes("没成功")) {
        $("voice-tip").textContent = "没听清，再点一次说说看";
      }
    };

    $("voice-btn").addEventListener("click", () => {
      if (listening) {
        stopVoiceIfListening();
        return;
      }
      voiceBase = $("story-input").value;
      voiceFinal = "";
      try {
        recognition.start();
      } catch (e) {
        try { recognition.stop(); } catch (e2) { /* 忽略 */ }
      }
    });
  }

  initVoice();

  // ---------------- 文字 ----------------
  $("skip-story").addEventListener("click", () => {
    stopVoiceIfListening();
    state.story = "";
    $("story-input").value = "";
    setStep(3);
  });
  $("next-story").addEventListener("click", () => {
    stopVoiceIfListening();
    state.story = $("story-input").value.trim();
    setStep(3);
  });

  // ---------------- 风格 ----------------
  const styleCards = document.querySelectorAll(".style-card");
  function selectStyle(style) {
    state.style = style;
    SnapStory.setCurrentStyle(style);
    styleCards.forEach((c) => c.classList.toggle("selected", c.dataset.style === style));
  }
  styleCards.forEach((card) => {
    card.addEventListener("click", () => selectStyle(card.dataset.style));
  });
  selectStyle("文艺");

  // ---------------- 生成 ----------------
  const posterCanvas = document.createElement("canvas");

  function normalizeTitle(title, style) {
    let t = String(title || "").replace(/[《》“”"'。，、！？!?：:\-—\s]/g, "");
    if (Array.from(t).length < 2 || Array.from(t).length > 10) {
      t = SnapStory.FALLBACK_TITLES[style] || "美好时光";
    }
    return t;
  }

  async function generate() {
    if (!state.photo) { setStep(1); return; }
    SnapStory.setCurrentStyle(state.style);
    showLoading(true);
    startLoading();
    try {
      const captured = state.exif.date || new Date();
      const oldPhoto = Math.abs(Date.now() - captured.getTime()) > 24 * 3600 * 1000;
      const coords = state.exif.gps || await SnapStory.getCoords(3500);

      const [pw, ai] = await Promise.all([
        SnapStory.resolvePlaceWeather(coords, oldPhoto),
        SnapStory.analyzePhoto(state.photo, state.story)
      ]);

      const a = ai.analysis;
      const recipe = {
        id: SnapStory.newId(),
        syncKey: SnapStory.newSyncKey(),
        style: state.style,
        photo: state.photo,
        dateText: SnapStory.formatDateCN(captured),
        weather: oldPhoto ? "" : (pw.weather || ""),
        location: pw.place || a.locationGuess || "",
        title: normalizeTitle(a.title, state.style),
        caption: a.caption || SnapStory.FALLBACK_CAPTIONS[state.style],
        event: a.event || "今天的好光景",
        scene: a.scene || "",
        emotion: a.emotion || "",
        keywords: a.keywords || [],
        blessing: a.blessing || SnapStory.FALLBACK_BLESSINGS[state.style],
        story: state.story,
        comments: [],
        createdAt: Date.now(),
        aiUsed: !!ai.aiUsed
      };

      await showResult(recipe, ai);
    } catch (e) {
      console.error(e);
      toast("生成失败，请再试一次");
    } finally {
      stopLoading();
      showLoading(false);
    }
  }

  // ---------------- 家人留言同步 ----------------
  let stopCommentSync = null;
  let refreshTimer = null;

  function commentSignature(c) {
    return `${Number(c.at) || 0}|${c.name || ""}|${c.content || ""}`;
  }

  function mergeComments(recipe, incoming) {
    recipe.comments = Array.isArray(recipe.comments) ? recipe.comments : [];
    const seen = new Set(recipe.comments.map(commentSignature));
    let added = 0;
    (incoming || []).forEach((c) => {
      if (!c || !c.content) return;
      const comment = {
        name: String(c.name || "家人").slice(0, 12),
        content: String(c.content).slice(0, 200),
        at: Number(c.at) || Date.now()
      };
      const sig = commentSignature(comment);
      if (seen.has(sig)) return;
      seen.add(sig);
      recipe.comments.push(comment);
      added += 1;
    });
    recipe.comments.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    return added;
  }

  function schedulePosterRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!state.recipe) return;
      try {
        await SnapStory.renderPoster(posterCanvas, state.recipe);
        const dataUrl = posterCanvas.toDataURL("image/jpeg", 0.92);
        $("poster-img").src = dataUrl;
        $("download").href = dataUrl;
      } catch (e) {
        console.warn("更新海报失败：", e);
      }
    }, 220);
  }

  function startCommentSync(recipe) {
    if (stopCommentSync) {
      stopCommentSync();
      stopCommentSync = null;
    }
    const note = $("sync-note");
    const key = recipe.syncKey;
    if (!key || !window.SnapSync) {
      note.textContent = "这张海报是旧链接，留言只保存在家人手机上";
      return;
    }

    note.textContent = "家人留言会自动出现在海报上";
    SnapSync.fetchAll(key).then((list) => {
      if (mergeComments(recipe, list)) {
        SnapStory.updatePoster(recipe);
        schedulePosterRefresh();
      }
    }).catch(() => { /* 忽略，实时通道仍会尝试 */ });

    stopCommentSync = SnapSync.subscribe(key, (c) => {
      if (mergeComments(recipe, [c])) {
        SnapStory.updatePoster(recipe);
        schedulePosterRefresh();
        toast(`${c.name || "家人"} 留言了`);
      }
    }, (status) => {
      if (status === "open") {
        note.textContent = "已连接，家人留言会自动出现";
      } else if (status === "error") {
        note.textContent = "实时同步暂不可用，家人可以复制留言发给您";
      }
    });
  }

  async function showResult(recipe, ai) {
    state.recipe = recipe;
    await SnapStory.renderPoster(posterCanvas, recipe);

    const dataUrl = posterCanvas.toDataURL("image/jpeg", 0.92);
    $("poster-img").src = dataUrl;
    $("download").href = dataUrl;

    const pageUrl = SnapStory.pageUrlFor(recipe);
    state.pageUrl = pageUrl;
    const qr = SnapStory.makeQrCanvas(pageUrl, 560);
    $("qr-img").src = qr.toDataURL("image/png");
    $("page-link").href = pageUrl;

    renderInsight(recipe, ai);
    const ok = SnapStory.savePoster(recipe);
    if (!ok) toast("本机存储空间不足，留言页可能打不开");

    setStep("result");
    startCommentSync(recipe);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderInsight(recipe, ai) {
    const box = $("insight");
    const parts = [];
    if (recipe.scene) parts.push(`<p><span>画面</span>${escapeHtml(recipe.scene)}</p>`);
    if (recipe.emotion) parts.push(`<p><span>情绪</span>${escapeHtml(recipe.emotion)}</p>`);
    if (recipe.keywords && recipe.keywords.length) {
      parts.push(`<p><span>关键词</span>${recipe.keywords.map((k) => `<b>${escapeHtml(k)}</b>`).join("")}</p>`);
    }
    const note = ai && ai.aiUsed
      ? "AI 已识别照片并生成文案"
      : `未使用 AI${ai && ai.reason ? `（${escapeHtml(ai.reason)}）` : ""}，已用本地模板`;
    box.innerHTML = `<div class="insight-head">${note}</div>${parts.join("")}`;
    box.classList.toggle("hidden", parts.length === 0);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  $("generate-btn").addEventListener("click", generate);

  // ---------------- 结果操作 ----------------
  $("share").addEventListener("click", async () => {
    const url = state.pageUrl;
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "拍拍故事", text: "给你做了一张海报，点开看看", url });
        return;
      } catch (e) { /* 用户取消 */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("链接已复制，发给家人吧");
    } catch (e) {
      window.prompt("复制这个链接发给家人：", url);
    }
  });

  $("download").addEventListener("click", () => {
    toast("正在保存，若没反应请长按海报保存");
  });

  $("again").addEventListener("click", () => {
    if (stopCommentSync) {
      stopCommentSync();
      stopCommentSync = null;
    }
    clearTimeout(refreshTimer);
    stopVoiceIfListening();
    state.photo = null;
    state.exif = {};
    state.story = "";
    state.recipe = null;
    state.pageUrl = "";
    $("story-input").value = "";
    $("voice-tip").textContent = "说完会自动变成文字，可以再改";
    $("shot-preview").removeAttribute("src");
    $("camera-input").value = "";
    $("album-input").value = "";
    selectStyle("文艺");
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------------- AI 设置 ----------------
  function updateAiHint() {
    const cfg = SnapStory.getConfig();
    const ok = !!(cfg.key && cfg.model);
    $("ai-hint").textContent = ok
      ? "已配置 AI：会用火山方舟识别照片内容。"
      : "未配置 AI 时会使用本地模板文案；点右上角 AI 可以配置。";
  }

  $("ai-btn").addEventListener("click", () => {
    const cfg = SnapStory.getConfig();
    $("ark-key").value = cfg.key || "";
    $("ark-model").value = cfg.model || "";
    $("ai-modal").classList.remove("hidden");
  });

  $("ai-save").addEventListener("click", () => {
    const key = $("ark-key").value.trim();
    const model = $("ark-model").value.trim();
    SnapStory.setConfig({ key, model });
    updateAiHint();
    $("ai-modal").classList.add("hidden");
    toast(key && model ? "AI 已开启" : "已保存，未填写时用本地模板");
  });

  $("ai-clear").addEventListener("click", () => {
    SnapStory.setConfig({});
    $("ark-key").value = "";
    $("ark-model").value = "";
    updateAiHint();
    toast("已清除 AI 设置");
  });

  // ---------------- 帮助 ----------------
  $("help-btn").addEventListener("click", () => $("help-modal").classList.remove("hidden"));
  $("help-close").addEventListener("click", () => $("help-modal").classList.add("hidden"));

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });

  updateAiHint();
  setStep(1);
})();
