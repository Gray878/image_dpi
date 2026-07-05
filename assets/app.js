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

  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
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
      return;
    }
    var supported = state.format.key === "jpeg" || state.format.key === "png";
    downloadButton.disabled = !supported;
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

  dropZone.addEventListener("click", function () {
    fileInput.click();
  });

  dropZone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
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

  document.addEventListener("paste", function (event) {
    var items = Array.prototype.slice.call(event.clipboardData ? event.clipboardData.items : []);
    var imageItem = items.find(function (item) {
      return item.type && item.type.startsWith("image/");
    });
    if (imageItem) {
      var pastedFile = imageItem.getAsFile();
      handleFiles([pastedFile]);
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
  updatePrintReadout();
  updateDownloadState();

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
