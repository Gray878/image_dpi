(function () {
  "use strict";

  var state = {
    file: null,
    arrayBuffer: null,
    objectUrl: null,
    image: null,
    format: null,
    dpi: null,
    convertedBlob: null
  };

  var heroSection = document.querySelector(".hero-section");
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var pickButton = document.getElementById("pickButton");
  var pasteShortcut = document.getElementById("pasteShortcut");
  var pasteModifierKey = document.getElementById("pasteModifierKey");
  var uploadEmpty = document.getElementById("uploadEmpty");
  var uploadPreview = document.getElementById("uploadPreview");
  var previewImage = document.getElementById("previewImage");
  var reportPreview = document.getElementById("reportPreview");
  var reportFileName = document.getElementById("reportFileName");
  var resultPanel = document.getElementById("resultPanel");
  var fileName = document.getElementById("fileName");
  var fileNote = document.getElementById("fileNote");
  var statusLine = document.getElementById("statusLine");
  var dimensionValue = document.getElementById("dimensionValue");
  var fileSizeValue = document.getElementById("fileSizeValue");
  var formatValue = document.getElementById("formatValue");
  var dpiValue = document.getElementById("dpiValue");
  var beforeDpi = document.getElementById("beforeDpi");
  var afterDpi = document.getElementById("afterDpi");
  var tableAfterDpi = document.getElementById("tableAfterDpi");
  var pixelTruth = document.getElementById("pixelTruth");
  var print72 = document.getElementById("print72");
  var print150 = document.getElementById("print150");
  var print300 = document.getElementById("print300");
  var print600 = document.getElementById("print600");
  var printTarget = document.getElementById("printTarget");
  var targetPrintLabel = document.getElementById("targetPrintLabel");
  var bar72 = document.getElementById("bar72");
  var bar150 = document.getElementById("bar150");
  var bar300 = document.getElementById("bar300");
  var bar600 = document.getElementById("bar600");
  var barTarget = document.getElementById("barTarget");
  var dpiInput = document.getElementById("dpiInput");
  var downloadButton = document.getElementById("downloadButton");
  var resetButton = document.getElementById("resetButton");
  var presetButtons = Array.prototype.slice.call(document.querySelectorAll(".dpi-preset"));
  var turnstileSiteKeyMeta = document.querySelector("meta[name='turnstile-site-key']");
  var turnstileSiteKey = turnstileSiteKeyMeta ? turnstileSiteKeyMeta.content.trim() : "";
  var turnstilePanel = document.getElementById("turnstilePanel");
  var turnstileWidget = document.getElementById("turnstileWidget");
  var turnstileState = {
    required: Boolean(turnstileSiteKey),
    loading: false,
    failed: false,
    widgetId: null,
    token: ""
  };

  function initPointerEffects() {
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)");
    if (!heroSection || reducedMotion.matches || coarsePointer.matches) return;

    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");
    if (!context) return;

    canvas.className = "hero-grid-canvas";
    canvas.setAttribute("aria-hidden", "true");
    heroSection.insertBefore(canvas, heroSection.firstChild);
    heroSection.classList.add("has-grid-canvas");

    var pointer = {
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
      influence: 0,
      targetInfluence: 0
    };
    var animationFrame = 0;
    var canvasWidth = 0;
    var canvasHeight = 0;
    var pixelRatio = 1;

    function resizeGridCanvas() {
      var rect = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvasWidth = Math.max(1, Math.round(rect.width));
      canvasHeight = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(canvasWidth * pixelRatio);
      canvas.height = Math.round(canvasHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!pointer.targetX && !pointer.targetY) {
        pointer.targetX = canvasWidth / 2;
        pointer.targetY = canvasHeight * 0.42;
        pointer.currentX = pointer.targetX;
        pointer.currentY = pointer.targetY;
      }

      drawGrid();
    }

    function warpPoint(x, y) {
      if (pointer.influence < 0.01) return { x: x, y: y };

      var dx = x - pointer.currentX;
      var dy = y - pointer.currentY;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      var radius = Math.min(260, Math.max(150, canvasWidth * 0.2));
      var falloff = Math.exp(-(distance * distance) / (radius * radius));
      var pull = falloff * pointer.influence * 28;
      var shear = falloff * pointer.influence * 9;

      return {
        x: x + (dx / distance) * pull - (dy / distance) * shear,
        y: y + (dy / distance) * pull + (dx / distance) * shear
      };
    }

    function drawWarpedLine(startX, startY, endX, endY) {
      var segments = 18;
      context.beginPath();

      for (var index = 0; index <= segments; index += 1) {
        var progress = index / segments;
        var x = startX + (endX - startX) * progress;
        var y = startY + (endY - startY) * progress;
        var warped = warpPoint(x, y);

        if (index === 0) {
          context.moveTo(warped.x, warped.y);
        } else {
          context.lineTo(warped.x, warped.y);
        }
      }

      context.stroke();
    }

    function drawGrid() {
      var spacing = 34;
      var padding = spacing * 2;
      var parallaxX = ((pointer.currentX - canvasWidth / 2) / Math.max(canvasWidth, 1)) * -12 * pointer.influence;
      var parallaxY = ((pointer.currentY - canvasHeight / 2) / Math.max(canvasHeight, 1)) * -8 * pointer.influence;
      var startX = -padding + parallaxX;
      var startY = -padding + parallaxY;

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.lineWidth = 1;
      context.strokeStyle = "rgba(63, 91, 246, 0.105)";

      for (var x = startX; x <= canvasWidth + padding; x += spacing) {
        drawWarpedLine(x, -padding, x, canvasHeight + padding);
      }

      for (var y = startY; y <= canvasHeight + padding; y += spacing) {
        drawWarpedLine(-padding, y, canvasWidth + padding, y);
      }
    }

    function renderPointerEffects() {
      pointer.currentX += (pointer.targetX - pointer.currentX) * 0.22;
      pointer.currentY += (pointer.targetY - pointer.currentY) * 0.22;
      pointer.influence += (pointer.targetInfluence - pointer.influence) * 0.2;
      drawGrid();

      if (
        Math.abs(pointer.targetX - pointer.currentX) > 0.2 ||
        Math.abs(pointer.targetY - pointer.currentY) > 0.2 ||
        Math.abs(pointer.targetInfluence - pointer.influence) > 0.01
      ) {
        animationFrame = window.requestAnimationFrame(renderPointerEffects);
      } else {
        animationFrame = 0;
      }
    }

    function startPointerLoop() {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(renderPointerEffects);
      }
    }

    function deactivatePointer() {
      pointer.targetInfluence = 0;
      startPointerLoop();
    }

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType === "touch") return;
      var rect = canvas.getBoundingClientRect();
      var isInHero =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
      pointer.targetInfluence = isInHero ? 1 : 0;
      startPointerLoop();
    });

    document.addEventListener("pointerleave", deactivatePointer);
    document.addEventListener("pointerout", function (event) {
      if (!event.relatedTarget) deactivatePointer();
    });

    window.addEventListener("blur", deactivatePointer);
    window.addEventListener("resize", resizeGridCanvas);
    resizeGridCanvas();
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var size = bytes;
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return size.toFixed(size >= 10 || index === 0 ? 0 : 1) + " " + units[index];
  }

  function formatDpi(dpi) {
    if (!dpi) return "Not found";
    var same = Math.abs(dpi.x - dpi.y) < 0.2;
    var source = dpi.source ? " " + dpi.source : "";
    if (same) return Math.round(dpi.x) + " DPI" + source;
    return Math.round(dpi.x) + " x " + Math.round(dpi.y) + " DPI" + source;
  }

  function readTargetDpi() {
    var value = Number(dpiInput.value);
    if (!Number.isFinite(value) || value < 1) return null;
    return Math.min(2400, Math.round(value));
  }

  function getTargetDpi() {
    var next = window.DpiTools.clampDpi(dpiInput.value);
    dpiInput.value = String(next);
    return next;
  }

  function printSize(width, height, dpi) {
    if (!width || !height || !dpi) return "-";
    var w = width / dpi;
    var h = height / dpi;
    return w.toFixed(2) + " x " + h.toFixed(2) + " in";
  }

  function setBarWidth(bar, dpi) {
    if (!bar || !state.image || !dpi) {
      if (bar) bar.style.width = "0%";
      return;
    }
    var percent = Math.max(7, Math.min(100, Math.round((72 / dpi) * 100)));
    bar.style.width = percent + "%";
  }

  function baseName(name) {
    return name.replace(/\.[^.]+$/, "");
  }

  function extensionFor(format, fallbackName) {
    var match = fallbackName.match(/\.([a-z0-9]+)$/i);
    return format && format.extension ? format.extension : match ? match[1].toLowerCase() : "img";
  }

  function updatePresetState() {
    var targetValue = readTargetDpi();
    var target = targetValue == null ? "" : String(targetValue);
    presetButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.dpi === target);
    });
  }

  function updatePrintReadout() {
    var target = readTargetDpi();
    if (target == null) {
      afterDpi.textContent = "Target DPI";
      tableAfterDpi.textContent = "Target DPI";
      targetPrintLabel.textContent = "Target";
      printTarget.textContent = "-";
      setBarWidth(barTarget, null);
      updatePresetState();
      return;
    }
    afterDpi.textContent = target + " DPI";
    tableAfterDpi.textContent = target + " DPI";
    targetPrintLabel.textContent = target + " DPI";
    if (!state.image) {
      printTarget.textContent = "-";
      return;
    }
    print72.textContent = printSize(state.image.width, state.image.height, 72);
    print150.textContent = printSize(state.image.width, state.image.height, 150);
    print300.textContent = printSize(state.image.width, state.image.height, 300);
    print600.textContent = printSize(state.image.width, state.image.height, 600);
    printTarget.textContent = printSize(state.image.width, state.image.height, target);
    setBarWidth(bar72, 72);
    setBarWidth(bar150, 150);
    setBarWidth(bar300, 300);
    setBarWidth(bar600, 600);
    setBarWidth(barTarget, target);
  }

  function loadImageSize(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        resolve({ width: image.naturalWidth, height: image.naturalHeight, url: url });
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("The image preview could not be loaded."));
      };
      image.src = url;
    });
  }

  function setStatus(message, tone) {
    statusLine.textContent = message;
    statusLine.dataset.tone = tone || "neutral";
  }

  function renderTurnstile() {
    turnstileState.loading = false;
    if (
      !turnstileState.required ||
      !turnstileWidget ||
      turnstileState.widgetId !== null ||
      !window.turnstile ||
      typeof window.turnstile.render !== "function"
    ) {
      return;
    }

    try {
      var widgetId = window.turnstile.render(turnstileWidget, {
        sitekey: turnstileSiteKey,
        action: "download",
        theme: "light",
        callback: function (token) {
          turnstileState.token = token || "";
          if (state.file) {
            setStatus("Security check passed. You can download the converted image.", "success");
          }
          updateDownloadState();
        },
        "expired-callback": function () {
          turnstileState.token = "";
          if (state.file) {
            setStatus("Security check expired. Complete it again to download.", "neutral");
          }
          updateDownloadState();
        },
        "timeout-callback": function () {
          turnstileState.token = "";
          if (state.file) {
            setStatus("Security check timed out. Try again to download.", "neutral");
          }
          updateDownloadState();
        },
        "error-callback": function () {
          turnstileState.token = "";
          if (state.file) {
            setStatus("Security check could not be completed. Please try again.", "error");
          }
          updateDownloadState();
        }
      });

      if (widgetId == null) throw new Error("Turnstile widget did not render.");
      turnstileState.widgetId = widgetId;
    } catch (error) {
      handleTurnstileLoadError();
    }
  }

  function handleTurnstileLoadError() {
    turnstileState.loading = false;
    turnstileState.failed = true;
    turnstileState.token = "";
    if (state.file) {
      setStatus("Security check could not load. Please refresh the page and try again.", "error");
    }
    updateDownloadState();
  }

  function ensureTurnstile() {
    if (!turnstileState.required || turnstileState.failed || !turnstileWidget || turnstileState.widgetId !== null) {
      return;
    }
    if (window.turnstile && typeof window.turnstile.render === "function") {
      renderTurnstile();
      return;
    }
    if (turnstileState.loading) return;

    turnstileState.loading = true;
    var existingScript = document.querySelector("script[data-turnstile-api='true']");
    if (existingScript) {
      existingScript.addEventListener("load", renderTurnstile, { once: true });
      existingScript.addEventListener("error", handleTurnstileLoadError, { once: true });
      return;
    }

    var script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileApi = "true";
    script.addEventListener("load", renderTurnstile, { once: true });
    script.addEventListener("error", handleTurnstileLoadError, { once: true });
    document.head.appendChild(script);
  }

  function resetTurnstileChallenge() {
    turnstileState.token = "";
    if (
      turnstileState.required &&
      turnstileState.widgetId !== null &&
      window.turnstile &&
      typeof window.turnstile.reset === "function"
    ) {
      window.turnstile.reset(turnstileState.widgetId);
    }
  }

  function isEditableTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function animateResult() {
    if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.gsap.fromTo(
        [".result-dashboard", ".chart-row", ".conversion-table tbody tr"],
        { opacity: 0.35, y: 14 },
        { opacity: 1, y: 0, duration: 0.36, stagger: 0.035, ease: "power2.out" }
      );
    }
  }

  function updateDownloadState() {
    if (!state.file || !state.arrayBuffer || !state.format) {
      downloadButton.disabled = true;
      resetButton.disabled = true;
      if (turnstilePanel) turnstilePanel.hidden = true;
      return;
    }
    var supported = state.format.key === "jpeg" || state.format.key === "png";
    if (turnstilePanel) turnstilePanel.hidden = !supported || !turnstileState.required;
    if (supported) ensureTurnstile();
    downloadButton.disabled = !supported || (turnstileState.required && !turnstileState.token);
    resetButton.disabled = false;
  }

  async function processFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Please choose an image file.", "error");
      return;
    }

    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
    }

    state.file = file;
    state.arrayBuffer = await file.arrayBuffer();
    state.format = window.DpiTools.detectFormat(state.arrayBuffer);

    try {
      state.image = await loadImageSize(file);
      state.objectUrl = state.image.url;
      previewImage.src = state.objectUrl;
      reportPreview.src = state.objectUrl;
      uploadEmpty.classList.add("is-hidden");
      uploadPreview.classList.remove("is-hidden");
      resultPanel.classList.remove("is-hidden");
    } catch (error) {
      state.image = null;
      setStatus(error.message, "error");
    }

    state.dpi = window.DpiTools.parseDpi(state.arrayBuffer, state.format);
    state.convertedBlob = null;
    resetTurnstileChallenge();

    fileName.textContent = file.name;
    reportFileName.textContent = file.name;
    fileNote.textContent = "Loaded locally. Ready for metadata-only DPI conversion.";
    dimensionValue.textContent = state.image ? state.image.width + " x " + state.image.height + " px" : "-";
    fileSizeValue.textContent = formatBytes(file.size);
    formatValue.textContent = state.format.label;
    dpiValue.textContent = formatDpi(state.dpi);
    beforeDpi.textContent = formatDpi(state.dpi);
    pixelTruth.textContent = state.image
      ? state.image.width + " x " + state.image.height + " px before and after conversion."
      : "Pixel dimensions stay unchanged for supported metadata-only conversion.";

    if (!state.dpi) {
      setStatus(
        state.format.key === "jpeg" || state.format.key === "png"
          ? "No stored DPI metadata was found. You can still add a new JPEG or PNG DPI value."
          : "This format can be previewed, but reliable browser-side DPI metadata conversion supports JPEG and PNG.",
        state.format.key === "jpeg" || state.format.key === "png" ? "neutral" : "error"
      );
    } else {
      setStatus("DPI metadata found. Choose a target value and download a converted copy.", "success");
    }

    updatePrintReadout();
    updateDownloadState();
    animateResult();
  }

  function resetTool() {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state = {
      file: null,
      arrayBuffer: null,
      objectUrl: null,
      image: null,
      format: null,
      dpi: null,
      convertedBlob: null
    };
    fileInput.value = "";
    previewImage.removeAttribute("src");
    reportPreview.removeAttribute("src");
    uploadPreview.classList.add("is-hidden");
    uploadEmpty.classList.remove("is-hidden");
    resultPanel.classList.add("is-hidden");
    fileName.textContent = "No file selected";
    reportFileName.textContent = "Image file";
    fileNote.textContent = "Ready to inspect image DPI metadata.";
    dimensionValue.textContent = "-";
    fileSizeValue.textContent = "-";
    formatValue.textContent = "-";
    dpiValue.textContent = "-";
    beforeDpi.textContent = "-";
    tableAfterDpi.textContent = readTargetDpi() ? readTargetDpi() + " DPI" : "Target DPI";
    pixelTruth.textContent = "Upload an image to see the exact pixel dimensions.";
    print72.textContent = "-";
    print150.textContent = "-";
    print300.textContent = "-";
    print600.textContent = "-";
    printTarget.textContent = "-";
    setBarWidth(bar72, null);
    setBarWidth(bar150, null);
    setBarWidth(bar300, null);
    setBarWidth(bar600, null);
    setBarWidth(barTarget, null);
    setStatus("Choose a JPEG or PNG for the most reliable DPI metadata result.", "neutral");
    updateDownloadState();
  }

  function downloadConverted() {
    if (!state.file || !state.arrayBuffer || !state.format) return;
    if (turnstileState.required && !turnstileState.token) {
      setStatus("Complete the security check before downloading.", "error");
      updateDownloadState();
      return;
    }

    var target = getTargetDpi();
    try {
      var outputBuffer = window.DpiTools.setDpi(state.arrayBuffer, state.format, target);
      var blob = new Blob([outputBuffer], { type: state.format.mime });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = baseName(state.file.name) + "-" + target + "dpi." + extensionFor(state.format, state.file.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 500);
      setStatus("Downloaded a copy with updated DPI metadata. Pixel dimensions were not changed.", "success");
      resetTurnstileChallenge();
      updateDownloadState();
      if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.gsap.fromTo(downloadButton, { scale: 0.98 }, { scale: 1, duration: 0.22, ease: "back.out(2)" });
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function handleFiles(files) {
    var file = files && files[0];
    if (file) {
      processFile(file).catch(function (error) {
        setStatus(error.message || "The image could not be processed.", "error");
      });
    }
  }

  function openFileDialog() {
    fileInput.value = "";
    fileInput.click();
  }

  function clipboardImageFile(clipboardData) {
    if (!clipboardData) return null;
    var files = Array.prototype.slice.call(clipboardData.files || []);
    var file = files.find(function (item) {
      return item.type && item.type.startsWith("image/");
    });
    if (file) return file;

    var items = Array.prototype.slice.call(clipboardData.items || []);
    var imageItem = items.find(function (item) {
      return item.type && item.type.startsWith("image/");
    });
    return imageItem ? imageItem.getAsFile() : null;
  }

  async function readClipboardImage() {
    dropZone.focus({ preventScroll: true });
    if (!navigator.clipboard || !navigator.clipboard.read) {
      setStatus("Focus the upload box, copy an image, then press Ctrl/Cmd + V.", "neutral");
      return;
    }

    try {
      var clipboardItems = await navigator.clipboard.read();
      for (var itemIndex = 0; itemIndex < clipboardItems.length; itemIndex += 1) {
        var clipboardItem = clipboardItems[itemIndex];
        var imageType = clipboardItem.types.find(function (type) {
          return type.startsWith("image/");
        });
        if (imageType) {
          var blob = await clipboardItem.getType(imageType);
          var extension = imageType.split("/")[1] || "png";
          handleFiles([new File([blob], "clipboard-image." + extension, { type: imageType })]);
          return;
        }
      }
      setStatus("Clipboard does not contain an image. Copy the image itself, then paste again.", "neutral");
    } catch (error) {
      setStatus("Press Ctrl/Cmd + V now. The browser did not allow direct clipboard access.", "neutral");
    }
  }

  dropZone.addEventListener("click", function () {
    openFileDialog();
  });

  pickButton.addEventListener("click", function () {
    fileInput.value = "";
  });

  dropZone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFileDialog();
    }
  });

  fileInput.addEventListener("change", function () {
    handleFiles(fileInput.files);
  });

  ["dragenter", "dragover"].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", function (event) {
    handleFiles(event.dataTransfer.files);
  });

  window.addEventListener("paste", function (event) {
    var pastedFile = clipboardImageFile(event.clipboardData);
    if (pastedFile) {
      event.preventDefault();
      setStatus("Pasted an image from the clipboard. Reading DPI metadata...", "neutral");
      handleFiles([pastedFile]);
    } else if (!isEditableTarget(event.target)) {
      setStatus("Clipboard does not contain an image. Copy the image itself, then press Ctrl/Cmd + V.", "neutral");
    }
  });

  document.addEventListener("keydown", function (event) {
    var key = event.key ? event.key.toLowerCase() : "";
    if ((event.ctrlKey || event.metaKey) && key === "v" && !isEditableTarget(event.target)) {
      dropZone.focus({ preventScroll: true });
      setStatus("Looking for an image on your clipboard...", "neutral");
    }
  });

  pasteShortcut.addEventListener("click", readClipboardImage);

  pasteShortcut.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      readClipboardImage();
    }
  });

  presetButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      dpiInput.value = button.dataset.dpi;
      updatePresetState();
      updatePrintReadout();
    });
  });

  dpiInput.addEventListener("input", function () {
    updatePresetState();
    updatePrintReadout();
  });

  dpiInput.addEventListener("blur", function () {
    getTargetDpi();
    updatePresetState();
    updatePrintReadout();
  });

  downloadButton.addEventListener("click", downloadConverted);
  resetButton.addEventListener("click", resetTool);

  document.getElementById("year").textContent = String(new Date().getFullYear());
  if (/Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    pasteModifierKey.textContent = "Cmd";
  }
  initPointerEffects();
  updatePrintReadout();
  updateDownloadState();
  window.setTimeout(function () {
    if (document.activeElement === document.body) {
      dropZone.focus({ preventScroll: true });
    }
  }, 250);

  if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.gsap.from(".reveal", {
      opacity: 0,
      y: 18,
      duration: 0.48,
      stagger: 0.055,
      ease: "power2.out"
    });
  }
})();
